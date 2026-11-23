<?php

namespace App\Modules\Shared\Traits;

use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Validation\ValidationException;

trait ValidatesReceiptDuplicates
{
    /**
     * Checks if a receipt with the given file hash already exists.
     * Throws a ValidationException if a duplicate is detected.
     *
     * @param string|array $fileHash
     * @param int|null $excludeReceiptId  When provided, a receipt with this id
     *     is ignored (e.g. resubmitting the same receipt with its own file).
     * @throws ValidationException
     */
    protected function validateDuplicateReceipt(string|array $fileHash, ?int $excludeReceiptId = null): void
    {
        if ($this->duplicateReceiptExists($fileHash, $excludeReceiptId)) {
            throw ValidationException::withMessages([
                'file_hash' => ['Duplicate detected. A receipt with this file hash already exists.']
            ]);
        }
    }

    /**
     * Validate file hash duplicates for single or multi-file uploads.
     *
     * Single-file uploads fail immediately when the hash exists. Multi-file
     * uploads fail upfront only when all uploaded files match existing DB
     * hashes; partial collisions defer to OcrCallbackService so duplicate
     * rejection can be isolated per split receipt.
     *
     * @param string|array $fileHash
     * @param int|null $excludeReceiptId
     * @throws ValidationException
     */
    protected function validateUploadDuplicates(string|array $fileHash, ?int $excludeReceiptId = null): void
    {
        $hashes = array_values(array_filter(
            is_array($fileHash) ? $fileHash : [$fileHash],
            fn ($hash) => !empty($hash)
        ));

        if (empty($hashes)) {
            return;
        }

        if (count($hashes) === 1) {
            $this->validateDuplicateReceipt($hashes[0], $excludeReceiptId);
            return;
        }

        foreach ($hashes as $hash) {
            if (!$this->duplicateReceiptExists($hash, $excludeReceiptId)) {
                return;
            }
        }

        throw ValidationException::withMessages([
            'file_hash' => ['Duplicate detected. A receipt with this file hash already exists.'],
        ]);
    }

    /**
     * Non-throwing duplicate check. Returns true when a non-deleted receipt
     * already holds one of the given file hashes, optionally excluding a
     * specific receipt id (used when resubmitting the same receipt so a
     * self-match is not treated as a collision with another receipt).
     *
     * This is the single source of truth for hash-based duplicate detection;
     * validateDuplicateReceipt() delegates to it so the two never diverge.
     *
     * @param string|array $fileHash
     * @param int|null $excludeReceiptId
     */
    protected function duplicateReceiptExists(string|array $fileHash, ?int $excludeReceiptId = null): bool
    {
        $hashes = is_array($fileHash) ? $fileHash : [$fileHash];

        foreach ($hashes as $hash) {
            if (empty($hash)) {
                continue;
            }

            $match = Receipt::where('file_hash', 'like', "%{$hash}%")
                ->whereNull('deleted_at')
                ->when($excludeReceiptId !== null, fn ($q) => $q->where('id', '!=', $excludeReceiptId))
                ->exists();

            if ($match) {
                return true;
            }
        }

        return false;
    }
}
