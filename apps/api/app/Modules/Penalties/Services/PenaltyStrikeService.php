<?php

namespace App\Modules\Penalties\Services;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Liquidations\Models\PenaltyRecord;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Penalties\Exceptions\PenaltyHoldException;
use App\Modules\Penalties\Models\PenaltyAppeal;
use App\Modules\Penalties\Models\PenaltyStrike;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Shared\Services\PenaltySyncService;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class PenaltyStrikeService
{
    public const STRIKE_LIMIT = 3;
    public const CA_SIGNING_GRACE_DAYS = 3;

    /**
     * Compute the user's current active strike cycle number (1-indexed).
     */
    public function getCurrentCycle(int $userId): int
    {
        $maxApprovedAppealCycle = (int) (PenaltyAppeal::where('user_id', $userId)
            ->where('status', 'approved')
            ->max('cycle_number') ?? 0);

        $maxResetStrikeCycle = (int) (PenaltyStrike::where('user_id', $userId)
            ->where('status', 'reset')
            ->max('cycle_number') ?? 0);

        $maxActiveOrWaivedCycle = (int) (PenaltyStrike::where('user_id', $userId)
            ->whereIn('status', ['active', 'waived'])
            ->max('cycle_number') ?? 1);

        return self::computeCycleFromMax($maxActiveOrWaivedCycle, $maxApprovedAppealCycle, $maxResetStrikeCycle);
    }

    /**
     * Derive cycle number from pre-aggregated max cycle values.
     */
    private static function computeCycleFromMax(
        int $maxActiveOrWaivedCycle,
        int $maxApprovedAppealCycle,
        int $maxResetStrikeCycle
    ): int {
        return max(1, $maxActiveOrWaivedCycle, $maxApprovedAppealCycle + 1, $maxResetStrikeCycle + 1);
    }

    /**
     * Derive standing label from an active strike count.
     */
    public static function resolveStanding(int $activeStrikesCount): string
    {
        if ($activeStrikesCount >= self::STRIKE_LIMIT) {
            return 'penalized';
        }

        if ($activeStrikesCount >= 1) {
            return 'warning';
        }

        return 'clear';
    }

    /**
     * Synchronize automatic compliance strikes for a single user.
     *
     * @return array{created: int}
     */
    public function syncUserStrikes(int $userId, ?Carbon $today = null): array
    {
        $referenceDay = ($today ?? Carbon::now())->copy()->startOfDay();
        $cycle = $this->getCurrentCycle($userId);

        // Automatic triggers fire once per (user, source_module, source_id, trigger_type)
        // so waived or appeal-reset strikes do not immediately re-trigger for the same incident.
        $existingAutoKeys = PenaltyStrike::where('user_id', $userId)
            ->whereIn('trigger_type', ['ca_unsigned_overdue', 'liquidation_overdue'])
            ->get(['source_module', 'source_id', 'trigger_type'])
            ->mapWithKeys(fn (PenaltyStrike $s) => ["{$s->source_module}:{$s->source_id}:{$s->trigger_type}" => true])
            ->all();

        $created = 0;

        // 1. Unsigned disbursed Cash Advances strictly > 3 days after disbursement date
        $unsignedAdvances = CashAdvance::with('disbursement')
            ->where('user_id', $userId)
            ->where('status', 'disbursed')
            ->whereNull('acknowledged_at')
            ->get();

        $signingCutoff = $referenceDay->copy()->subDays(self::CA_SIGNING_GRACE_DAYS);

        foreach ($unsignedAdvances as $advance) {
            $rawDate = $advance->disbursement?->disbursement_date ?? $advance->disbursement?->created_at;
            if (!$rawDate) {
                continue;
            }

            $disbursedDay = Carbon::parse($rawDate)->startOfDay();
            if (!$disbursedDay->lt($signingCutoff)) {
                continue;
            }

            $key = "cash_advance:{$advance->id}:ca_unsigned_overdue";
            if (isset($existingAutoKeys[$key])) {
                continue;
            }

            $daysUnsigned = (int) $disbursedDay->diffInDays($referenceDay, false);
            $this->recordAutomaticStrike(
                userId: $userId,
                cycle: $cycle,
                sourceModule: 'cash_advance',
                sourceId: (int) $advance->id,
                sourceReference: $advance->reference_no,
                triggerType: 'ca_unsigned_overdue',
                reason: "Cash Advance {$advance->reference_no} remained unsigned {$daysUnsigned} days after disbursement (limit: 3 days)."
            );
            $existingAutoKeys[$key] = true;
            $created++;
        }

        // 2. Liquidation overdue past expected_liquidation_date with no active/settled liquidation
        $penaltySync = app(PenaltySyncService::class);
        $overdueAdvances = CashAdvance::with('liquidations')
            ->where('user_id', $userId)
            ->whereIn('status', ['disbursed', 'signed', 'overdue', 'incomplete'])
            ->where('outstanding_balance', '>', 0)
            ->whereNotNull('expected_liquidation_date')
            ->whereDate('expected_liquidation_date', '<', $referenceDay->toDateString())
            ->get();

        foreach ($overdueAdvances as $advance) {
            if ($penaltySync->hasActiveOrSettledLiquidation($advance)) {
                continue;
            }

            $key = "cash_advance:{$advance->id}:liquidation_overdue";
            if (isset($existingAutoKeys[$key])) {
                continue;
            }

            $dueFormatted = Carbon::parse($advance->expected_liquidation_date)->format('M j, Y');
            $this->recordAutomaticStrike(
                userId: $userId,
                cycle: $cycle,
                sourceModule: 'cash_advance',
                sourceId: (int) $advance->id,
                sourceReference: $advance->reference_no,
                triggerType: 'liquidation_overdue',
                reason: "Liquidation for Cash Advance {$advance->reference_no} is overdue (due {$dueFormatted}) with outstanding balance."
            );
            $existingAutoKeys[$key] = true;
            $created++;
        }

        return ['created' => $created];
    }

    /**
     * Synchronize automatic compliance strikes across all users with eligible cash advances.
     *
     * @return array{users_checked: int, strikes_created: int}
     */
    public function syncAllEligibleStrikes(?Carbon $today = null): array
    {
        $referenceDay = ($today ?? Carbon::now())->copy()->startOfDay();
        $signingCutoff = $referenceDay->copy()->subDays(self::CA_SIGNING_GRACE_DAYS);

        $unsignedUserIds = CashAdvance::where('status', 'disbursed')
            ->whereNull('acknowledged_at')
            ->pluck('user_id');

        $overdueUserIds = CashAdvance::whereIn('status', ['disbursed', 'signed', 'overdue', 'incomplete'])
            ->where('outstanding_balance', '>', 0)
            ->whereNotNull('expected_liquidation_date')
            ->whereDate('expected_liquidation_date', '<', $referenceDay->toDateString())
            ->pluck('user_id');

        $userIds = $unsignedUserIds->merge($overdueUserIds)
            ->filter()
            ->unique()
            ->values();

        $strikesCreated = 0;
        foreach ($userIds as $userId) {
            $result = $this->syncUserStrikes((int) $userId, $referenceDay);
            $strikesCreated += $result['created'];
        }

        return [
            'users_checked' => $userIds->count(),
            'strikes_created' => $strikesCreated,
        ];
    }

    /**
     * Assert that the user has fewer than 3 active strikes; otherwise throw PenaltyHoldException (403).
     */
    public function assertUserNotPenalized(int $userId): void
    {
        $this->syncUserStrikes($userId);

        $activeCount = PenaltyStrike::where('user_id', $userId)
            ->where('status', 'active')
            ->count();

        if ($activeCount >= self::STRIKE_LIMIT) {
            throw new PenaltyHoldException(
                'Your account is on a penalty hold due to 3 active compliance strikes. Submit a Compliance Appeal Letter to lift the hold.',
                $activeCount
            );
        }
    }

    /**
     * Build the authenticated user's full penalty & strike summary.
     */
    public function getEmployeeSummary(User $user): array
    {
        $this->syncUserStrikes((int) $user->id);

        $currentCycle = $this->getCurrentCycle((int) $user->id);

        $activeStrikes = PenaltyStrike::where('user_id', $user->id)
            ->where('status', 'active')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        $historyStrikes = PenaltyStrike::where('user_id', $user->id)
            ->whereIn('status', ['waived', 'reset'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        $appeals = PenaltyAppeal::where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        $pendingAppeal = $appeals->first(
            fn (PenaltyAppeal $appeal) => (int) $appeal->cycle_number === $currentCycle && $appeal->status === 'pending'
        );

        $monetaryRecords = PenaltyRecord::with('cashAdvance:id,user_id,created_at')
            ->whereHas('cashAdvance', fn ($q) => $q->where('user_id', $user->id))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        $activeCount = $activeStrikes->count();

        return [
            'active_strikes_count' => $activeCount,
            'strike_limit' => self::STRIKE_LIMIT,
            'standing' => self::resolveStanding($activeCount),
            'is_penalized' => $activeCount >= self::STRIKE_LIMIT,
            'current_cycle' => $currentCycle,
            'active_strikes' => $activeStrikes->values(),
            'history_strikes' => $historyStrikes->values(),
            'appeals' => $appeals->values(),
            'pending_appeal' => $pendingAppeal,
            'overdue_monetary_penalties' => [
                'total_amount' => (float) $monetaryRecords->sum('penalty_amount'),
                'records' => $monetaryRecords->map(fn (PenaltyRecord $rec) => [
                    'id' => (int) $rec->id,
                    'cash_advance_id' => (int) $rec->cash_advance_id,
                    'reference_no' => $rec->cashAdvance?->reference_no ?? ('CA-' . $rec->cash_advance_id),
                    'days_overdue' => (int) $rec->days_overdue,
                    'penalty_amount' => (float) $rec->penalty_amount,
                    'created_at' => $rec->created_at?->toIso8601String(),
                ])->values()->all(),
            ],
        ];
    }

    /**
     * Submit an employee Compliance Appeal Letter with Supabase storage cleanup on DB failure.
     */
    public function submitAppeal(User $user, string $explanation, UploadedFile $letterFile): PenaltyAppeal
    {
        $this->syncUserStrikes((int) $user->id);
        $currentCycle = $this->getCurrentCycle((int) $user->id);

        $activeCount = PenaltyStrike::where('user_id', $user->id)
            ->where('status', 'active')
            ->count();

        if ($activeCount < self::STRIKE_LIMIT) {
            throw ValidationException::withMessages([
                'strikes' => ['A Compliance Appeal Letter can only be submitted once you reach 3 active strikes.'],
            ]);
        }

        $hasPending = PenaltyAppeal::where('user_id', $user->id)
            ->where('cycle_number', $currentCycle)
            ->where('status', 'pending')
            ->exists();

        if ($hasPending) {
            throw new ConflictHttpException('You already have a pending appeal under review for the current cycle.');
        }

        $fileHash = hash_file('sha256', $letterFile->getRealPath());
        $storedPath = $letterFile->store('penalties/appeals', 'supabase');
        if (!is_string($storedPath) || trim($storedPath) === '') {
            throw new \RuntimeException('Failed to store appeal letter file.');
        }

        try {
            return DB::transaction(function () use ($user, $currentCycle, $explanation, $letterFile, $storedPath, $fileHash) {
                $stillPending = PenaltyAppeal::where('user_id', $user->id)
                    ->where('cycle_number', $currentCycle)
                    ->where('status', 'pending')
                    ->lockForUpdate()
                    ->exists();

                if ($stillPending) {
                    throw new ConflictHttpException('You already have a pending appeal under review for the current cycle.');
                }

                $appeal = PenaltyAppeal::create([
                    'user_id' => $user->id,
                    'cycle_number' => $currentCycle,
                    'explanation' => trim($explanation),
                    'letter_file_path' => $storedPath,
                    'letter_file_name' => $letterFile->getClientOriginalName(),
                    'letter_mime_type' => $letterFile->getClientMimeType(),
                    'letter_file_hash' => $fileHash,
                    'status' => 'pending',
                ]);

                AuditLogService::log(
                    actorId: (int) $user->id,
                    actorRole: $user->role ?? 'employee',
                    actionType: 'PENALTY_APPEAL_SUBMITTED',
                    entityType: 'penalty_appeal',
                    entityId: (int) $appeal->id,
                    beforeState: null,
                    afterState: $appeal->toArray()
                );

                $this->safeNotify(function () use ($user, $appeal) {
                    NotificationService::notifyAdmins(
                        type: 'admin_penalty_appeal_submitted',
                        module: 'Penalties',
                        title: 'New Compliance Appeal Letter Submitted',
                        message: "{$user->name} submitted a Compliance Appeal Letter for Cycle {$appeal->cycle_number}.",
                        recordLink: "/admin/penalties?appeal={$appeal->id}",
                        recordType: 'penalty_appeal',
                        recordId: (int) $appeal->id,
                        excludeUserId: (int) $user->id
                    );
                });

                return $appeal;
            });
        } catch (\Throwable $e) {
            if ($storedPath) {
                try {
                    Storage::disk('supabase')->delete($storedPath);
                } catch (\Throwable $cleanupError) {
                    Log::warning('PenaltyStrikeService::submitAppeal storage cleanup failed', [
                        'path' => $storedPath,
                        'error' => $cleanupError->getMessage(),
                    ]);
                }
            }
            throw $e;
        }
    }

    /**
     * Admin overview with SQL-aggregated KPIs, pending appeals, and employee standings.
     */
    public function getAdminOverview(?string $search = null, string $standing = 'all'): array
    {
        $this->syncAllEligibleStrikes();

        $penalizedCount = (int) DB::query()->fromSub(
            PenaltyStrike::select('user_id')
                ->where('status', 'active')
                ->groupBy('user_id')
                ->havingRaw('COUNT(*) >= ?', [self::STRIKE_LIMIT]),
            'penalized_users'
        )->count();

        $warningCount = (int) DB::query()->fromSub(
            PenaltyStrike::select('user_id')
                ->where('status', 'active')
                ->groupBy('user_id')
                ->havingRaw('COUNT(*) >= 1 AND COUNT(*) < ?', [self::STRIKE_LIMIT]),
            'warning_users'
        )->count();

        $pendingAppealsCount = (int) PenaltyAppeal::where('status', 'pending')->count();

        $resolvedCyclesCount = (int) DB::query()->fromSub(
            PenaltyStrike::select('user_id', 'cycle_number')
                ->where('status', 'reset')
                ->distinct(),
            'resolved_cycles'
        )->count();

        $pendingAppeals = PenaltyAppeal::with('user:id,auth_id,name,email,department,role,avatar')
            ->where('status', 'pending')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $appealUserIds = $pendingAppeals->pluck('user_id')->unique()->values();
        $activeByUserForAppeals = $appealUserIds->isEmpty()
            ? collect()
            : PenaltyStrike::whereIn('user_id', $appealUserIds)
                ->where('status', 'active')
                ->orderByDesc('created_at')
                ->get()
                ->groupBy('user_id');

        $pendingAppealsPayload = $pendingAppeals->map(function (PenaltyAppeal $appeal) use ($activeByUserForAppeals) {
            $arr = $appeal->toArray();
            $arr['user'] = $appeal->user ? $appeal->user->toArray() : null;
            $arr['active_strikes'] = $activeByUserForAppeals
                ->get($appeal->user_id, collect())
                ->where('cycle_number', $appeal->cycle_number)
                ->values()
                ->all();
            return $arr;
        })->values()->all();

        $activeCountSql = "(SELECT COUNT(*) FROM penalty_strikes WHERE penalty_strikes.user_id = users.id AND penalty_strikes.status = 'active')";
        $waivedCountSql = "(SELECT COUNT(*) FROM penalty_strikes WHERE penalty_strikes.user_id = users.id AND penalty_strikes.status = 'waived')";
        $resetCountSql = "(SELECT COUNT(*) FROM penalty_strikes WHERE penalty_strikes.user_id = users.id AND penalty_strikes.status = 'reset')";
        $pendingAppealCountSql = "(SELECT COUNT(*) FROM penalty_appeals WHERE penalty_appeals.user_id = users.id AND penalty_appeals.status = 'pending')";

        $usersQuery = User::query()
            ->selectRaw(
                "users.id, users.auth_id, users.name, users.email, users.department, users.role, users.avatar, "
                . "{$activeCountSql} as active_strikes_count, "
                . "{$waivedCountSql} as waived_strikes_count, "
                . "{$resetCountSql} as reset_strikes_count, "
                . "{$pendingAppealCountSql} as pending_appeals_count"
            )
            ->where(function ($q) {
                $q->whereExists(function ($sub) {
                    $sub->selectRaw('1')->from('penalty_strikes')->whereColumn('penalty_strikes.user_id', 'users.id');
                })->orWhereExists(function ($sub) {
                    $sub->selectRaw('1')->from('penalty_appeals')->whereColumn('penalty_appeals.user_id', 'users.id');
                });
            });

        $cleanSearch = trim((string) ($search ?? ''));
        if ($cleanSearch !== '') {
            $usersQuery->where(function ($q) use ($cleanSearch) {
                $q->where('users.name', 'like', "%{$cleanSearch}%")
                    ->orWhere('users.email', 'like', "%{$cleanSearch}%")
                    ->orWhere('users.department', 'like', "%{$cleanSearch}%");
            });
        }

        $standingFilter = strtolower(trim($standing));
        if ($standingFilter === 'penalized') {
            $usersQuery->whereRaw("{$activeCountSql} >= ?", [self::STRIKE_LIMIT]);
        } elseif ($standingFilter === 'warning') {
            $usersQuery->whereRaw("{$activeCountSql} >= 1 AND {$activeCountSql} < ?", [self::STRIKE_LIMIT]);
        } elseif ($standingFilter === 'clear') {
            $usersQuery->whereRaw("{$activeCountSql} = 0");
        }

        $standingUsers = $usersQuery
            ->orderByDesc('active_strikes_count')
            ->orderBy('users.name')
            ->get();

        $standingUserIds = $standingUsers->pluck('id')->all();
        $strikesByUser = empty($standingUserIds)
            ? collect()
            : PenaltyStrike::whereIn('user_id', $standingUserIds)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->get()
                ->groupBy('user_id');

        $appealsByUser = empty($standingUserIds)
            ? collect()
            : PenaltyAppeal::whereIn('user_id', $standingUserIds)
                ->orderByDesc('id')
                ->get()
                ->groupBy('user_id');

        $standings = $standingUsers->map(function (User $u) use ($strikesByUser, $appealsByUser) {
            $activeCount = (int) $u->getAttribute('active_strikes_count');
            $userStrikes = $strikesByUser->get($u->id, collect());
            $userAppeals = $appealsByUser->get($u->id, collect());

            $currentCycle = self::computeCycleFromMax(
                (int) ($userStrikes->whereIn('status', ['active', 'waived'])->max('cycle_number') ?? 1),
                (int) ($userAppeals->where('status', 'approved')->max('cycle_number') ?? 0),
                (int) ($userStrikes->where('status', 'reset')->max('cycle_number') ?? 0)
            );

            return [
                'id' => (int) $u->id,
                'employee_id' => $u->employee_id,
                'name' => $u->name,
                'email' => $u->email,
                'department' => $u->department,
                'role' => $u->role,
                'avatar_url' => $u->avatar_url,
                'current_cycle' => $currentCycle,
                'active_strikes_count' => $activeCount,
                'strike_limit' => self::STRIKE_LIMIT,
                'standing' => self::resolveStanding($activeCount),
                'is_penalized' => $activeCount >= self::STRIKE_LIMIT,
                'waived_strikes_count' => (int) $u->getAttribute('waived_strikes_count'),
                'reset_strikes_count' => (int) $u->getAttribute('reset_strikes_count'),
                'pending_appeals_count' => (int) $u->getAttribute('pending_appeals_count'),
                'pending_appeal' => $userAppeals->firstWhere('status', 'pending'),
                'active_strikes' => $userStrikes->where('status', 'active')->values()->all(),
                'history_strikes' => $userStrikes->whereIn('status', ['waived', 'reset'])->values()->all(),
            ];
        })->values()->all();

        $employees = User::query()
            ->select(['id', 'name', 'email', 'department'])
            ->orderBy('name')
            ->get()
            ->map(fn (User $emp) => [
                'id' => (int) $emp->id,
                'name' => $emp->name,
                'email' => $emp->email,
                'department' => $emp->department,
            ])
            ->values()
            ->all();

        return [
            'kpis' => [
                'penalized_count' => $penalizedCount,
                'pending_appeals_count' => $pendingAppealsCount,
                'warning_count' => $warningCount,
                'resolved_cycles_count' => $resolvedCyclesCount,
            ],
            'pending_appeals' => $pendingAppealsPayload,
            'standings' => $standings,
            'employees' => $employees,
        ];
    }

    /**
     * Filterable list of all strikes for Admin audit/review.
     */
    public function getAdminStrikes(?string $status = null, ?string $module = null, ?string $search = null): Collection
    {
        $query = PenaltyStrike::with(['user:id,auth_id,name,email,department'])
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if ($status && $status !== 'all') {
            $query->where('status', $status);
        }

        if ($module && $module !== 'all') {
            $query->where('source_module', $module);
        }

        $cleanSearch = trim((string) ($search ?? ''));
        if ($cleanSearch !== '') {
            $query->where(function ($q) use ($cleanSearch) {
                $q->where('source_reference', 'like', "%{$cleanSearch}%")
                    ->orWhere('reason', 'like', "%{$cleanSearch}%")
                    ->orWhere('issued_by_name', 'like', "%{$cleanSearch}%")
                    ->orWhereHas('user', function ($uq) use ($cleanSearch) {
                        $uq->where('name', 'like', "%{$cleanSearch}%")
                            ->orWhere('email', 'like', "%{$cleanSearch}%");
                    });
            });
        }

        return $query->get();
    }

    /**
     * Approve or reject a pending PenaltyAppeal.
     */
    public function reviewAppeal(User $admin, int $appealId, string $decision, ?string $comment = null): PenaltyAppeal
    {
        $cleanComment = trim((string) ($comment ?? ''));
        if ($decision === 'reject' && $cleanComment === '') {
            throw ValidationException::withMessages([
                'comment' => ['A comment is required when rejecting an appeal.'],
            ]);
        }

        $appeal = PenaltyAppeal::findOrFail($appealId);

        if ((int) $appeal->user_id === (int) $admin->id) {
            throw new AuthorizationException('Conflict. Self-approval or self-review of your own appeal is prohibited.');
        }

        if ($appeal->status !== 'pending') {
            throw new ConflictHttpException('This appeal has already been reviewed.');
        }

        return DB::transaction(function () use ($admin, $appealId, $decision, $cleanComment) {
            $lockedAppeal = PenaltyAppeal::where('id', $appealId)->lockForUpdate()->firstOrFail();

            if ($lockedAppeal->status !== 'pending') {
                throw new ConflictHttpException('This appeal has already been reviewed.');
            }

            $beforeAppeal = $lockedAppeal->toArray();
            $newStatus = $decision === 'approve' ? 'approved' : 'rejected';

            $lockedAppeal->update([
                'status' => $newStatus,
                'reviewed_by_id' => $admin->id,
                'reviewed_by_name' => $admin->name,
                'reviewed_at' => now(),
                'admin_comment' => $cleanComment !== '' ? $cleanComment : null,
            ]);

            if ($decision === 'approve') {
                $activeStrikes = PenaltyStrike::where('user_id', $lockedAppeal->user_id)
                    ->where('cycle_number', $lockedAppeal->cycle_number)
                    ->where('status', 'active')
                    ->lockForUpdate()
                    ->get();

                $resolutionNote = $cleanComment !== ''
                    ? $cleanComment
                    : 'Appeal approved and active strikes reset.';

                $resetIds = [];
                foreach ($activeStrikes as $strike) {
                    $strike->update([
                        'status' => 'reset',
                        'appeal_id' => $lockedAppeal->id,
                        'resolved_by_id' => $admin->id,
                        'resolved_at' => now(),
                        'resolution_note' => $resolutionNote,
                    ]);
                    $resetIds[] = (int) $strike->id;
                }

                AuditLogService::log(
                    actorId: (int) $admin->id,
                    actorRole: $admin->role ?? 'admin',
                    actionType: 'PENALTY_APPEAL_APPROVED',
                    entityType: 'penalty_appeal',
                    entityId: (int) $lockedAppeal->id,
                    beforeState: $beforeAppeal,
                    afterState: $lockedAppeal->fresh()->toArray()
                );

                AuditLogService::log(
                    actorId: (int) $admin->id,
                    actorRole: $admin->role ?? 'admin',
                    actionType: 'PENALTY_CYCLE_RESET',
                    entityType: 'user',
                    entityId: (int) $lockedAppeal->user_id,
                    beforeState: [
                        'cycle_number' => (int) $lockedAppeal->cycle_number,
                        'active_strikes_count' => count($resetIds),
                    ],
                    afterState: [
                        'cycle_number' => (int) $lockedAppeal->cycle_number + 1,
                        'active_strikes_count' => 0,
                        'reset_strike_ids' => $resetIds,
                        'appeal_id' => (int) $lockedAppeal->id,
                        'comment' => $resolutionNote,
                    ]
                );

                $this->safeNotify(function () use ($lockedAppeal, $admin) {
                    NotificationService::notifyUser(
                        userId: (int) $lockedAppeal->user_id,
                        type: 'penalty_appeal_approved',
                        module: 'Penalties',
                        title: 'Penalty Appeal Approved',
                        message: "Your appeal for Cycle {$lockedAppeal->cycle_number} was approved by {$admin->name}. Your active strikes have been reset to 0/3 and your submission hold has been lifted.",
                        recordLink: '/penalties',
                        recordType: 'penalty_appeal',
                        recordId: (int) $lockedAppeal->id
                    );
                });
            } else {
                AuditLogService::log(
                    actorId: (int) $admin->id,
                    actorRole: $admin->role ?? 'admin',
                    actionType: 'PENALTY_APPEAL_REJECTED',
                    entityType: 'penalty_appeal',
                    entityId: (int) $lockedAppeal->id,
                    beforeState: $beforeAppeal,
                    afterState: $lockedAppeal->fresh()->toArray()
                );

                $this->safeNotify(function () use ($lockedAppeal, $cleanComment) {
                    NotificationService::notifyUser(
                        userId: (int) $lockedAppeal->user_id,
                        type: 'penalty_appeal_rejected',
                        module: 'Penalties',
                        title: 'Penalty Appeal Rejected',
                        message: "Your appeal for Cycle {$lockedAppeal->cycle_number} was rejected. Admin comment: \"{$cleanComment}\". You may submit a revised letter.",
                        recordLink: '/penalties',
                        recordType: 'penalty_appeal',
                        recordId: (int) $lockedAppeal->id
                    );
                });
            }

            return $lockedAppeal->fresh(['user:id,auth_id,name,email,department,role,avatar']);
        });
    }

    /**
     * Issue a manual compliance strike against a user's record.
     */
    public function issueManualStrike(User $admin, int $userId, string $sourceModule, int $sourceId, string $reason): PenaltyStrike
    {
        $targetUser = User::findOrFail($userId);
        $sourceReference = $this->resolveAndValidateSourceReference($userId, $sourceModule, $sourceId);

        return DB::transaction(function () use ($admin, $targetUser, $sourceModule, $sourceId, $sourceReference, $reason) {
            $cycle = $this->getCurrentCycle((int) $targetUser->id);

            $exists = PenaltyStrike::where('user_id', $targetUser->id)
                ->where('cycle_number', $cycle)
                ->where('source_module', $sourceModule)
                ->where('source_id', $sourceId)
                ->where('trigger_type', 'manual_admin')
                ->exists();

            if ($exists) {
                throw new ConflictHttpException('A manual strike for this record already exists in the current cycle.');
            }

            $strike = PenaltyStrike::create([
                'user_id' => $targetUser->id,
                'cycle_number' => $cycle,
                'source_module' => $sourceModule,
                'source_id' => $sourceId,
                'source_reference' => $sourceReference,
                'trigger_type' => 'manual_admin',
                'reason' => trim($reason),
                'status' => 'active',
                'issued_by_id' => $admin->id,
                'issued_by_name' => $admin->name,
            ]);

            AuditLogService::log(
                actorId: (int) $admin->id,
                actorRole: $admin->role ?? 'admin',
                actionType: 'PENALTY_STRIKE_ISSUED',
                entityType: 'penalty_strike',
                entityId: (int) $strike->id,
                beforeState: null,
                afterState: $strike->toArray()
            );

            $this->safeNotify(function () use ($targetUser, $strike, $admin) {
                $activeCount = PenaltyStrike::where('user_id', $targetUser->id)->where('status', 'active')->count();
                NotificationService::notifyUser(
                    userId: (int) $targetUser->id,
                    type: 'penalty_strike_issued',
                    module: 'Penalties',
                    title: "Compliance Strike Issued ({$activeCount}/3)",
                    message: "{$admin->name} issued a compliance strike on {$strike->source_reference}: \"{$strike->reason}\"",
                    recordLink: '/penalties',
                    recordType: 'penalty_strike',
                    recordId: (int) $strike->id
                );
            });

            return $strike->load('user:id,auth_id,name,email,department');
        });
    }

    /**
     * Waive an active strike with mandatory reason.
     */
    public function waiveStrike(User $admin, int $strikeId, string $reason): PenaltyStrike
    {
        $strike = PenaltyStrike::findOrFail($strikeId);

        if ((int) $strike->user_id === (int) $admin->id) {
            throw new AuthorizationException('Conflict. Self-waiving your own strike is prohibited.');
        }

        if ($strike->status !== 'active') {
            throw new ConflictHttpException('Only active strikes can be waived.');
        }

        return DB::transaction(function () use ($admin, $strikeId, $reason) {
            $locked = PenaltyStrike::where('id', $strikeId)->lockForUpdate()->firstOrFail();

            if ($locked->status !== 'active') {
                throw new ConflictHttpException('Only active strikes can be waived.');
            }

            $before = $locked->toArray();
            $locked->update([
                'status' => 'waived',
                'resolved_by_id' => $admin->id,
                'resolved_at' => now(),
                'resolution_note' => trim($reason),
            ]);

            AuditLogService::log(
                actorId: (int) $admin->id,
                actorRole: $admin->role ?? 'admin',
                actionType: 'PENALTY_STRIKE_WAIVED',
                entityType: 'penalty_strike',
                entityId: (int) $locked->id,
                beforeState: $before,
                afterState: $locked->fresh()->toArray()
            );

            $this->safeNotify(function () use ($locked, $admin, $reason) {
                NotificationService::notifyUser(
                    userId: (int) $locked->user_id,
                    type: 'penalty_strike_waived',
                    module: 'Penalties',
                    title: 'Compliance Strike Waived',
                    message: "Your strike for {$locked->source_reference} was waived by {$admin->name}. Reason: \"{$reason}\"",
                    recordLink: '/penalties',
                    recordType: 'penalty_strike',
                    recordId: (int) $locked->id
                );
            });

            return $locked->fresh(['user:id,auth_id,name,email,department']);
        });
    }

    /**
     * Reset all active strikes for a user (manual admin reset, advancing cycle).
     */
    public function resetUserStrikes(User $admin, int $userId, string $reason): array
    {
        $targetUser = User::findOrFail($userId);

        if ((int) $targetUser->id === (int) $admin->id) {
            throw new AuthorizationException('Conflict. Self-resetting your own strikes is prohibited.');
        }

        return DB::transaction(function () use ($admin, $targetUser, $reason) {
            $activeStrikes = PenaltyStrike::where('user_id', $targetUser->id)
                ->where('status', 'active')
                ->lockForUpdate()
                ->get();

            if ($activeStrikes->isEmpty()) {
                throw new ConflictHttpException('User has no active strikes to reset.');
            }

            $cleanReason = trim($reason);
            $cycleBefore = $this->getCurrentCycle((int) $targetUser->id);
            $resetIds = [];

            foreach ($activeStrikes as $strike) {
                $strike->update([
                    'status' => 'reset',
                    'resolved_by_id' => $admin->id,
                    'resolved_at' => now(),
                    'resolution_note' => $cleanReason,
                ]);
                $resetIds[] = (int) $strike->id;
            }

            $nextCycle = $this->getCurrentCycle((int) $targetUser->id);

            AuditLogService::log(
                actorId: (int) $admin->id,
                actorRole: $admin->role ?? 'admin',
                actionType: 'PENALTY_CYCLE_RESET',
                entityType: 'user',
                entityId: (int) $targetUser->id,
                beforeState: [
                    'cycle_number' => $cycleBefore,
                    'active_strikes_count' => count($resetIds),
                ],
                afterState: [
                    'cycle_number' => $nextCycle,
                    'active_strikes_count' => 0,
                    'reset_strike_ids' => $resetIds,
                    'comment' => $cleanReason,
                ]
            );

            $this->safeNotify(function () use ($targetUser, $admin, $cleanReason) {
                NotificationService::notifyUser(
                    userId: (int) $targetUser->id,
                    type: 'penalty_strikes_reset',
                    module: 'Penalties',
                    title: 'Compliance Strikes Reset',
                    message: "Your active compliance strikes were reset to 0/3 by {$admin->name}. Reason: \"{$cleanReason}\"",
                    recordLink: '/penalties',
                    recordType: 'user',
                    recordId: (int) $targetUser->id
                );
            });

            return [
                'user_id' => (int) $targetUser->id,
                'reset_count' => count($resetIds),
                'current_cycle' => $nextCycle,
            ];
        });
    }

    /**
     * Fetch recent Cash Advances, Liquidations, and Reimbursements for a user (Admin Manual Strike picker).
     */
    public function getUserRecordsForPicker(int $userId): array
    {
        User::findOrFail($userId);

        $cashAdvances = CashAdvance::where('user_id', $userId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn (CashAdvance $ca) => [
                'id' => (int) $ca->id,
                'reference_no' => $ca->reference_no,
                'status' => $ca->status,
                'amount' => (float) $ca->amount,
                'created_at' => $ca->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $liquidations = Liquidation::where('user_id', $userId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn (Liquidation $liq) => [
                'id' => (int) $liq->id,
                'reference_no' => 'LIQ-' . str_pad((string) $liq->id, 3, '0', STR_PAD_LEFT),
                'status' => $liq->status,
                'total_expense_amount' => (float) $liq->total_expense_amount,
                'created_at' => $liq->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $reimbursements = Reimbursement::where('user_id', $userId)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn (Reimbursement $rmb) => [
                'id' => (int) $rmb->id,
                'reference_no' => $rmb->reference_no,
                'status' => $rmb->status,
                'amount' => (float) $rmb->amount,
                'created_at' => $rmb->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        return [
            'cash_advances' => $cashAdvances,
            'liquidations' => $liquidations,
            'reimbursements' => $reimbursements,
        ];
    }

    private function recordAutomaticStrike(
        int $userId,
        int $cycle,
        string $sourceModule,
        int $sourceId,
        string $sourceReference,
        string $triggerType,
        string $reason
    ): PenaltyStrike {
        return DB::transaction(function () use ($userId, $cycle, $sourceModule, $sourceId, $sourceReference, $triggerType, $reason) {
            $strike = PenaltyStrike::create([
                'user_id' => $userId,
                'cycle_number' => $cycle,
                'source_module' => $sourceModule,
                'source_id' => $sourceId,
                'source_reference' => $sourceReference,
                'trigger_type' => $triggerType,
                'reason' => $reason,
                'status' => 'active',
                'issued_by_id' => null,
                'issued_by_name' => 'System',
            ]);

            AuditLogService::log(
                actorId: 0,
                actorRole: 'system',
                actionType: 'PENALTY_STRIKE_ISSUED',
                entityType: 'penalty_strike',
                entityId: (int) $strike->id,
                beforeState: null,
                afterState: $strike->toArray(),
                ipAddress: '127.0.0.1'
            );

            $this->safeNotify(function () use ($userId, $strike) {
                $activeCount = PenaltyStrike::where('user_id', $userId)->where('status', 'active')->count();
                NotificationService::notifyUser(
                    userId: $userId,
                    type: 'penalty_strike_issued',
                    module: 'Penalties',
                    title: "Compliance Strike Recorded ({$activeCount}/3)",
                    message: $strike->reason,
                    recordLink: '/penalties',
                    recordType: 'penalty_strike',
                    recordId: (int) $strike->id
                );
            });

            return $strike;
        });
    }

    private function resolveAndValidateSourceReference(int $userId, string $sourceModule, int $sourceId): string
    {
        if ($sourceModule === 'cash_advance') {
            $record = CashAdvance::find($sourceId);
            if (!$record || (int) $record->user_id !== $userId) {
                throw ValidationException::withMessages([
                    'source_id' => ['Selected cash advance does not exist or does not belong to this employee.'],
                ]);
            }
            return $record->reference_no;
        }

        if ($sourceModule === 'liquidation') {
            $record = Liquidation::find($sourceId);
            if (!$record || (int) $record->user_id !== $userId) {
                throw ValidationException::withMessages([
                    'source_id' => ['Selected liquidation does not exist or does not belong to this employee.'],
                ]);
            }
            return 'LIQ-' . str_pad((string) $record->id, 3, '0', STR_PAD_LEFT);
        }

        $record = Reimbursement::find($sourceId);
        if (!$record || (int) $record->user_id !== $userId) {
            throw ValidationException::withMessages([
                'source_id' => ['Selected reimbursement does not exist or does not belong to this employee.'],
            ]);
        }

        return $record->reference_no;
    }

    private function safeNotify(callable $callback): void
    {
        try {
            $callback();
        } catch (\Throwable $e) {
            Log::warning('PenaltyStrikeService notification dispatch failed', [
                'error' => $e->getMessage(),
            ]);
        }
    }
}
