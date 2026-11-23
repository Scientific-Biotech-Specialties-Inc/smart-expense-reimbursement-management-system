<?php

namespace App\Modules\CashAdvances\Services;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceStatusHistory;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class PrsCashAdvanceService
{
    private const LOCKED_STATUSES = ['disbursed', 'signed', 'liquidated'];

    /**
     * Compute PRS gating booleans for a given cash advance status.
     *
     * @return array{is_done: bool, can_proceed: bool, can_remove: bool}
     */
    public static function gatingForStatus(string $status): array
    {
        $normalized = strtolower(trim($status));
        $isDone = in_array($normalized, self::LOCKED_STATUSES, true);

        return [
            'is_done'     => $isDone,
            'can_proceed' => $isDone,
            'can_remove'  => !$isDone,
        ];
    }

    /**
     * Compute PRS gating payload for a CashAdvance model.
     *
     * @return array{is_done: bool, can_proceed: bool, can_remove: bool}
     */
    public function formatGatingPayload(CashAdvance $advance): array
    {
        return self::gatingForStatus((string) $advance->status);
    }

    /**
     * Validate and create (or idempotently return) a Cash Advance for a PRS itinerary.
     *
     * @return array{created: bool, cash_advance: CashAdvance}
     */
    public function createOrGetForItinerary(array $payload, ?string $ipAddress = null): array
    {
        $normalized = $this->normalizeAndValidate($payload);
        $itineraryId = (int) $normalized['itinerary_id'];

        $existing = $this->findLatestByItineraryId($itineraryId);
        if ($existing && $this->isActiveStatus((string) $existing->status)) {
            AuditLogService::enrichCashAdvance($existing, false);

            return [
                'created'      => false,
                'cash_advance' => $existing,
            ];
        }

        try {
            $txResult = DB::transaction(function () use ($normalized, $itineraryId, $ipAddress) {
                $lockedExisting = $this->findLatestByItineraryId($itineraryId, true);
                if ($lockedExisting && $this->isActiveStatus((string) $lockedExisting->status)) {
                    return [
                        'created'      => false,
                        'cash_advance' => $lockedExisting,
                    ];
                }

                $user = $this->resolveOrCreateEmployee($normalized);

                $advance = CashAdvance::create([
                    'user_id'                    => $user->id,
                    'purpose'                    => $normalized['purpose'],
                    'client_name'                => $normalized['client_name'],
                    'amount'                     => $normalized['amount'],
                    'expected_disbursement_date' => $normalized['expected_disbursement_date'],
                    'expected_liquidation_date'  => $normalized['expected_liquidation_date'],
                    'status'                     => 'pending',
                    'source_system'              => 'prs',
                    'itinerary_id'               => $itineraryId,
                ]);

                CashAdvanceStatusHistory::create([
                    'cash_advance_id' => $advance->id,
                    'from_status'     => null,
                    'to_status'       => 'pending',
                    'changed_by'      => $user->id,
                ]);

                $formattedAmount = NotificationService::formatPeso($advance->amount);
                $link = "/cash-advances?view={$advance->id}";

                NotificationService::notifyUser(
                    userId: $user->id,
                    type: 'cash_advance_submitted',
                    module: 'Cash Advance',
                    title: 'Cash Advance Submitted',
                    message: "Your PRS cash advance request of {$formattedAmount} for Planned Activity #{$itineraryId} was submitted.",
                    recordLink: $link,
                    recordType: 'cash_advance',
                    recordId: $advance->id
                );

                NotificationService::notifyAdmins(
                    type: 'admin_cash_advance_submitted',
                    module: 'Cash Advance',
                    title: 'New PRS Cash Advance Request',
                    message: "{$user->name} submitted a PRS cash advance request of {$formattedAmount} (Planned Activity #{$itineraryId}).",
                    recordLink: $link,
                    recordType: 'cash_advance',
                    recordId: $advance->id,
                    excludeUserId: $user->id
                );

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: $user->role ?? 'employee',
                    actionType: 'PRS_CASH_ADVANCE_CREATED',
                    entityType: 'cash_advance',
                    entityId: $advance->id,
                    beforeState: null,
                    afterState: $advance->toArray(),
                    ipAddress: $ipAddress
                );

                return [
                    'created'      => true,
                    'cash_advance' => $advance,
                ];
            });
        } catch (\Throwable $e) {
            if (!$e instanceof ValidationException) {
                Log::error('PrsCashAdvanceService::createOrGetForItinerary failed.', [
                    'itinerary_id' => $itineraryId,
                    'error'        => $e->getMessage(),
                ]);
            }

            throw $e;
        }

