<?php

namespace App\Modules\Shared\Services;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceStatusHistory;
use App\Modules\Liquidations\Models\PenaltyRecord;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class PenaltySyncService
{
    public const GRACE_PERIOD_DAYS = 7;
    public const DAILY_PENALTY_PHP = 50.00;

    private const ELIGIBLE_STATUSES = ['disbursed', 'signed', 'overdue', 'incomplete'];
    private const PAUSED_LIQUIDATION_STATUSES = ['pending', 'under-review', 'approved', 'liquidated', 'settled'];

    /**
     * Number of penalty-bearing days past the 7-day grace period after expected_liquidation_date.
     */
    public function computePenaltyDays(CashAdvance $advance, ?Carbon $today = null): int
    {
        if (! $advance->expected_liquidation_date) {
            return 0;
        }

        $referenceDay = ($today ?? Carbon::now())->copy()->startOfDay();
        $dueDate = Carbon::parse($advance->expected_liquidation_date)->startOfDay();
        $daysPastDue = (int) $dueDate->diffInDays($referenceDay, false);

        return max(0, $daysPastDue - self::GRACE_PERIOD_DAYS);
    }

    /**
     * Whether penalty accrual should pause because a submitted/settled liquidation already exists.
     */
    public function hasActiveOrSettledLiquidation(CashAdvance $advance): bool
    {
        if ($advance->relationLoaded('liquidations')) {
            return $advance->liquidations->contains(
                fn ($liq) => in_array(strtolower((string) $liq->status), self::PAUSED_LIQUIDATION_STATUSES, true)
            );
        }

        return $advance->liquidations()
            ->whereIn('status', self::PAUSED_LIQUIDATION_STATUSES)
            ->exists();
    }

    /**
     * Sync all overdue candidate cash advances (optionally scoped to one user).
     *
     * @return array{checked: int, applied: int, reverted: int}
     */
    public function syncPendingOverdueAdvances(?int $userId = null, ?Carbon $today = null): array
    {
        $referenceDay = ($today ?? Carbon::now())->copy()->startOfDay();
        $graceCutoff = $referenceDay->copy()->subDays(self::GRACE_PERIOD_DAYS)->toDateString();

        $query = CashAdvance::with('liquidations')
            ->whereIn('status', self::ELIGIBLE_STATUSES)
            ->where('outstanding_balance', '>', 0)
            ->whereNotNull('expected_liquidation_date')
            ->where(function ($q) use ($graceCutoff) {
                $q->whereDate('expected_liquidation_date', '<', $graceCutoff)
                    ->orWhereHas('penalties');
            });

        if ($userId !== null) {
            $query->where('user_id', $userId);
        }

        $candidates = $query->get();
        $totalApplied = 0;
        $totalReverted = 0;

        foreach ($candidates as $advance) {
            $result = $this->syncAdvance($advance, null, $referenceDay);
            $totalApplied += $result['applied'];
            $totalReverted += $result['reverted'];
        }

        return [
            'checked' => $candidates->count(),
            'applied' => $totalApplied,
            'reverted' => $totalReverted,
        ];
    }

    /**
     * Reconcile daily overdue penalties and outstanding_balance for a single cash advance.
     *
     * @return array{applied: int, reverted: int, status_changed: bool, penalty_days: int}
     */
    public function syncAdvance(CashAdvance $advance, ?bool $applyNewPenalties = null, ?Carbon $today = null): array
    {
        $referenceDay = ($today ?? Carbon::now())->copy()->startOfDay();

        return DB::transaction(function () use ($advance, $applyNewPenalties, $referenceDay) {
            $locked = CashAdvance::where('id', $advance->id)->lockForUpdate()->first();
            if (! $locked) {
                return ['applied' => 0, 'reverted' => 0, 'status_changed' => false, 'penalty_days' => 0];
            }

            if ((float) ($locked->outstanding_balance ?? 0) <= 0
                || ! in_array($locked->status, self::ELIGIBLE_STATUSES, true)
            ) {
                return ['applied' => 0, 'reverted' => 0, 'status_changed' => false, 'penalty_days' => 0];
            }

            $shouldApply = $applyNewPenalties ?? ! $this->hasActiveOrSettledLiquidation($locked);
            $penaltyDays = $this->computePenaltyDays($locked, $referenceDay);

            $revertedCount = 0;
            $appliedCount = 0;
            $statusChanged = false;

            // 1. Revert invalid penalties if due date was extended
            $invalidPenalties = PenaltyRecord::where('cash_advance_id', $locked->id)
                ->where('days_overdue', '>', $penaltyDays)
                ->get();

            if ($invalidPenalties->isNotEmpty()) {
                $beforeState = [
                    'outstanding_balance' => (float) $locked->outstanding_balance,
                    'status' => $locked->status,
                ];
                $subtract = (float) $invalidPenalties->sum('penalty_amount');
                PenaltyRecord::whereIn('id', $invalidPenalties->pluck('id'))->delete();

                $locked->outstanding_balance = max(0, (float) $locked->outstanding_balance - $subtract);
                $locked->save();
                $revertedCount = $invalidPenalties->count();

                AuditLogService::log(
                    actorId: 0,
                    actorRole: 'system',
                    actionType: 'OVERDUE_PENALTY_REVERTED',
                    entityType: 'cash_advance',
                    entityId: $locked->id,
                    beforeState: $beforeState,
                    afterState: [
                        'outstanding_balance' => (float) $locked->outstanding_balance,
                        'status' => $locked->status,
                        'reverted_days' => $revertedCount,
                    ],
                    ipAddress: '127.0.0.1'
                );
            }

            // 2. Apply missing daily ₱50 penalties past the 7-day grace period
            if ($shouldApply && $penaltyDays > 0) {
                $existingDays = PenaltyRecord::where('cash_advance_id', $locked->id)
                    ->pluck('days_overdue')
                    ->map(fn ($d) => (int) $d)
                    ->all();

                $beforeState = [
                    'outstanding_balance' => (float) $locked->outstanding_balance,
                    'status' => $locked->status,
                ];

                for ($day = 1; $day <= $penaltyDays; $day++) {
                    if (! in_array($day, $existingDays, true)) {
                        PenaltyRecord::create([
                            'cash_advance_id' => $locked->id,
                            'days_overdue' => $day,
                            'penalty_amount' => self::DAILY_PENALTY_PHP,
                        ]);

                        $locked->outstanding_balance = (float) $locked->outstanding_balance + self::DAILY_PENALTY_PHP;
                        $appliedCount++;
                    }
                }

                if ($appliedCount > 0) {
                    $oldStatus = $locked->status;
                    if (! in_array($oldStatus, ['overdue', 'incomplete'], true)) {
                        $locked->status = 'overdue';
                        $statusChanged = true;
                    }

                    // Saving triggers CashAdvance::booted() to propagate outstanding_balance to liquidations
                    $locked->save();

                    if ($statusChanged) {
                        $changedBy = User::where('role', 'admin')->first()?->id ?? $locked->user_id;
                        CashAdvanceStatusHistory::create([
                            'cash_advance_id' => $locked->id,
                            'from_status' => $oldStatus,
                            'to_status' => 'overdue',
                            'changed_by' => $changedBy,
                        ]);
                    }

                    AuditLogService::log(
                        actorId: 0,
                        actorRole: 'system',
                        actionType: 'OVERDUE_PENALTY',
                        entityType: 'cash_advance',
                        entityId: $locked->id,
                        beforeState: $beforeState,
                        afterState: [
                            'outstanding_balance' => (float) $locked->outstanding_balance,
                            'status' => $locked->status,
                            'days_overdue' => $penaltyDays,
                            'penalties_added' => $appliedCount * self::DAILY_PENALTY_PHP,
                        ],
                        ipAddress: '127.0.0.1'
                    );
                }
            }

            return [
                'applied' => $appliedCount,
                'reverted' => $revertedCount,
                'status_changed' => $statusChanged,
                'penalty_days' => $penaltyDays,
            ];
        });
    }
}
