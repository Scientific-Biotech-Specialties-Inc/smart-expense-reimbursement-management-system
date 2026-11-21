<?php

namespace App\Modules\Shared\Traits;

use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Support\Facades\Cache;

/**
 * Shared cache-key and hydration helper for receipts split during OCR processing.
 */
trait HydratesSplitReceipts
{
    /**
     * Build the cache key storing split parent-child segment metadata.
     */
    protected function splitChildrenCacheKey(int $receiptId): string
    {
        return "receipt_split_children:{$receiptId}";
    }

    /**
     * Attach `segment_indices` and hydrated `split_receipts` to a parent receipt when cached.
     */
    protected function hydrateSplitMetadata(Receipt $receipt): Receipt
    {
        $metadata = Cache::get($this->splitChildrenCacheKey((int) $receipt->id));

        if (!is_array($metadata) || empty($metadata['children']) || !is_array($metadata['children'])) {
            return $receipt;
        }

        $childIds = array_values(array_filter(
            array_map(fn ($entry) => is_array($entry) ? ($entry['id'] ?? null) : null, $metadata['children'])
        ));

        if (empty($childIds)) {
            return $receipt;
        }

        $childrenById = Receipt::with(['category', 'items', 'uploader'])
            ->whereIn('id', $childIds)
            ->get()
            ->keyBy('id');

        $splitReceipts = [];
        foreach ($metadata['children'] as $entry) {
            if (!is_array($entry) || empty($entry['id'])) {
                continue;
            }
            $child = $childrenById->get($entry['id']);
            if ($child) {
                $child->setAttribute('segment_indices', array_values($entry['segment_indices'] ?? []));
                $splitReceipts[] = $child;
            }
        }

        $receipt->setAttribute('segment_indices', array_values($metadata['segment_indices'] ?? [0]));
        $receipt->setAttribute('split_receipts', $splitReceipts);

        return $receipt;
    }
}
