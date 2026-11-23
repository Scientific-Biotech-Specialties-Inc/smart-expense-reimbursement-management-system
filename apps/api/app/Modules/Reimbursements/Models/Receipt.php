<?php

namespace App\Modules\Reimbursements\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Users\Models\User;

class Receipt extends Model
{
    use SoftDeletes;

    public const REJECTED_STATUSES = [
        'rejected',
        'automatic-rejected',
    ];

    public const DEFAULT_UNREADABLE_REASON = 'The receipt is damaged, incomplete, or too unreadable to extract critical details accurately. Please upload a clearer photo of the receipt.';

    /**
     * Determine whether the receipt is in a rejected state locked against edits or promotion.
     */
    public function isRejectedStatus(): bool
    {
        return in_array(strtolower((string) $this->status), self::REJECTED_STATUSES, true);
    }

    /**
     * Resolve the authoritative PHP equivalent amount for this receipt.
     */
    public function getEffectivePhpAmount(): float
    {
        if ($this->converted_php_amount !== null) {
            return round((float) $this->converted_php_amount, 2);
        }

        if ($this->total_amount === null) {
            return 0.0;
        }

        $rate = (float) ($this->exchange_rate ?: 1.0);

        return round((float) $this->total_amount * $rate, 2);
    }

    protected $fillable = [
        'uploaded_by',
        'file_path',
        'file_hash',
        'file_type',
        'file_size_bytes',
        'vendor_name',
        'transaction_date',
        'total_amount',
        'subtotal',
        'vat_amount',
        'discount_amount',
        'discount_type',
        'tin',
        'invoice_number',
        'vat_classification',
        'currency',
        'exchange_rate',
        'converted_php_amount',
        'exchange_rate_date',
        'exchange_rate_source',
        'location',
        'ocr_confidence_score',
        'ocr_flagged',
        'is_archived',
        'category',
        'expense_category_id',
        'event_type',
        'deletion_warning_sent',
        'admin_notes',
        'vendor_matched',
        'vendor_accredited',
        'vendor_audit_required',
        'vendor_flagged',
        'vendor_cms_supplier_id',
        'vendor_status_tag',
        'vendor_suggested_at',
        'status',
        'is_draft',
        'rejection_code',
        'rejection_reason',
    ];

    protected $appends = ['file_url'];

    public function getFileUrlAttribute()
    {
        if (!$this->file_path) {
            return null;
        }
        
        $baseUrl = config('filesystems.disks.supabase.url');

        // Handle array of file paths
        if (is_array($this->file_path)) {
            return array_map(function ($path) use ($baseUrl) {
                if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
                    return $path;
                }
                return $baseUrl ? rtrim($baseUrl, '/') . '/' . ltrim($path, '/') : null;
            }, $this->file_path);
        }

        // Handle single string (legacy)
        if (str_starts_with($this->file_path, 'http://') || str_starts_with($this->file_path, 'https://')) {
            return $this->file_path;
        }

        if ($baseUrl) {
            return rtrim($baseUrl, '/') . '/' . ltrim($this->file_path, '/');
        }
        return null;
    }

    protected $casts = [
        'file_path' => 'array',
        'file_hash' => 'array',
        'file_type' => 'array',
        'file_size_bytes' => 'array',
        'total_amount' => 'decimal:2',
        'subtotal' => 'decimal:2',
        'vat_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'exchange_rate' => 'decimal:6',
        'converted_php_amount' => 'decimal:2',
        'exchange_rate_date' => 'date',
        'ocr_confidence_score' => 'decimal:2',
        'ocr_flagged' => 'boolean',
        'is_archived' => 'boolean',
        'is_draft' => 'boolean',
        'transaction_date' => 'date',
        'deletion_warning_sent' => 'boolean',
        'vendor_matched' => 'boolean',
        'vendor_accredited' => 'boolean',
        'vendor_audit_required' => 'boolean',
        'vendor_flagged' => 'boolean',
        'vendor_cms_supplier_id' => 'integer',
        'vendor_suggested_at' => 'datetime',
    ];

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function category()
    {
        return $this->belongsTo(ExpenseCategory::class, 'expense_category_id');
    }

    public function items()
    {
        return $this->hasMany(ReceiptItem::class, 'receipt_id');
    }

    public function reimbursements()
    {
        return $this->belongsToMany(Reimbursement::class, 'reimbursement_receipts');
    }
}
