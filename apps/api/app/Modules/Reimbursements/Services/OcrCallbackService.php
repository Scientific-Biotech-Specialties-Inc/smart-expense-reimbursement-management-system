<?php

namespace App\Modules\Reimbursements\Services;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Shared\Services\CmsVendorVerificationService;
use App\Modules\Shared\Services\CurrencyConversionService;
use App\Modules\Shared\Traits\HydratesSplitReceipts;
use App\Modules\Shared\Traits\ValidatesReceiptDuplicates;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OcrCallbackService
{
    use ValidatesReceiptDuplicates;
    use HydratesSplitReceipts;

    /**
     * Apply AI-extracted OCR + categorization results to an existing receipt,
     * auto-splitting multi-receipt uploads when `split_receipts` is returned.
     *
     * Rules enforced:
     * - Idempotent: receipts already finalized are skipped (replay guard).
     * - Low confidence (score < 0.80): receipt is set to 'flagged' and ocr_flagged = true.
     * - Items: existing items are deleted and replaced with the AI-returned list.
     * - expense_category string: resolved to an ExpenseCategory record (created if missing).
     * - Audit log: RECEIPT_OCR_COMPLETED / RECEIPT_OCR_REJECTED is appended inside the DB transaction.
     *
     * @param  int   $receiptId  Route-bound receipt ID.
     * @param  array $data       Validated payload from OcrCallbackRequest.
     * @return Receipt           The freshly updated receipt with loaded relations.
     */
    public function handle(int $receiptId, array $data): Receipt
    {
        $splitCachePayload = null;

        $result = DB::transaction(function () use ($receiptId, $data, &$splitCachePayload) {
            $receipt = Receipt::with('items')->findOrFail($receiptId);

            // Replay guard — do not overwrite already-confirmed or already-rejected receipts.
            if (in_array(strtolower((string) $receipt->status), ['pending', 'processed', ...Receipt::REJECTED_STATUSES], true)) {
                Log::info('OcrCallbackService: skipping replay for already-finalized receipt.', [
                    'receipt_id' => $receiptId,
                    'status'     => $receipt->status,
                ]);
                $receipt->load('category', 'items', 'uploader');
                $this->hydrateSplitMetadata($receipt);
                $cachedChildren = $receipt->getAttribute('split_receipts');
                if (is_array($cachedChildren)) {
                    $receipt->setAttribute(
                        'split_receipt_ids',
                        array_values(array_map(fn (Receipt $child) => $child->id, $cachedChildren))
                    );
                }

                return $receipt;
            }

            $beforeState = $receipt->toArray();
            $splitPayloads = $data['split_receipts'] ?? [];

            if (empty($splitPayloads) || !is_array($splitPayloads)) {
                $hashes = $this->extractFileArrays($receipt)['file_hash'];
                $hasHashDuplicate = count($hashes) > 1
                    && $this->duplicateReceiptExists($hashes, $receipt->id);

                return $this->applyOcrResultToReceipt(
                    receipt: $receipt,
                    data: $data,
                    hasHashDuplicate: $hasHashDuplicate,
                    beforeState: $beforeState,
                );
            }

            $originalFiles = $this->extractFileArrays($receipt);
            $primaryIndices = $this->normalizeSegmentIndices($data['segment_indices'] ?? null, [0]);
            $primaryFiles = $this->sliceFileArrays($originalFiles, $primaryIndices);
            $primaryHashes = array_values(array_filter($primaryFiles['file_hash']));
            $primaryHashDuplicate = !empty($primaryHashes)
                && $this->duplicateReceiptExists($primaryHashes, $receipt->id);

            $receipt = $this->applyOcrResultToReceipt(
                receipt: $receipt,
                data: $data,
                hasHashDuplicate: $primaryHashDuplicate,
                slicedFiles: $primaryFiles,
                beforeState: $beforeState,
            );

            $seenBatchHashes = $primaryHashes;
            $splitIds = [];
            $splitChildrenModels = [];
            $childrenMeta = [];
            $fallbackOffset = count($primaryIndices);

            foreach ($splitPayloads as $childPayload) {
                $defaultFallback = array_key_exists($fallbackOffset, $originalFiles['file_path'])
                    ? [$fallbackOffset]
                    : [];
                $childIndices = $this->normalizeSegmentIndices(
                    $childPayload['segment_indices'] ?? null,
                    $defaultFallback
                );
                $fallbackOffset += max(1, count($childIndices));
                $childFiles = $this->sliceFileArrays($originalFiles, $childIndices);

                $child = Receipt::create([
                    'uploaded_by'          => $receipt->uploaded_by,
                    'file_path'            => $childFiles['file_path'],
                    'file_hash'            => $childFiles['file_hash'],
                    'file_type'            => $childFiles['file_type'],
                    'file_size_bytes'      => $childFiles['file_size_bytes'],
                    'discount_amount'      => 0,
                    'discount_type'        => 'none',
                    'ocr_confidence_score' => null,
                    'ocr_flagged'          => false,
                    'is_archived'          => false,
                    'is_draft'             => (bool) $receipt->is_draft,
                    'status'               => 'processing',
                ]);

                AuditLogService::log(
                    actorId: 0,
                    actorRole: 'system',
                    actionType: 'RECEIPT_CREATED',
                    entityType: 'receipt',
                    entityId: $child->id,
                    beforeState: null,
                    afterState: $child->toArray(),
                    ipAddress: request()->ip(),
                );

                $childHashes = array_values(array_filter($childFiles['file_hash']));
                $childInBatchDup = !empty($childHashes) && !empty(array_intersect($childHashes, $seenBatchHashes));
                $childDbDup = !empty($childHashes) && $this->duplicateReceiptExists($childHashes, $child->id);

                $childBeforeState = $child->toArray();
                $child = $this->applyOcrResultToReceipt(
                    receipt: $child,
                    data: $childPayload,
                    hasHashDuplicate: $childInBatchDup || $childDbDup,
                    beforeState: $childBeforeState,
                );
                $child->setAttribute('segment_indices', $childIndices);

                $seenBatchHashes = array_values(array_unique(array_merge($seenBatchHashes, $childHashes)));
                $splitIds[] = $child->id;
                $splitChildrenModels[] = $child;
                $childrenMeta[] = [
                    'id'              => $child->id,
                    'segment_indices' => $childIndices,
                ];
            }

            $splitCachePayload = [
                'segment_indices' => $primaryIndices,
                'children'        => $childrenMeta,
            ];

            $receipt->setAttribute('segment_indices', $primaryIndices);
            $receipt->setAttribute('split_receipt_ids', $splitIds);
            $receipt->setAttribute('split_receipts', $splitChildrenModels);

            return $receipt;
        });

        if ($splitCachePayload !== null) {
            Cache::put(
                $this->splitChildrenCacheKey((int) $result->id),
                $splitCachePayload,
                now()->addMinutes(30)
            );
        }

        return $result;
    }

    /**
     * Apply OCR extraction fields, line items, status/duplicate evaluation, audit log,
     * and user notification to a single Receipt model inside the active DB transaction.
     */
    private function applyOcrResultToReceipt(
        Receipt $receipt,
        array $data,
        bool $hasHashDuplicate = false,
        ?array $slicedFiles = null,
        ?array $beforeState = null,
    ): Receipt {
        $before = $beforeState ?? $receipt->toArray();

        $expenseCategoryId = $receipt->expense_category_id;
        if (!empty($data['expense_category'])) {
            $expenseCategoryId = ExpenseCategory::firstOrCreate(
                ['name' => $data['expense_category']]
            )->id;
        }

        $confidenceScore = (float) ($data['ocr_confidence_score'] ?? 0.0);
        $isLowConfidence = $confidenceScore < 0.80;

        $isPayloadDuplicate = !empty($data['is_duplicate']);
        $isDuplicate = $isPayloadDuplicate || $hasHashDuplicate;
        $incomingStatus = isset($data['status']) ? strtolower(trim((string) $data['status'])) : null;
        $providedCode = isset($data['rejection_code']) && trim((string) $data['rejection_code']) !== ''
            ? trim((string) $data['rejection_code'])
            : null;

        $isFailed = !$isDuplicate && $incomingStatus === 'failed';
        $isRejected = !$isFailed && ($incomingStatus === 'rejected' || $providedCode !== null || $isDuplicate);

        if ($isDuplicate) {
            $targetStatus = 'rejected';
            $rejectionCode = 'duplicate';
            if ($isPayloadDuplicate && !empty($data['rejection_reason'])) {
                $rejectionReason = $data['rejection_reason'];
            } elseif ($isPayloadDuplicate && !empty($data['error'])) {
                $rejectionReason = $data['error'];
            } elseif ($hasHashDuplicate) {
                $rejectionReason = 'Duplicate detected. A receipt with this file hash already exists.';
            } else {
                $rejectionReason = 'Duplicate receipt detected based on semantic similarity.';
            }
        } elseif ($isFailed) {
            $targetStatus = 'failed';
            $rejectionCode = $providedCode ?? 'ocr_failed';
            $rejectionReason = $data['rejection_reason'] ?? $data['error'] ?? 'OCR processing failed. You can retry OCR.';
        } else {
            $targetStatus = $isRejected ? 'rejected' : ($isLowConfidence ? 'flagged' : 'processed');
            $rejectionCode = $providedCode ?? ($isRejected ? 'unreadable' : null);
            $rejectionReason = $data['rejection_reason'] ?? $data['error'] ?? null;
            if ($isRejected && ($rejectionReason === null || trim((string) $rejectionReason) === '')) {
                $rejectionReason = Receipt::DEFAULT_UNREADABLE_REASON;
            }
        }

        $discountAmount = isset($data['discount_amount']) ? (float) $data['discount_amount'] : (float) ($receipt->discount_amount ?? 0);
        $discountType = $data['discount_type'] ?? $receipt->discount_type ?? ($discountAmount > 0 ? 'other' : 'none');

        $updatePayload = [
            'vendor_name'          => $data['vendor_name']       ?? $receipt->vendor_name,
            'transaction_date'     => $data['transaction_date']  ?? $receipt->transaction_date,
            'total_amount'         => $data['total_amount']       ?? $receipt->total_amount,
            'subtotal'             => $data['subtotal']           ?? $receipt->subtotal,
            'vat_amount'           => $data['vat_amount']         ?? $receipt->vat_amount,
            'discount_amount'      => $discountAmount,
            'discount_type'        => $discountType,
            'tin'                  => $data['tin']                ?? $receipt->tin,
            'invoice_number'       => $data['invoice_number']     ?? $receipt->invoice_number,
            'vat_classification'   => $data['vat_classification'] ?? $receipt->vat_classification,
            'currency'             => $data['currency']           ?? $receipt->currency,
            'location'             => $data['location']           ?? $receipt->location,
            'expense_category_id'  => $expenseCategoryId,
            'ocr_confidence_score' => $confidenceScore,
            'ocr_flagged'          => $isLowConfidence || $isRejected || $isFailed,
            'status'               => $targetStatus,
            'rejection_code'       => $rejectionCode,
            'rejection_reason'     => $rejectionReason,
        ];

        if ($slicedFiles !== null && !empty($slicedFiles['file_path'])) {
            $updatePayload['file_path'] = $slicedFiles['file_path'];
            $updatePayload['file_hash'] = $slicedFiles['file_hash'];
            $updatePayload['file_type'] = $slicedFiles['file_type'];
            $updatePayload['file_size_bytes'] = $slicedFiles['file_size_bytes'];
        }

        $updatePayload = app(CurrencyConversionService::class)->enrichReceiptPayload($updatePayload, $receipt);

        $receipt->update($updatePayload);

        $receipt->items()->delete();
        if (!empty($data['items'])) {
            $receipt->items()->createMany($data['items']);
        }

        if (!$isRejected && !$isFailed && ($receipt->vendor_name || $receipt->tin)) {
            app(CmsVendorVerificationService::class)->verifyAndTagReceipt($receipt);
        }

        $actionType = $isRejected
            ? 'RECEIPT_OCR_REJECTED'
            : ($isFailed ? 'RECEIPT_OCR_FAILED' : 'RECEIPT_OCR_COMPLETED');

        AuditLogService::log(
            actorId: 0, // System-generated event — no human actor.
            actorRole: 'system',
            actionType: $actionType,
            entityType: 'receipt',
            entityId: $receipt->id,
            beforeState: $before,
            afterState: $receipt->fresh()->toArray(),
            ipAddress: request()->ip(),
        );

        $amountText = '';
        if ($receipt->total_amount) {
            $currency = strtoupper((string) ($receipt->currency ?? 'PHP'));
            if ($currency !== 'PHP') {
                $originalFormatted = $currency . ' ' . number_format((float) $receipt->total_amount, 2, '.', ',');
                $phpFormatted = NotificationService::formatPeso($receipt->getEffectivePhpAmount());
                $amountText = " of {$originalFormatted} ({$phpFormatted})";
            } else {
                $amountText = ' of ' . NotificationService::formatPeso($receipt->total_amount);
            }
        }
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
        } elseif (!$isFailed) {
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
            'receipt_id'     => $receipt->id,
            'status'         => $receipt->status,
            'ocr_flagged'    => $isLowConfidence || $isRejected || $isFailed,
            'rejection_code' => $rejectionCode,
            'confidence'     => $confidenceScore,
        ]);

        return $receipt->fresh(['category', 'items', 'uploader']);
    }

    /**
     * Normalize `file_path`, `file_hash`, `file_type`, `file_size_bytes` to 0-indexed arrays.
     */
    private function extractFileArrays(Receipt $receipt): array
    {
        $normalize = static function ($value): array {
            if (is_array($value)) {
                return array_values($value);
            }

            return $value !== null && $value !== '' ? [$value] : [];
        };

        return [
            'file_path'       => $normalize($receipt->file_path),
            'file_hash'       => $normalize($receipt->file_hash),
            'file_type'       => $normalize($receipt->file_type),
            'file_size_bytes' => $normalize($receipt->file_size_bytes),
        ];
    }

    /**
     * Normalize segment index arrays with a deterministic fallback when empty/missing.
     */
    private function normalizeSegmentIndices(mixed $indices, array $fallback): array
    {
        if (!is_array($indices) || count($indices) === 0) {
            return $fallback;
        }

        return array_values(array_map('intval', $indices));
    }

    /**
     * Slice the receipt file arrays according to the given segment indices.
     */
    private function sliceFileArrays(array $originals, array $indices): array
    {
        $sliced = [
            'file_path'       => [],
            'file_hash'       => [],
            'file_type'       => [],
            'file_size_bytes' => [],
        ];

        foreach ($indices as $index) {
            if (!array_key_exists($index, $originals['file_path'])) {
                continue;
            }
            foreach (['file_path', 'file_hash', 'file_type', 'file_size_bytes'] as $column) {
                if (array_key_exists($index, $originals[$column])) {
                    $sliced[$column][] = $originals[$column][$index];
                }
            }
        }

        return $sliced;
    }
}
