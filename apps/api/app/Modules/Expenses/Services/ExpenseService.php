<?php

namespace App\Modules\Expenses\Services;

use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Builder;
use App\Modules\Shared\Traits\ValidatesReceiptDuplicates;

class ExpenseService
{
    use ValidatesReceiptDuplicates;
    /**
     * List all receipts for the user with filters and permission scoping.
     */
    public function listReceipts(User $user, array $filters = []): \Illuminate\Database\Eloquent\Collection
    {
        $query = Receipt::with('category')->whereNull('deleted_at');

        // Standard employees can only view their own receipts
        if (!$user->can('serms.reimbursements.manage')) {
            $query->where('uploaded_by', $user->id);
        } else {
            $query->with('uploader');
        }

        // Apply filters
        if (!empty($filters['uploader_id'])) {
            $query->where('uploaded_by', $filters['uploader_id']);
        }

        if (!empty($filters['category'])) {
            $category = $filters['category'];
            if (is_numeric($category)) {
                $query->where('expense_category_id', $category);
            } else {
                $query->whereHas('category', function (Builder $q) use ($category) {
                    $q->where('name', $category);
                });
            }
        }

        if (isset($filters['min_amount']) && $filters['min_amount'] !== '') {
            $query->where('total_amount', '>=', $filters['min_amount']);
        }

        if (isset($filters['max_amount']) && $filters['max_amount'] !== '') {
            $query->where('total_amount', '<=', $filters['max_amount']);
        }

        if (!empty($filters['start_date'])) {
            $query->whereDate('transaction_date', '>=', $filters['start_date']);
        }

        if (!empty($filters['end_date'])) {
            $query->whereDate('transaction_date', '<=', $filters['end_date']);
        }

        return $query->orderBy('created_at', 'desc')->get();
    }

    /**
     * Store a new receipt record.
     */
    public function storeReceipt(User $user, array $data): Receipt
    {
        return DB::transaction(function () use ($user, $data) {
            // Duplicate hash check
            $this->validateDuplicateReceipt($data['file_hash']);

            $expenseCategoryId = $data['expense_category_id'] ?? null;
            if (isset($data['category'])) {
                if (!$expenseCategoryId) {
                    $category = ExpenseCategory::firstOrCreate(['name' => $data['category']]);
                    $expenseCategoryId = $category->id;
                }
            }

            $receipt = Receipt::create([
                'uploaded_by' => $user->id,
                'file_path' => $data['file_path'],
                'file_hash' => $data['file_hash'],
                'file_type' => $data['file_type'],
                'file_size_bytes' => $data['file_size_bytes'],
                'vendor_name' => $data['vendor_name'] ?? null,
                'transaction_date' => $data['transaction_date'] ?? null,
                'total_amount' => $data['total_amount'] ?? null,
                'vat_amount' => $data['vat_amount'] ?? null,
                'discount_amount' => $data['discount_amount'] ?? 0,
                'discount_type' => $data['discount_type'] ?? 'none',
                'tin' => $data['tin'] ?? null,
                'invoice_number' => $data['invoice_number'] ?? null,
                'vat_classification' => $data['vat_classification'] ?? null,
                'currency' => $data['currency'] ?? null,
                'ocr_confidence_score' => $data['ocr_confidence_score'] ?? null,
                'ocr_flagged' => ($data['ocr_confidence_score'] ?? 100) < 80,
                'expense_category_id' => $expenseCategoryId,
                'status' => 'processed',
            ]);

            $receipt->load('category');

            return $receipt;
        });
    }

    /**
     * Retrieve a single receipt if the user has access.
     */
    public function showReceipt(User $user, int $id, bool $canManage): Receipt
    {
        $receipt = Receipt::with(['uploader', 'category'])->findOrFail($id);

        if (!$canManage && $receipt->uploaded_by !== $user->id) {
            throw new \Illuminate\Auth\Access\AuthorizationException('Forbidden.');
        }

        return $receipt;
    }

    /**
     * Update receipt metadata.
     */
    public function updateReceipt(User $user, int $id, array $data, bool $canManage): Receipt
    {
        return DB::transaction(function () use ($user, $id, $data, $canManage) {
            $receipt = Receipt::findOrFail($id);

            if ($receipt->uploaded_by !== $user->id && !$canManage) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Forbidden.');
            }

            $expenseCategoryId = $data['expense_category_id'] ?? null;
            if (isset($data['category'])) {
                if (!$expenseCategoryId) {
                    $category = ExpenseCategory::firstOrCreate(['name' => $data['category']]);
                    $expenseCategoryId = $category->id;
                }
                unset($data['category']);
            }
            if ($expenseCategoryId) {
                $data['expense_category_id'] = $expenseCategoryId;
            }

            $receipt->update($data);

            return $receipt->fresh();
        });
    }

    /**
     * Soft-delete a receipt.
     */
    public function deleteReceipt(User $user, int $id, bool $canManage): void
    {
        DB::transaction(function () use ($user, $id, $canManage) {
            $receipt = Receipt::findOrFail($id);

            if (!$canManage && $receipt->uploaded_by !== $user->id) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Forbidden.');
            }

            $receipt->delete();
        });
    }
}
