<?php

namespace App\Modules\CashAdvances\Services;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceDocument;
use App\Modules\CashAdvances\Models\CashAdvanceApprovalAction;
use App\Modules\CashAdvances\Models\CashAdvanceDisbursement;
use App\Modules\CashAdvances\Models\CashAdvanceStatusHistory;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Users\Models\User;
use App\Modules\Shared\Services\PasswordVerificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use App\Modules\AuditLogs\Services\AuditLogService;

class CashAdvanceService
{
    public function createAdvance(User $user, array $data, array $files = [])
    {
        return DB::transaction(function () use ($user, $data, $files) {
            $advance = CashAdvance::create([
                'user_id' => $user->id,
                'purpose' => $data['purpose'],
                'amount' => $data['amount'],
                'expected_disbursement_date' => $data['expected_disbursement_date'],
                'expected_liquidation_date' => $data['expected_liquidation_date'],
                'status' => 'pending',
                'report_template_data' => $data['report_template_data'] ?? null,
            ]);

            CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => null,
                'to_status' => 'pending',
                'changed_by' => $user->id,
            ]);

            foreach ($files as $file) {
                $path = $file->store('cash_advances/documents', 'supabase');

                CashAdvanceDocument::create([
                    'cash_advance_id' => $advance->id,
                    'file_path' => $path,
                    'file_type' => $file->getClientMimeType(),
                    'file_name' => $file->getClientOriginalName(),
                ]);
            }

            NotificationService::notifyUser(
                userId: $user->id,
                type: 'cash_advance_submitted',
                module: 'Cash Advance',
                title: 'Cash Advance Submitted',
                message: "Your cash advance request of " . NotificationService::formatPeso($advance->amount) . " was submitted.",
                recordLink: "/cash-advances?view={$advance->id}",
                recordType: 'cash_advance',
                recordId: $advance->id
            );

            NotificationService::notifyAdmins(
                type: 'admin_cash_advance_submitted',
                module: 'Cash Advance',
                title: 'New Cash Advance Request',
                message: "{$user->name} submitted a cash advance request of " . NotificationService::formatPeso($advance->amount) . ".",
                recordLink: "/cash-advances?view={$advance->id}",
                recordType: 'cash_advance',
                recordId: $advance->id,
                excludeUserId: $user->id
            );

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'employee',
                actionType: 'CASH_ADVANCE_SUBMITTED',
                entityType: 'cash_advance',
                entityId: $advance->id,
                beforeState: null,
                afterState: $advance->toArray()
            );

