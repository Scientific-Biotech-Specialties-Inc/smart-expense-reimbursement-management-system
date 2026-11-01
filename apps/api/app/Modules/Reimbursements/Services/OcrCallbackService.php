<?php

namespace App\Modules\Reimbursements\Services;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OcrCallbackService
{
    /**
     * Apply AI-extracted OCR + categorization results to an existing receipt.
     *
     * Rules enforced:
     * - Idempotent: receipts already in 'pending' or 'processed' are skipped (replay guard).
     * - Low confidence (score < 0.80): receipt is set to 'flagged' and ocr_flagged = true.
     * - Items: existing items are deleted and replaced with the AI-returned list.
     * - expense_category string: resolved to an ExpenseCategory record (created if missing).
     * - Audit log: RECEIPT_OCR_COMPLETED is appended regardless of confidence level.
     *
     * @param  int   $receiptId  Route-bound receipt ID.
     * @param  array $data       Validated payload from OcrCallbackRequest.
     * @return Receipt           The freshly updated receipt with loaded relations.
     */
    public function handle(int $receiptId, array $data): Receipt
    {
        return DB::transaction(function () use ($receiptId, $data) {
            $receipt = Receipt::with('items')->findOrFail($receiptId);

            $beforeState = $receipt->toArray();

            // Replay guard — do not overwrite already-confirmed receipts.
            if (in_array($receipt->status, ['pending', 'processed'], true)) {
                Log::info('OcrCallbackService: skipping replay for already-confirmed receipt.', [
                    'receipt_id' => $receiptId,
                    'status'     => $receipt->status,
                ]);
                return $receipt->load('category', 'items', 'uploader');
            }

            // Resolve AI-suggested expense category string → category ID.
            $expenseCategoryId = $receipt->expense_category_id;
            if (!empty($data['expense_category'])) {
                $expenseCategoryId = ExpenseCategory::firstOrCreate(
                    ['name' => $data['expense_category']]
                )->id;
            }

            $confidenceScore = (float) ($data['ocr_confidence_score'] ?? 0.0);
            $isLowConfidence = $confidenceScore < 0.80;

            $isDuplicate = !empty($data['is_duplicate']);
            
            $isRejected = ($data['status'] ?? null) === 'rejected' || !empty($data['rejection_code']) || $isDuplicate;
            
            if ($isDuplicate) {
                $targetStatus = 'rejected';
                $rejectionCode = 'duplicate';
                $rejectionReason = 'Duplicate receipt detected based on semantic similarity.';
            } else {
                $targetStatus = $isRejected ? 'rejected' : ($isLowConfidence ? 'flagged' : 'processed');
                $rejectionCode = $data['rejection_code'] ?? ($isRejected ? 'blurry' : null);
                $rejectionReason = $data['rejection_reason'] ?? $data['error'] ?? null;
            }

            // Update OCR fields on the receipt.
            $receipt->update([
                'vendor_name'          => $data['vendor_name']       ?? $receipt->vendor_name,
                'transaction_date'     => $data['transaction_date']  ?? $receipt->transaction_date,
                'total_amount'         => $data['total_amount']       ?? $receipt->total_amount,
                'subtotal'             => $data['subtotal']           ?? $receipt->subtotal,
                'vat_amount'           => $data['vat_amount']         ?? $receipt->vat_amount,
                'tin'                  => $data['tin']                ?? $receipt->tin,
                'invoice_number'       => $data['invoice_number']     ?? $receipt->invoice_number,
                'vat_classification'   => $data['vat_classification'] ?? $receipt->vat_classification,
                'currency'             => $data['currency']           ?? $receipt->currency,
                'location'             => $data['location']           ?? $receipt->location,
                'expense_category_id'  => $expenseCategoryId,
                'ocr_confidence_score' => $confidenceScore,
                'ocr_flagged'          => $isLowConfidence || $isRejected,
                'status'               => $targetStatus,
                'rejection_code'       => $rejectionCode,
                'rejection_reason'     => $rejectionReason,
            ]);

            // Sync receipt items — delete old, insert AI-extracted ones.
            $receipt->items()->delete();
            if (!empty($data['items'])) {
                $receipt->items()->createMany($data['items']);
            }

            AuditLogService::log(
                actorId:    0, // System-generated event — no human actor.
                actorRole:  'system',
                actionType: $isRejected ? 'RECEIPT_OCR_REJECTED' : 'RECEIPT_OCR_COMPLETED',
                entityType: 'receipt',
                entityId:   $receipt->id,
                beforeState: $beforeState,
                afterState:  $receipt->fresh()->toArray(),
                ipAddress:   request()->ip(),
            );

            $amountText = $receipt->total_amount ? ' of ' . NotificationService::formatPeso($receipt->total_amount) : '';
            if ($isRejected) {
                $reasonText = $rejectionReason ? " Reason: {$rejectionReason}" : '';
                NotificationService::notifyUser(
                    userId: (int) $receipt->uploaded_by,
                    type: 'receipt_auto_rejected',
                    module: 'My Expense',
                    title: 'Receipt Auto-Rejected',
                    message: "Your My Expense receipt #{$receipt->id}{$amountText} was automatically rejected.{$reasonText}",
                    recordLink: "/my-expense?view={$receipt->id}",
                    recordType: 'receipt',
                    recordId: $receipt->id
                );
            } else {
                NotificationService::notifyUser(
                    userId: (int) $receipt->uploaded_by,
                    type: 'receipt_processed',
                    module: 'My Expense',
                    title: 'Receipt Processed',
                    message: "Your My Expense receipt #{$receipt->id}{$amountText} has been processed.",
                    recordLink: "/my-expense?view={$receipt->id}",
                    recordType: 'receipt',
                    recordId: $receipt->id
                );
            }

            Log::info('OcrCallbackService: OCR results applied.', [
                'receipt_id'    => $receiptId,
                'status'        => $receipt->status,
                'ocr_flagged'   => $isLowConfidence || $isRejected,
                'rejection_code' => $rejectionCode,
                'confidence'    => $confidenceScore,
            ]);

            return $receipt->fresh(['category', 'items', 'uploader']);
        });
    }
}