        $advance = $txResult['cash_advance']->load([
            'requester',
            'approvalActions.approver',
            'statusHistory.changedBy',
            'disbursement.disbursedBy',
            'document',
        ]);
        AuditLogService::enrichCashAdvance($advance, false);

        return [
            'created'      => $txResult['created'],
            'cash_advance' => $advance,
        ];
    }

    /**
     * Find the latest CashAdvance linked to a PRS itinerary ID.
     */
    public function findLatestByItineraryId(int $itineraryId, bool $lock = false): ?CashAdvance
    {
        $query = CashAdvance::with([
            'requester',
            'approvalActions.approver',
            'statusHistory.changedBy',
            'disbursement.disbursedBy',
            'document',
        ])
            ->where('source_system', 'prs')
            ->where('itinerary_id', $itineraryId)
            ->orderByDesc('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    /**
     * Remove a non-disbursed CashAdvance for a PRS itinerary.
     *
     * @return array{removed: bool, cash_advance_id: int, reference_no: string, itinerary_id: int, status: string}
     *
     * @throws ModelNotFoundException
     * @throws ValidationException
     */
    public function removeByItineraryId(int $itineraryId, ?string $ipAddress = null): array
    {
        return DB::transaction(function () use ($itineraryId, $ipAddress) {
            $advance = $this->findLatestByItineraryId($itineraryId, true);

            if (!$advance) {
                throw (new ModelNotFoundException())->setModel(CashAdvance::class, [$itineraryId]);
            }

            $status = strtolower(trim((string) $advance->status));
            if (in_array($status, self::LOCKED_STATUSES, true)) {
                throw ValidationException::withMessages([
                    'status' => ["Cash advance {$advance->reference_no} cannot be removed because its status is '{$advance->status}'."],
                ]);
            }

            $advanceId = (int) $advance->id;
            $referenceNo = $advance->reference_no;
            $actorId = (int) ($advance->user_id ?? 0);
            $actorRole = $advance->requester?->role ?? 'employee';

            AuditLogService::log(
                actorId: $actorId,
                actorRole: $actorRole,
                actionType: 'PRS_CASH_ADVANCE_REMOVED',
                entityType: 'cash_advance',
                entityId: $advanceId,
                beforeState: $advance->toArray(),
                afterState: null,
                ipAddress: $ipAddress
            );

            foreach ($advance->document()->get() as $doc) {
                try {
                    if ($doc->file_path) {
                        Storage::disk('supabase')->delete($doc->file_path);
                    }
                } catch (\Throwable $e) {
                    Log::warning('PrsCashAdvanceService::removeByItineraryId failed to delete document from storage.', [
                        'cash_advance_id' => $advanceId,
                        'file_path'       => $doc->file_path,
                        'error'           => $e->getMessage(),
                    ]);
                }
                $doc->delete();
            }

            $advance->approvalActions()->delete();
            $advance->statusHistory()->delete();
            $advance->delete();

            return [
                'removed'         => true,
                'cash_advance_id' => $advanceId,
                'reference_no'    => $referenceNo,
                'itinerary_id'    => $itineraryId,
                'status'          => $status,
            ];
        });
    }

    private function isActiveStatus(string $status): bool
    {
        return strtolower(trim($status)) !== 'rejected';
    }

    /**
     * Normalize payload aliases and validate fields.
     *
     * @return array<string, mixed>
     */
    private function normalizeAndValidate(array $raw): array
    {
        $employee = $raw['employee'] ?? [];
        if (is_string($employee)) {
            $decoded = json_decode($employee, true);
            $employee = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($employee)) {
            $employee = [];
        }

        $itineraryId = $raw['itinerary_id'] ?? ($raw['planned_activity_id'] ?? null);
        $disbursementDate = $raw['expected_disbursement_date']
            ?? ($raw['scheduled_date'] ?? now()->toDateString());

        $liquidationDate = $raw['expected_liquidation_date'] ?? null;
        if (empty($liquidationDate) && !empty($disbursementDate)) {
            try {
                $liquidationDate = Carbon::parse($disbursementDate)->addDays(7)->toDateString();
            } catch (\Throwable) {
                $liquidationDate = null;
            }
        }

        $clientName = $raw['client_name'] ?? ($raw['institution'] ?? null);
        $activityType = trim((string) ($raw['activity_type'] ?? ''));
        $rawPurpose = $raw['purpose'] ?? ($raw['notes'] ?? null);
        $purpose = is_string($rawPurpose) ? trim($rawPurpose) : '';

        if ($purpose === '') {
            $parts = array_filter([
                $activityType !== '' ? $activityType : 'PRS Planned Activity',
                $clientName ? "at {$clientName}" : null,
                $itineraryId ? "(Itinerary #{$itineraryId})" : null,
            ]);
            $purpose = implode(' ', $parts);
        }

        $data = [
            'itinerary_id'               => $itineraryId,
            'amount'                     => $raw['amount'] ?? null,
            'employee_email'             => $raw['employee_email'] ?? ($employee['email'] ?? null),
            'employee_name'              => $raw['employee_name'] ?? ($employee['name'] ?? null),
            'employee_id'                => $raw['employee_id'] ?? ($employee['id'] ?? null),
            'department'                 => $raw['department'] ?? ($employee['department'] ?? 'Sales & Marketing'),
            'client_name'                => $clientName,
            'activity_type'              => $activityType !== '' ? $activityType : null,
            'expected_disbursement_date' => $disbursementDate,
            'expected_liquidation_date'  => $liquidationDate,
            'purpose'                    => $purpose,
        ];

        $validator = Validator::make($data, [
            'itinerary_id'               => ['required', 'integer', 'min:1'],
            'amount'                     => ['required', 'numeric', 'min:0.01'],
            'employee_email'             => ['required', 'email', 'max:255'],
            'employee_name'              => ['required', 'string', 'max:255'],
            'employee_id'                => ['nullable', 'max:64'],
            'department'                 => ['nullable', 'string', 'max:255'],
            'client_name'                => ['nullable', 'string', 'max:255'],
            'activity_type'              => ['nullable', 'string', 'max:100'],
            'expected_disbursement_date' => ['required', 'date'],
            'expected_liquidation_date'  => ['required', 'date', 'after_or_equal:expected_disbursement_date'],
            'purpose'                    => ['required', 'string', 'max:500'],
        ]);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        return $data;
    }

    private function resolveOrCreateEmployee(array $normalized): User
    {
        $email = strtolower(trim((string) $normalized['employee_email']));
        $existing = User::whereRaw('LOWER(email) = ?', [$email])->first();
        if ($existing) {
            return $existing;
        }

        $authId = null;
        if (!empty($normalized['employee_id']) && is_numeric($normalized['employee_id'])) {
            $candidateAuthId = (int) $normalized['employee_id'];
            if ($candidateAuthId > 0 && !User::where('auth_id', $candidateAuthId)->exists()) {
                $authId = $candidateAuthId;
            }
        }

        return User::create([
            'auth_id'    => $authId,
            'email'      => $email,
            'name'       => trim((string) $normalized['employee_name']),
            'role'       => 'employee',
            'department' => trim((string) ($normalized['department'] ?? '')) ?: 'Sales & Marketing',
        ]);
    }
}