            return $advance;
        });
    }

    public function approveAdvance(CashAdvance $advance, User $user, ?string $comment, string $password, Request $requestContext)
    {
        return DB::transaction(function () use ($advance, $user, $comment, $password, $requestContext) {
            if (!PasswordVerificationService::verify($requestContext, $password)) {
                throw ValidationException::withMessages([
                    'password' => ['Invalid password. Please try again.'],
                ]);
            }

            $advance->update(['status' => 'approved']);

            CashAdvanceApprovalAction::create([
                'cash_advance_id' => $advance->id,
                'approver_id' => $user->id,
                'action' => 'approved',
                'comment' => $comment,
            ]);

            CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => 'pending',
                'to_status' => 'approved',
                'changed_by' => $user->id,
            ]);

            $commentText = $comment ? " Approver note: \"{$comment}\"" : '';
            NotificationService::notifyUser(
                userId: $advance->user_id,
                type: 'cash_advance_approved',
                module: 'Cash Advance',
                title: 'Cash Advance Approved',
                message: "Your cash advance request of " . NotificationService::formatPeso($advance->amount) . " was approved by {$user->name}.{$commentText}",
                recordLink: "/cash-advances?view={$advance->id}",
                recordType: 'cash_advance',
                recordId: $advance->id
            );

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'approver',
                actionType: 'CASH_ADVANCE_APPROVED',
                entityType: 'cash_advance',
                entityId: $advance->id,
                beforeState: ['status' => 'pending'],
                afterState: ['status' => 'approved', 'comment' => $comment]
            );

            return $advance;
        });
    }

    public function rejectAdvance(CashAdvance $advance, User $user, string $comment, string $action = 'revise', string $password = '', Request $requestContext = null)
    {
        return DB::transaction(function () use ($advance, $user, $comment, $action, $password, $requestContext) {
            if ($requestContext === null || $password === '' || !PasswordVerificationService::verify($requestContext, $password)) {
                throw ValidationException::withMessages([
                    'password' => ['Invalid password. Please try again.'],
                ]);
            }

            $lockedAdvance = CashAdvance::where('id', $advance->id)->lockForUpdate()->firstOrFail();

            if (!in_array($lockedAdvance->status, ['pending', 'revise'])) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Only pending or revise cash advances can be revised/rejected.');
            }

            $currentCount = (int) ($lockedAdvance->revision_count ?? 0);
            $newCount = $currentCount + 1;
            // 3 revises allowed: 1st-3rd = revise, 4th (>3) = terminal rejected
            $newStatus = $newCount > 3 ? 'rejected' : 'revise';
            $fromStatus = $lockedAdvance->status;

            $lockedAdvance->update([
                'status' => $newStatus,
                'revision_count' => $newCount,
            ]);
            $advance = $lockedAdvance;

            // Map request action (present tense: revise/reject) to stored action (past tense: revised/rejected).
            // Terminal 3rd strike (newCount >=3 / <=2 allowed) — 2 strikes revise, 3rd rejected, 3 total — always forces 'rejected' regardless of $action input —
            // system outcome overrides admin intent to enforce hard revocation cap (2 revises allowed: 1st-2nd revise, 3rd rejected, 3 total).
            $actionValue = $newStatus === 'rejected' ? 'rejected' : ($action === 'revise' ? 'revised' : 'rejected');

            // Defensive guard: fail fast with 422 instead of 500 if DB enum is out-of-sync.
            // Allowed values must match cash_advance_approval_actions.action enum: approved/rejected/revised.
            $allowedActions = ['approved', 'rejected', 'revised'];
            if (!in_array($actionValue, $allowedActions, true)) {
                throw ValidationException::withMessages([
                    'action' => ["Invalid approval action '{$actionValue}'. Allowed: " . implode(', ', $allowedActions) . ". Database enum may be out-of-sync — contact administrator."],
                ]);
            }

            try {
                CashAdvanceApprovalAction::create([
                    'cash_advance_id' => $advance->id,
                    'approver_id' => $user->id,
                    'action' => $actionValue,
                    'comment' => $comment,
                ]);
            } catch (\Throwable $e) {
                // System boundary (DB insert): log actionable context and rethrow to guarantee
                // DB::transaction rollback per AGENTS.md — never swallow inside transaction.
                Log::error('CashAdvanceService::rejectAdvance failed to persist approval action.', [
                    'cash_advance_id' => $advance->id,
                    'approver_id' => $user->id,
                    'action_param' => $action,
                    'action_value' => $actionValue,
                    'new_status' => $newStatus,
                    'revision_count' => $newCount,
                    'error' => $e->getMessage(),
                ]);

                // If DB enum still lacks 'revised', surface as 422 for operability (not raw 500).
                $msg = strtolower($e->getMessage());
                if (str_contains($msg, 'revised') || str_contains($msg, 'enum') || str_contains($msg, 'truncated') || str_contains($msg, 'data truncated')) {
                    throw ValidationException::withMessages([
                        'action' => ["Approval action '{$actionValue}' violates database constraint. Ensure migration adding 'revised' to enum has run. Original: " . $e->getMessage()],
                    ]);
                }

                throw $e;
            }

            CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => $fromStatus,
                'to_status' => $newStatus,
                'changed_by' => $user->id,
            ]);

            $isTerminal = $newStatus === 'rejected';
            $statusType = $isTerminal ? 'cash_advance_rejected' : 'cash_advance_revised';
            $statusTitle = $isTerminal ? 'Cash Advance Rejected' : 'Cash Advance Needs Revision';
            $statusVerb = $isTerminal ? 'rejected' : 'returned for revision';
            NotificationService::notifyUser(
                userId: $advance->user_id,
                type: $statusType,
                module: 'Cash Advance',
                title: $statusTitle,
                message: "Your cash advance request of " . NotificationService::formatPeso($advance->amount) . " was {$statusVerb}. Approver note: \"{$comment}\"",
                recordLink: "/cash-advances?view={$advance->id}",
                recordType: 'cash_advance',
                recordId: $advance->id
            );

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'approver',
                actionType: $actionValue === 'rejected' ? 'CASH_ADVANCE_REJECTED' : 'CASH_ADVANCE_REVISED',
                entityType: 'cash_advance',
                entityId: $advance->id,
                beforeState: ['status' => $fromStatus],
                afterState: ['status' => $newStatus, 'comment' => $comment, 'revision_count' => $newCount]
            );

            return $advance;
        });
    }

    public function disburseAdvance(CashAdvance $advance, User $user, array $data, string $password, Request $requestContext)
    {
        return DB::transaction(function () use ($advance, $user, $data, $password, $requestContext) {
            if (!PasswordVerificationService::verify($requestContext, $password)) {
                throw ValidationException::withMessages([
                    'password' => ['Invalid password. Please try again.'],
                ]);
            }

            $advance->update([
                'status'              => 'disbursed',
                'outstanding_balance' => $advance->amount, // Debt begins at full amount
            ]);

            CashAdvanceDisbursement::create([
                'cash_advance_id' => $advance->id,
                'disbursed_by_id' => $user->id,
                'disbursement_date' => now()->toDateString(),
                'channel' => $data['channel'],
                'reference_number' => $data['reference'],
            ]);

            CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => 'approved',
                'to_status' => 'disbursed',
                'changed_by' => $user->id,
            ]);

            NotificationService::notifyUser(
                userId: $advance->user_id,
                type: 'cash_advance_disbursed',
                module: 'Cash Advance',
                title: 'Cash Advance Disbursed',
                message: "Your cash advance of " . NotificationService::formatPeso($advance->amount) . " was disbursed via {$data['channel']} (Ref: {$data['reference']}).",
                recordLink: "/cash-advances?view={$advance->id}",
                recordType: 'cash_advance',
                recordId: $advance->id
            );

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'finance',
                actionType: 'CASH_ADVANCE_DISBURSED',
                entityType: 'cash_advance',
                entityId: $advance->id,
                beforeState: ['status' => 'approved'],
                afterState: ['status' => 'disbursed', 'channel' => $data['channel'], 'reference' => $data['reference']]
            );

            return $advance;
        });
    }

    public function acknowledgeAdvance(CashAdvance $advance, array $data)
    {
        return DB::transaction(function () use ($advance, $data) {
            $oldStatus = $advance->status;

            $advance->update([
                'signature' => $data['signature'],
                'acknowledged_at' => now(),
                'status' => 'signed',
            ]);

            CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => $oldStatus,
                'to_status' => 'signed',
                'changed_by' => auth()->id() ?? $advance->user_id,
            ]);

            $advance->loadMissing('requester');
            $empName = $advance->requester?->name ?? 'Employee';
            NotificationService::notifyAdmins(
                type: 'admin_cash_advance_signed',
                module: 'Cash Advance',
                title: 'Employee Signed Cash Advance',
                message: "{$empName} signed to acknowledge Cash Advance #{$advance->id} (" . NotificationService::formatPeso($advance->amount) . ").",
                recordLink: "/cash-advances?view={$advance->id}",
                recordType: 'cash_advance',
                recordId: $advance->id,
                excludeUserId: auth()->id() ?? $advance->user_id
            );

            AuditLogService::log(
                actorId: $advance->user_id,
                actorRole: 'employee',
                actionType: 'CASH_ADVANCE_ACKNOWLEDGED',
                entityType: 'cash_advance',
                entityId: $advance->id,
                beforeState: ['status' => $oldStatus],
                afterState: ['status' => 'signed']
            );

            return $advance;
        });
    }

    /**
     * Update a pending or revise cash advance (employee self-edit).
     *
     * Resets revise → pending with status history entry. Terminal rejected (>=3 strikes / >2) cannot be edited — 2 revises allowed (<=2 revise, >=3 rejected), 3rd = terminal rejected, 3 total.
     */
    public function updateAdvance(CashAdvance $advance, User $user, array $data, array $files = [])
    {
        return DB::transaction(function () use ($advance, $user, $data, $files) {
            $oldStatus = $advance->status;

            $updatePayload = array_filter([
                'purpose' => $data['purpose'] ?? null,
                'amount' => $data['amount'] ?? null,
                'expected_disbursement_date' => $data['expected_disbursement_date'] ?? null,
                'expected_liquidation_date' => $data['expected_liquidation_date'] ?? null,
            ], fn($v) => $v !== null);

            if (array_key_exists('report_template_data', $data)) {
                $updatePayload['report_template_data'] = $data['report_template_data'];
            }

            if ($advance->status === 'rejected') {
                throw new \Illuminate\Auth\Access\AuthorizationException('Rejected cash advances (exceeded revision limit) cannot be edited.');
            }

            // Reset revise → pending on re-submission
            if ($advance->status === 'revise') {
                $updatePayload['status'] = 'pending';
            }

            $beforeState = $advance->toArray();
            $advance->update($updatePayload);

            // Handle new document uploads — replace existing documents
            if (!empty($files)) {
                // Delete old documents from storage
                foreach ($advance->document()->get() as $doc) {
                    Storage::disk('supabase')->delete($doc->file_path);
                    $doc->delete();
                }

                // Upload new documents
                foreach ($files as $file) {
                    $path = $file->store('cash_advances/documents', 'supabase');
                    CashAdvanceDocument::create([
                        'cash_advance_id' => $advance->id,
                        'file_path' => $path,
                        'file_type' => $file->getClientMimeType(),
                        'file_name' => $file->getClientOriginalName(),
                    ]);
                }
            }

            // Record status transition if status changed
            if ($oldStatus !== $advance->status) {
                CashAdvanceStatusHistory::create([
                    'cash_advance_id' => $advance->id,
                    'from_status' => $oldStatus,
                    'to_status' => $advance->status,
                    'changed_by' => $user->id,
                ]);
            }

            $actionType = $oldStatus === 'revise' ? 'CASH_ADVANCE_RESUBMITTED' : 'CASH_ADVANCE_UPDATED';
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'employee',
                actionType: $actionType,
                entityType: 'cash_advance',
                entityId: $advance->id,
                beforeState: $beforeState,
                afterState: $advance->fresh()->toArray()
            );

            NotificationService::notifyAdmins(
                type: 'admin_cash_advance_resubmitted',
                module: 'Cash Advance',
                title: 'Cash Advance Resubmitted',
                message: "{$user->name} updated/resubmitted Cash Advance #{$advance->id} (" . NotificationService::formatPeso($advance->amount) . ").",
                recordLink: "/cash-advances?view={$advance->id}",
                recordType: 'cash_advance',
                recordId: $advance->id,
                excludeUserId: $user->id
            );

            return $advance;
        });
    }

    /**
     * Delete a pending cash advance request.
     *
     * Only the owner can delete, and only when status is pending.
     */
    public function deleteAdvance(CashAdvance $advance, User $user, string $password, Request $requestContext)
    {
        // Verify password against external auth service
        if (!PasswordVerificationService::verify($requestContext, $password)) {
            throw ValidationException::withMessages([
                'password' => ['Invalid password. Please try again.']
            ]);
        }

        return DB::transaction(function () use ($advance) {
            // Delete documents from storage
            foreach ($advance->document()->get() as $doc) {
                Storage::disk('supabase')->delete($doc->file_path);
                $doc->delete();
            }

            // Delete related records
            $advance->approvalActions()->delete();
            $advance->statusHistory()->delete();

            $advance->delete();

            return true;
        });
    }
}
