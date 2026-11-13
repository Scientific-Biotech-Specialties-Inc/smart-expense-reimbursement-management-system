<?php

namespace App\Modules\Reimbursements\Models;

use Illuminate\Database\Eloquent\Model;
use App\Modules\Users\Models\User;
use App\Modules\Shared\Traits\ResolvesReportUrl;

class Reimbursement extends Model
{
    use ResolvesReportUrl;

    protected $appends = ['report_url'];

    protected $fillable = [
        'report_template_data',
        'user_id',
        'receipt_id',
        'description',
        'user_comment',
        'expense_category_id',
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
        'source_system',
        'source_submission_id',
        'is_request',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'date' => 'date',
        'approved_at' => 'datetime',
        'is_request' => 'boolean',
        'report_template_data' => 'array',
    ];

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

