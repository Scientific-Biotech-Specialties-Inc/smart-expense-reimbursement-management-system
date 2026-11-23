<?php

namespace App\Modules\Liquidations\Models;

use Illuminate\Database\Eloquent\Model;
use App\Modules\Users\Models\User;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Shared\Traits\ResolvesReportUrl;

class Liquidation extends Model
{
    use ResolvesReportUrl;

    protected $appends = ['report_url'];

    protected $fillable = [
        'report_template_data',
        'cash_advance_id',
        'user_id',
        'status',
        'revision_count',
        'reimbursement_ids',
        'total_expense_amount',
        'outstanding_balance',
        'shortfall_explanation',
        'admin_note',
        'report_file_path',
    ];

    protected $casts = [
        'reimbursement_ids' => 'json',
        'total_expense_amount' => 'decimal:2',
        'outstanding_balance' => 'decimal:2',
        'report_template_data' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function cashAdvance()
    {
        return $this->belongsTo(CashAdvance::class);
    }
}
