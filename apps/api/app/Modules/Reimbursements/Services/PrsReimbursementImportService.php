<?php

namespace App\Modules\Reimbursements\Services;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class PrsReimbursementImportService
{
    /**
     * Build shared PRS reimbursement validation rules, merging endpoint-specific rules.
     */
    public function baseRules(array $extraRules = []): array
    {
        return array_merge($extraRules, [
            'source_system' => ['required', Rule::in(['prs'])],
            'source_submission_id' => ['required'],
            'source_user.id' => ['nullable'],
            'source_user.name' => ['nullable', 'string', 'max:255'],
            'source_user.email' => ['nullable', 'email', 'max:255'],
            'source_user.department' => ['nullable', 'string', 'max:255'],
            'receipt.invoice_number' => ['required', 'string', 'max:255'],
            'receipt.transaction_date' => ['required', 'date'],
            'receipt.tin' => ['required', 'string', 'max:255'],
            'receipt.vendor_name' => ['required', 'string', 'max:255'],
            'receipt.expense_category_id' => ['nullable', 'integer', 'exists:expense_categories,id'],
            'receipt.vat_classification' => ['required', Rule::in(['vat', 'non-vat'])],
            'receipt.total_amount' => ['required', 'numeric', 'min:0.01'],
            'receipt.vat_amount' => ['nullable', 'numeric', 'min:0'],
            'receipt.file_url' => ['nullable', 'url', 'max:2048'],
            'receipt.items' => ['nullable', 'array'],
            'receipt.items.*.name' => ['required_with:receipt.items', 'string', 'max:255'],
            'receipt.items.*.quantity' => ['required_with:receipt.items', 'integer', 'min:1'],
            'receipt.items.*.price' => ['required_with:receipt.items', 'numeric', 'gt:0'],
            'reimbursement.description' => ['required', 'string', 'max:255'],
            'reimbursement.expense_category_id' => ['nullable', 'integer', 'exists:expense_categories,id'],
            'reimbursement.category' => ['nullable', 'string', 'max:100'],
            'reimbursement.amount' => ['required', 'numeric', 'min:0.01'],
            'reimbursement.date' => ['required', 'date'],
        ]);
    }

    /**
     * Persist an imported PRS reimbursement request, its receipt/items, and audit log atomically.
     */
    public function import(array $payload, array $reimbursementExtra = []): Reimbursement
    {
        try {
            return DB::transaction(function () use ($payload, $reimbursementExtra) {
                $sourceUser = $payload['source_user'] ?? [];
                $receiptData = $payload['receipt'];
                $claimData = $payload['reimbursement'];
                $expenseCategoryId = $claimData['expense_category_id']
                    ?? $receiptData['expense_category_id']
                    ?? null;

                if (!$expenseCategoryId && !empty($claimData['category'])) {
                    $expenseCategoryId = ExpenseCategory::firstOrCreate(['name' => $claimData['category']])->id;
                }

                $user = User::firstOrCreate(
                    ['email' => $sourceUser['email'] ?? 'prs-user-' . $payload['source_submission_id'] . '@prs.local'],
                    [
                        'name' => $sourceUser['name'] ?? 'PRS User ' . $payload['source_submission_id'],
                        'role' => 'employee',
                        'department' => $sourceUser['department'] ?? 'Sales & Marketing',
                    ]
                );

                $receipt = Receipt::create([
                    'uploaded_by' => $user->id,
                    'file_path' => $receiptData['file_url'] ?? null,
                    'file_hash' => null,
                    'file_type' => null,
                    'file_size_bytes' => null,
                    'vendor_name' => $receiptData['vendor_name'],
                    'transaction_date' => $receiptData['transaction_date'],
                    'total_amount' => $receiptData['total_amount'],
                    'vat_amount' => $receiptData['vat_amount'] ?? null,
                    'tin' => $receiptData['tin'],
                    'invoice_number' => $receiptData['invoice_number'],
                    'vat_classification' => $receiptData['vat_classification'],
                    'expense_category_id' => $receiptData['expense_category_id'] ?? null,
                    'status' => 'submitted',
                ]);

                if (!empty($receiptData['items'])) {
                    $receipt->items()->createMany($receiptData['items']);
                }

                $reimbursement = Reimbursement::create(array_merge([
                    'user_id' => $user->id,
                    'receipt_id' => $receipt->id,
                    'description' => $claimData['description'],
                    'expense_category_id' => $expenseCategoryId,
                    'amount' => $claimData['amount'],
                    'date' => $claimData['date'],
                    'report_file_path' => null,
                    'status' => 'submitted',
                    'submitted_by_name' => $user->name,
                    'source_system' => 'prs',
                    'source_submission_id' => (string) $payload['source_submission_id'],
                ], $reimbursementExtra));

                $reimbursement->receipts()->attach($receipt->id);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: $user->role ?? 'employee',
                    actionType: 'CLAIM_SUBMITTED',
                    entityType: 'reimbursement',
                    entityId: $reimbursement->id,
                    beforeState: null,
                    afterState: $reimbursement->toArray(),
                );

                return $reimbursement->load('receipts.items', 'user');
            });
        } catch (\Throwable $e) {
            Log::error('PrsReimbursementImportService::import failed', [
                'source_submission_id' => $payload['source_submission_id'] ?? null,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
