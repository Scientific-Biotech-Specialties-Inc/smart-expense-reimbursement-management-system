<?php

namespace App\Modules\Reimbursements\Services;

use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Reimbursements\Jobs\UpdatePrsReimbursementStatusJob;
use App\Modules\Shared\Services\PasswordVerificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ReimbursementService
{
    private function updateReceiptStatuses(array $receiptIds, string $status, ?bool $isDraft = null): void
    {
        if (empty($receiptIds)) {
            return;
        }

        $data = ['status' => $status];
        if ($isDraft !== null) {
            $data['is_draft'] = $isDraft;
        }

        Receipt::whereIn('id', $receiptIds)->update($data);
    }

    /**
     * List all reimbursements.
     */
    public function listReimbursements(User $user, bool $canManage)
    {
        $query = Reimbursement::with(['receipts.category', 'user', 'expenseCategory', 'payout'])
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if (!$canManage) {
            $query->where('user_id', $user->id);
        }

        $reimbursements = $query->get();
        AuditLogService::enrichReimbursements($reimbursements, $canManage);
        return $reimbursements;
    }

    /**
     * Submit a new reimbursement request.
     */
    public function storeReimbursement(User $user, array $validated, $reportFile)
    {
        return DB::transaction(function () use ($user, $validated, $reportFile) {
            $receiptIds = array_values(array_unique($validated['receipt_ids']));
            $ownedReceiptCount = Receipt::whereIn('id', $receiptIds)
                ->where('uploaded_by', $user->id)
                ->count();

            if ($ownedReceiptCount !== count($receiptIds)) {
                throw ValidationException::withMessages([
                    'receipt_ids' => ['You can only submit reimbursements for your own receipts.'],
                ]);
            }

            $claimedReceiptIds = Receipt::whereIn('id', $receiptIds)
                ->whereHas('reimbursements')
                ->pluck('id')
                ->all();

            if (!empty($claimedReceiptIds)) {
                throw ValidationException::withMessages([
                    'receipt_ids' => ['One or more receipts are already attached to a reimbursement.'],
                ]);
            }

            if (!empty($validated['receipts'])) {
                foreach ($validated['receipts'] as $receiptData) {
                    $receipt = Receipt::find($receiptData['id']);
                    if ($receipt && $receipt->uploaded_by === $user->id) {
                        $receipt->update([
                            'expense_category_id' => $receiptData['expense_category_id'] ?? $receipt->expense_category_id,
                            'event_type' => $receiptData['event_type'] ?? $receipt->event_type,
                            'vendor_name' => $receiptData['vendor_name'] ?? $receipt->vendor_name,
                            'transaction_date' => $receiptData['transaction_date'] ?? $receipt->transaction_date,
                            'total_amount' => $receiptData['total_amount'] ?? $receipt->total_amount,
                            'subtotal' => $receiptData['subtotal'] ?? $receipt->subtotal,
                            'vat_amount' => $receiptData['vat_amount'] ?? $receipt->vat_amount,
                            'vat_classification' => $receiptData['vat_classification'] ?? $receipt->vat_classification,
                            'tin' => $receiptData['tin'] ?? $receipt->tin,
                            'invoice_number' => $receiptData['invoice_number'] ?? $receipt->invoice_number,
                            'location' => $receiptData['location'] ?? $receipt->location,
                        ]);

                        if (isset($receiptData['items'])) {
                            $receipt->items()->delete();
                            $receipt->items()->createMany($receiptData['items']);
                        }
                    }
                }
            }

            $expenseCategoryId = $validated['expense_category_id']
                ?? Receipt::whereIn('id', $receiptIds)->whereNotNull('expense_category_id')->value('expense_category_id');

            $reportPath = null;
            if ($reportFile) {
                $reportPath = $reportFile->store('reports', 'supabase');
            }

            $reimbursement = Reimbursement::create([
                'user_id' => $user->id,
                'description' => $validated['description'],
                'user_comment' => $validated['user_comment'] ?? null,
                'expense_category_id' => $expenseCategoryId,
                'event_type' => $validated['event_type'] ?? null,
                'amount' => $validated['amount'],
                'date' => $validated['date'],
                'report_file_path' => $reportPath,
                'report_template_data' => $validated['report_template_data'] ?? null,
                'status' => 'pending',
                'submitted_by_name' => $user->name,
            ]);

            $reimbursement->receipts()->attach($receiptIds);
            $this->updateReceiptStatuses($receiptIds, 'pending', false);

            $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
            $link = "/reimbursements?view={$reimbursement->id}";

            NotificationService::notifyUser(
                userId: $user->id,
                type: 'reimbursement_submitted',
                module: 'Reimbursement',
                title: 'Reimbursement Submitted',
                message: "Your reimbursement of {$formattedAmount} was submitted.",
                recordLink: $link,
                recordType: 'reimbursement',
                recordId: $reimbursement->id
            );

            NotificationService::notifyAdmins(
                type: 'admin_reimbursement_submitted',
                module: 'Reimbursement',
                title: 'New Reimbursement Request',
                message: "{$user->name} submitted a reimbursement request of {$formattedAmount}.",
                recordLink: $link,
                recordType: 'reimbursement',
                recordId: $reimbursement->id,
                excludeUserId: $user->id
            );

            if (!empty($reimbursement->user_comment)) {
                NotificationService::notifyAdmins(
                    type: 'admin_employee_note_added',
                    module: 'Reimbursement',
                    title: 'Employee Note on Reimbursement',
                    message: "{$user->name} left a note on Reimbursement #{$reimbursement->id}: \"{$reimbursement->user_comment}\"",
                    recordLink: $link,
                    recordType: 'reimbursement',
                    recordId: $reimbursement->id,
                    excludeUserId: $user->id
                );
            }

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'employee',
                actionType: 'CLAIM_SUBMITTED',
                entityType: 'reimbursement',
                entityId: $reimbursement->id,
                beforeState: null,
                afterState: $reimbursement->toArray()
            );

            AuditLogService::enrichReimbursement($reimbursement, false);
            return $reimbursement->load('receipts');
        });
    }

    /**
     * View detailed claim.
     */
    public function showReimbursement(User $user, int $id, bool $canManage)
    {
        $reimbursement = Reimbursement::with(['receipts.items', 'receipts.category', 'user', 'expenseCategory', 'payout'])->findOrFail($id);

        if (!$canManage && $reimbursement->user_id !== $user->id) {
            throw new \Illuminate\Auth\Access\AuthorizationException('Forbidden.');
        }

        AuditLogService::enrichReimbursement($reimbursement, $canManage);
        return $reimbursement;
    }

    /**
     * Approve claim.
     */
    public function approveReimbursement(User $user, int $id, ?string $password, string $ipAddress, Request $requestContext)
    {
        return DB::transaction(function () use ($user, $id, $password, $ipAddress, $requestContext) {
            // Verify password against external auth service if provided
            if (!empty($password) && !PasswordVerificationService::verify($requestContext, $password)) {
                throw ValidationException::withMessages([
                    'password' => ['Invalid password. Please try again.']
                ]);
            }

            $reimbursement = Reimbursement::findOrFail($id);

            // Self-approval check
            if ($reimbursement->user_id === $user->id) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Conflict. Self-approval is strictly prohibited.');
            }

            if (!in_array($reimbursement->status, ['pending', 'submitted'])) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Only pending reimbursements can be approved.');
            }

            $beforeState = $reimbursement->toArray();
            $reimbursement->update([
                'status' => 'approved',
                'approved_by' => $user->name,
                'approved_at' => now(),
            ]);
            $this->updateReceiptStatuses($reimbursement->receipts()->pluck('receipts.id')->all(), 'approved');
            $afterState = $reimbursement->toArray();

            // Immutable Audit Log
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'CLAIM_APPROVED',
                entityType: 'reimbursement',
                entityId: $reimbursement->id,
                beforeState: $beforeState,
                afterState: $afterState,
                ipAddress: $ipAddress
            );

            if ($reimbursement->is_request == 1 && !empty($reimbursement->source_submission_id)) {
                UpdatePrsReimbursementStatusJob::dispatch($reimbursement->source_submission_id);
            }

            $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
            NotificationService::notifyUser(
                userId: $reimbursement->user_id,
                type: 'reimbursement_approved',
                module: 'Reimbursement',
                title: 'Reimbursement Approved',
                message: "Your reimbursement of {$formattedAmount} was approved by {$user->name}.",
                recordLink: "/reimbursements?view={$reimbursement->id}",
                recordType: 'reimbursement',
                recordId: $reimbursement->id
            );

            AuditLogService::enrichReimbursement($reimbursement, true);
            return $reimbursement->load(['receipts.category', 'user', 'expenseCategory', 'payout']);
        });
    }

    /**
     * Reject / Revise claim — 3-strike workflow (2 revises + 1 terminal = 3 total).
     *
     * Admin chooses `revise` or `reject` via dropdown. Both increment `revision_count`
     * and map to status `revise` until threshold (2 revises allowed (<=2 revise, >=3 rejected) — 1st/2nd = revise, 3rd = terminal rejected, 3 total) where system auto-flips to `rejected` (terminal).
     * `rejected` is never set directly; it is system-derived only. 2 revises allowed (<=2 revise, >=3 rejected) — 1st/2nd = revise, 3rd = terminal rejected, 3 total.
     */
    public function rejectReimbursement(User $user, int $id, string $comment, ?string $password, string $ipAddress, Request $requestContext, string $action = 'revise')
    {
        return DB::transaction(function () use ($user, $id, $comment, $password, $ipAddress, $requestContext, $action) {
            // Verify password against external auth service if provided
            if (!empty($password) && !PasswordVerificationService::verify($requestContext, $password)) {
                throw ValidationException::withMessages([
                    'password' => ['Invalid password. Please try again.']
                ]);
            }

            $reimbursement = Reimbursement::where('id', $id)->lockForUpdate()->firstOrFail();

            // Self-rejection check
            if ($reimbursement->user_id === $user->id) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Conflict. Self-rejection/approval is prohibited.');
            }

            // Only pending, revise, or submitted can be returned; approved/granted/rejected are terminal for this action
            if (!in_array($reimbursement->status, ['pending', 'revise', 'submitted'])) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Only pending, revise, or submitted reimbursements can be revised/rejected.');
            }

            $beforeState = $reimbursement->toArray();

            $currentCount = (int) ($reimbursement->revision_count ?? 0);
            $newCount = $currentCount + 1;
            // 2 revises allowed (<=2 revise, >=3 rejected) — 1st/2nd = revise, 3rd = terminal rejected, 3 total
            // If action is explicit 'reject', it transitions immediately to 'rejected'.
            $newStatus = ($action === 'reject' || $newCount > 2) ? 'rejected' : 'revise';
            $isTerminal = $newStatus === 'rejected';

            $reimbursement->update([
                'status' => $newStatus,
                'revision_count' => $newCount,
                'admin_notes' => $comment,
                'rejection_comment' => $comment,
            ]);
            $this->updateReceiptStatuses($reimbursement->receipts()->pluck('receipts.id')->all(), $newStatus);
            $afterState = $reimbursement->toArray();

            // Immutable Audit Log — distinguish revise vs terminal rejected
            $actionType = $isTerminal ? 'CLAIM_REJECTED' : ($action === 'revise' ? 'CLAIM_REVISED' : 'CLAIM_REJECTED');

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: $actionType,
                entityType: 'reimbursement',
                entityId: $reimbursement->id,
                beforeState: $beforeState,
                afterState: $afterState,
                ipAddress: $ipAddress
            );

            $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
            $statusType = $isTerminal ? 'reimbursement_rejected' : 'reimbursement_revised';
            $statusTitle = $isTerminal ? 'Reimbursement Rejected' : 'Reimbursement Needs Revision';
            $statusVerb = $isTerminal ? 'rejected' : 'returned for revision';

            NotificationService::notifyUser(
                userId: $reimbursement->user_id,
                type: $statusType,
                module: 'Reimbursement',
                title: $statusTitle,
                message: "Your reimbursement of {$formattedAmount} was {$statusVerb}. Admin comment: \"{$comment}\"",
                recordLink: "/reimbursements?view={$reimbursement->id}",
                recordType: 'reimbursement',
                recordId: $reimbursement->id
            );

            AuditLogService::enrichReimbursement($reimbursement, true);
            return $reimbursement;
        });
    }

    /**
     * Grant (disburse) a previously approved claim.
     */
    public function grantReimbursement(User $user, int $id, ?string $password, string $ipAddress, Request $requestContext, array $payoutData = [])
    {
        return DB::transaction(function () use ($user, $id, $password, $ipAddress, $requestContext, $payoutData) {
            // Verify password against external auth service if provided
            if (!empty($password) && !PasswordVerificationService::verify($requestContext, $password)) {
                throw ValidationException::withMessages([
                    'password' => ['Invalid password. Please try again.']
                ]);
            }

            $reimbursement = Reimbursement::with('payout')->findOrFail($id);

            // Status guard: only approved reimbursements can be granted and only once
            if ($reimbursement->status !== 'approved' || $reimbursement->payout()->exists()) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Only approved reimbursements can be granted, and cannot be granted again.');
            }

            // Self-grant check
            if ($reimbursement->user_id === $user->id) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Self-grant is prohibited.');
            }

            $beforeState = $reimbursement->toArray();
            $reimbursement->update(['status' => 'granted']);
            $this->updateReceiptStatuses($reimbursement->receipts()->pluck('receipts.id')->all(), 'granted');

            // Create linked Payout record
            $requestDate = $reimbursement->date ?? $reimbursement->created_at;
            $approvedAt = $reimbursement->approved_at ?? now();
            $approvedBy = $reimbursement->approved_by ?? ($payoutData['approved_by'] ?? 'Approver');
            $grantedBy = $payoutData['granted_by'] ?? $user->name;
            $payoutMethod = $payoutData['payout_method'] ?? 'Cash';
            $payoutMethodOther = $payoutData['payout_method_other'] ?? null;
            $granterSignature = $payoutData['granter_signature'] ?? null;

            \App\Modules\Reimbursements\Models\Payout::create([
                'reimbursement_id' => $reimbursement->id,
                'request_date' => $requestDate,
                'approved_at' => $approvedAt,
                'granted_at' => now(),
                'approved_by' => $approvedBy,
                'granted_by' => $grantedBy,
                'payout_method' => $payoutMethod,
                'payout_method_other' => $payoutMethodOther,
                'amount' => $reimbursement->amount,
                'granter_signature' => $granterSignature,
            ]);

            $afterState = $reimbursement->toArray();

            // Immutable Audit Log
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'CLAIM_GRANTED',
                entityType: 'reimbursement',
                entityId: $reimbursement->id,
                beforeState: $beforeState,
                afterState: $afterState,
                ipAddress: $ipAddress
            );

            if ($reimbursement->is_request == 1 && !empty($reimbursement->source_submission_id)) {
                UpdatePrsReimbursementStatusJob::dispatch($reimbursement->source_submission_id);
            }

            $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
            NotificationService::notifyUser(
                userId: $reimbursement->user_id,
                type: 'reimbursement_granted',
                module: 'Reimbursement',
                title: 'Reimbursement Granted',
                message: "Your reimbursement of {$formattedAmount} has been granted ({$payoutMethod}). Please sign to acknowledge receipt.",
                recordLink: "/reimbursements?view={$reimbursement->id}",
                recordType: 'reimbursement',
                recordId: $reimbursement->id
            );

            AuditLogService::enrichReimbursement($reimbursement, true);
            return $reimbursement->load(['receipts.category', 'user', 'expenseCategory', 'payout']);
        });
    }

    /**
     * Employee signs to acknowledge their granted payout.
     */
    public function acknowledgePayout(User $user, int $id, string $employeeSignature, string $ipAddress)
    {
        return DB::transaction(function () use ($user, $id, $employeeSignature, $ipAddress) {
            $reimbursement = Reimbursement::with('payout')->findOrFail($id);

            if ($reimbursement->user_id !== $user->id) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Forbidden. You do not own this reimbursement.');
            }

            if ($reimbursement->status !== 'granted' || !$reimbursement->payout) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Only granted payouts can be acknowledged.');
            }

            $payout = $reimbursement->payout;
            if (!empty($payout->acknowledged_at) || !empty($payout->employee_signature)) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Payout has already been acknowledged and is locked.');
            }

            $beforeState = $payout->toArray();
            $payout->update([
                'employee_signature' => $employeeSignature,
                'acknowledged_at' => now(),
            ]);
            $afterState = $payout->toArray();

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role,
                actionType: 'PAYOUT_ACKNOWLEDGED',
                entityType: 'reimbursement',
                entityId: $reimbursement->id,
                beforeState: $beforeState,
                afterState: $afterState,
                ipAddress: $ipAddress
            );

            $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
            $payoutLink = "/payout?view={$reimbursement->id}";

            NotificationService::notifyUser(
                userId: $user->id,
                type: 'payout_acknowledged',
                module: 'Reimbursement',
                title: 'Payout Acknowledged',
                message: "You signed to acknowledge your payout of {$formattedAmount} for Reimbursement #{$reimbursement->id}.",
                recordLink: $payoutLink,
                recordType: 'reimbursement',
                recordId: $reimbursement->id
            );

            NotificationService::notifyAdmins(
                type: 'admin_payout_signed',
                module: 'Reimbursement',
                title: 'Employee Signed Payout',
                message: "{$user->name} signed to acknowledge payout of {$formattedAmount} for Reimbursement #{$reimbursement->id}.",
                recordLink: $payoutLink,
                recordType: 'reimbursement',
                recordId: $reimbursement->id,
                excludeUserId: $user->id
            );

            AuditLogService::enrichReimbursement($reimbursement, false);
            return $reimbursement->load(['receipts.category', 'user', 'expenseCategory', 'payout']);
        });
    }

    /**
     * Update reimbursement details.
     *
     * Supports two modes:
     * 1. Admin: update admin_notes / status (existing behaviour)
     * 2. Employee self-edit: update fields when status is pending or revise
     */
    public function updateReimbursement(User $user, int $id, array $data, bool $canManage, $reportFile = null)
    {
        $reimbursement = Reimbursement::findOrFail($id);

        if ($reimbursement->status === 'granted') {
            throw new \Illuminate\Auth\Access\AuthorizationException('Granted reimbursement records are locked and cannot be modified.');
        }

        // Admin mode — existing behaviour
        if ($canManage && ($user->id !== $reimbursement->user_id)) {
            if (!empty($data['status']) && $data['status'] === 'granted') {
                throw new \Illuminate\Auth\Access\AuthorizationException('Use POST /{id}/grant with password verification.');
            }
            $beforeAdmin = $reimbursement->toArray();
            $reimbursement->update($data);
            if (!empty($data['status']) && in_array($data['status'], ['pending', 'approved', 'revise', 'rejected'])) {
                $this->updateReceiptStatuses(
                    $reimbursement->receipts()->pluck('receipts.id')->all(),
                    $data['status'],
                );
            }

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'admin',
                actionType: 'CLAIM_UPDATED',
                entityType: 'reimbursement',
                entityId: $reimbursement->id,
                beforeState: $beforeAdmin,
                afterState: $reimbursement->fresh()->toArray()
            );

            if (!empty($data['admin_notes'])) {
                NotificationService::notifyUser(
                    userId: $reimbursement->user_id,
                    type: 'reimbursement_admin_note',
                    module: 'Reimbursement',
                    title: 'Admin Note on Reimbursement',
                    message: "Admin note added to Reimbursement #{$reimbursement->id}: \"{$data['admin_notes']}\"",
                    recordLink: "/reimbursements?view={$reimbursement->id}",
                    recordType: 'reimbursement',
                    recordId: $reimbursement->id
                );
            }

            if (!empty($data['status']) && $data['status'] === 'cancelled') {
                NotificationService::notifyUser(
                    userId: $reimbursement->user_id,
                    type: 'reimbursement_cancelled',
                    module: 'Reimbursement',
                    title: 'Reimbursement Cancelled',
                    message: "Your Reimbursement #{$reimbursement->id} was cancelled.",
                    recordLink: "/reimbursements?view={$reimbursement->id}",
                    recordType: 'reimbursement',
                    recordId: $reimbursement->id
                );
            }

            AuditLogService::enrichReimbursement($reimbursement, true);
            return $reimbursement;
        }

         // Employee self-edit mode
        if ($reimbursement->user_id !== $user->id) {
            throw new \Illuminate\Auth\Access\AuthorizationException('Forbidden. You do not own this reimbursement.');
        }

        if ($reimbursement->status === 'rejected') {
            throw new \Illuminate\Auth\Access\AuthorizationException('Rejected reimbursements (exceeded revision limit) cannot be edited.');
        }

        if (!in_array($reimbursement->status, ['pending', 'revise'])) {
            throw new \Illuminate\Auth\Access\AuthorizationException('Only pending or revise reimbursements can be edited.');
        }

        return DB::transaction(function () use ($reimbursement, $user, $data, $reportFile) {
            $wasRevise = $reimbursement->status === 'revise';
            $previousComment = $reimbursement->user_comment;
            $beforeState = $reimbursement->toArray();

            // Update receipt data if provided
            if (!empty($data['receipts'])) {
                foreach ($data['receipts'] as $receiptData) {
                    $receipt = Receipt::find($receiptData['id']);
                    if ($receipt && $receipt->uploaded_by === $user->id) {
                        $receipt->update([
                            'expense_category_id' => $receiptData['expense_category_id'] ?? $receipt->expense_category_id,
                            'event_type' => $receiptData['event_type'] ?? $receipt->event_type,
                            'vendor_name' => $receiptData['vendor_name'] ?? $receipt->vendor_name,
                            'transaction_date' => $receiptData['transaction_date'] ?? $receipt->transaction_date,
                            'total_amount' => $receiptData['total_amount'] ?? $receipt->total_amount,
                            'subtotal' => $receiptData['subtotal'] ?? $receipt->subtotal,
                            'vat_amount' => $receiptData['vat_amount'] ?? $receipt->vat_amount,
                            'vat_classification' => $receiptData['vat_classification'] ?? $receipt->vat_classification,
                            'tin' => $receiptData['tin'] ?? $receipt->tin,
                            'invoice_number' => $receiptData['invoice_number'] ?? $receipt->invoice_number,
                            'location' => $receiptData['location'] ?? $receipt->location,
                        ]);

                        if (isset($receiptData['items'])) {
                            $receipt->items()->delete();
                            $receipt->items()->createMany($receiptData['items']);
                        }
                    }
                }
            }

            // Sync receipt associations if provided
            if (!empty($data['receipt_ids'])) {
                $currentReceiptIds = $reimbursement->receipts()->pluck('receipts.id')->all();
                $newReceiptIds = array_values(array_unique($data['receipt_ids']));

                $detachedReceiptIds = array_values(array_diff($currentReceiptIds, $newReceiptIds));

                $reimbursement->receipts()->sync($newReceiptIds);
                $this->updateReceiptStatuses($newReceiptIds, 'pending');
                $this->updateReceiptStatuses($detachedReceiptIds, 'processed');
            }

            // Handle report file upload
            $reportPath = $reimbursement->report_file_path;
            if ($reportFile) {
                // Delete old file if exists
                if ($reportPath) {
                    Storage::disk('supabase')->delete($reportPath);
                }
                $reportPath = $reportFile->store('reports', 'supabase');
            }

            // Build update payload
            $updatePayload = array_filter([
                'description' => $data['description'] ?? null,
                'expense_category_id' => $data['expense_category_id'] ?? null,
                'event_type' => $data['event_type'] ?? null,
                'amount' => $data['amount'] ?? null,
                'date' => $data['date'] ?? null,
                'report_file_path' => $reportPath,
            ], fn($v) => $v !== null);

            if (array_key_exists('user_comment', $data)) {
                $updatePayload['user_comment'] = $data['user_comment'];
            }

            if (array_key_exists('report_template_data', $data)) {
                $updatePayload['report_template_data'] = $data['report_template_data'];
            }

            // Reset revise → pending on re-submission (rejected terminal cannot be reset)
            if ($reimbursement->status === 'revise') {
                $updatePayload['status'] = 'pending';
                $updatePayload['rejection_comment'] = null;
                $this->updateReceiptStatuses($reimbursement->receipts()->pluck('receipts.id')->all(), 'pending');
            }

            $reimbursement->update($updatePayload);

            $actionType = $wasRevise ? 'CLAIM_RESUBMITTED' : 'CLAIM_UPDATED';
            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'employee',
                actionType: $actionType,
                entityType: 'reimbursement',
                entityId: $reimbursement->id,
                beforeState: $beforeState,
                afterState: $reimbursement->fresh()->toArray()
            );

            if ($wasRevise || $reportFile !== null) {
                $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
                NotificationService::notifyAdmins(
                    type: 'admin_reimbursement_resubmitted',
                    module: 'Reimbursement',
                    title: 'Reimbursement Resubmitted',
                    message: "{$user->name} updated and resubmitted Reimbursement #{$reimbursement->id} ({$formattedAmount}).",
                    recordLink: "/reimbursements?view={$reimbursement->id}",
                    recordType: 'reimbursement',
                    recordId: $reimbursement->id,
                    excludeUserId: $user->id
                );
            }

            if (!empty($data['user_comment']) && $data['user_comment'] !== $previousComment) {
                NotificationService::notifyAdmins(
                    type: 'admin_employee_note_added',
                    module: 'Reimbursement',
                    title: 'Employee Note on Reimbursement',
                    message: "{$user->name} added a comment on Reimbursement #{$reimbursement->id}: \"{$data['user_comment']}\"",
                    recordLink: "/reimbursements?view={$reimbursement->id}",
                    recordType: 'reimbursement',
                    recordId: $reimbursement->id,
                    excludeUserId: $user->id
                );
            }

            AuditLogService::enrichReimbursement($reimbursement, false);
            return $reimbursement->load('receipts');
        });
    }

    /**
     * Delete a pending reimbursement request.
     *
     * Only the owner can delete, and only when status is pending.
     */
    public function deleteReimbursement(User $user, int $id, string $password, Request $requestContext)
    {
        $reimbursement = Reimbursement::findOrFail($id);

        if ($reimbursement->user_id !== $user->id) {
            throw new \Illuminate\Auth\Access\AuthorizationException('Forbidden. You do not own this reimbursement.');
        }

        if ($reimbursement->status !== 'pending') {
            throw new \Illuminate\Auth\Access\AuthorizationException('Only pending reimbursements can be deleted.');
        }

        // Verify password against external auth service
        if (!PasswordVerificationService::verify($requestContext, $password)) {
            throw ValidationException::withMessages([
                'password' => ['Invalid password. Please try again.']
            ]);
        }

        return DB::transaction(function () use ($reimbursement) {
            $receiptIds = $reimbursement->receipts()->pluck('receipts.id')->all();

            // Detach receipt associations
            $reimbursement->receipts()->detach();
            $this->updateReceiptStatuses($receiptIds, 'processed');

            // Remove report file from storage
            if ($reimbursement->report_file_path) {
                Storage::disk('supabase')->delete($reimbursement->report_file_path);
            }

            $reimbursement->delete();

            return true;
        });
    }
}
