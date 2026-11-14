<?php

namespace App\Modules\Reimbursements\Models;

use Illuminate\Database\Eloquent\Model;
use App\Modules\Users\Models\User;
use App\Modules\Shared\Traits\ResolvesReportUrl;

class Reimbursement extends Model
{
    use ResolvesReportUrl;

    protected $appends = [
        'report_url',
        'fast_track_eligible',
        'vendor_audit_required',
        'unverified_vendors',
    ];

    protected $fillable = [
        'report_template_data',
        'user_id',
        'receipt_id',
        'description',
        'user_comment',
        'expense_category_id',
        'contract_id',
        'client_name',
        'event_type',
        'amount',
        'date',
        'status',
        'revision_count',
        'rejection_comment',
        'report_file_path',
        'admin_notes',
        'submitted_by_name',
        'approved_by',
        'approved_at',
        'secondary_audit_confirmed_at',
        'secondary_audit_by',
        'secondary_audit_note',
        'source_system',
        'source_submission_id',
        'is_request',
    ];

    protected $casts = [
        'contract_id' => 'integer',
        'amount' => 'decimal:2',
        'date' => 'date',
        'approved_at' => 'datetime',
        'secondary_audit_confirmed_at' => 'datetime',
        'is_request' => 'boolean',
        'report_template_data' => 'array',
    ];

    private function resolvedReceipts()
    {
        if (!$this->exists) {
            return collect();
        }

        $receipts = $this->relationLoaded('receipts')
            ? $this->receipts
            : $this->receipts()->get();

        if ($receipts->isEmpty() && $this->receipt_id) {
            $single = $this->relationLoaded('receipt') ? $this->receipt : $this->receipt()->first();
            return $single ? collect([$single]) : collect();
        }

        return $receipts;
    }

    public function getVendorAuditRequiredAttribute(): bool
    {
        return $this->resolvedReceipts()->contains(
            fn ($receipt) => (bool) $receipt->vendor_audit_required || (bool) $receipt->vendor_flagged
        );
    }

    public function getFastTrackEligibleAttribute(): bool
    {
        $receipts = $this->resolvedReceipts();
        if ($receipts->isEmpty()) {
            return false;
        }

        return $receipts->every(function ($receipt) {
            return (bool) $receipt->vendor_accredited
                && !$receipt->vendor_audit_required
                && !$receipt->vendor_flagged
                && !$receipt->ocr_flagged
                && $receipt->rejection_code !== 'duplicate'
                && $receipt->status !== 'rejected';
        });
    }

    public function getUnverifiedVendorsAttribute(): array
    {
        return $this->resolvedReceipts()
            ->filter(fn ($receipt) => (bool) $receipt->vendor_audit_required || (bool) $receipt->vendor_flagged)
            ->map(function ($receipt) {
                $name = trim((string) $receipt->vendor_name) ?: 'Unknown Vendor';
                $tin = trim((string) $receipt->tin);
                return $tin !== '' ? "{$name} (TIN: {$tin})" : $name;
            })
            ->unique()
            ->values()
            ->all();
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function receipt()
    {
        return $this->belongsTo(Receipt::class);
    }

    public function receipts()
    {
        return $this->belongsToMany(Receipt::class, 'reimbursement_receipts');
    }

    public function expenseCategory()
    {
        return $this->belongsTo(ExpenseCategory::class, 'expense_category_id');
    }

    public function payout()
    {
        return $this->hasOne(Payout::class);
    }
}

