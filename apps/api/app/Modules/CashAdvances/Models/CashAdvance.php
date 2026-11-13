<?php

namespace App\Modules\CashAdvances\Models;

use Illuminate\Database\Eloquent\Model;
use App\Modules\Users\Models\User;

class CashAdvance extends Model
{
    protected $fillable = [
        'user_id',
        'purpose',
        'amount',
        'outstanding_balance',
        'expected_disbursement_date',
        'expected_liquidation_date',
        'status',
        'revision_count',
        'signature',
        'acknowledged_at',
        'report_template_data',
    ];

    protected $casts = [
        'amount'              => 'decimal:2',
        'outstanding_balance' => 'decimal:2',
        'expected_disbursement_date' => 'date',
        'expected_liquidation_date'  => 'date',
        'acknowledged_at'    => 'datetime',
        'report_template_data' => 'array',
    ];

    public function requester()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function document()
    {
        return $this->hasOne(CashAdvanceDocument::class);
    }

    public function documents()
    {
        return $this->hasOne(CashAdvanceDocument::class);
    }

    public function approvalActions()
    {
        return $this->hasMany(CashAdvanceApprovalAction::class);
    }

    public function disbursement()
    {
        return $this->hasOne(CashAdvanceDisbursement::class);
    }

    public function statusHistory()
    {
        return $this->hasMany(CashAdvanceStatusHistory::class);
    }

    public function penalties()
    {
        return $this->hasMany(\App\Modules\Liquidations\Models\PenaltyRecord::class);
    }

    public function liquidations()
    {
        return $this->hasMany(\App\Modules\Liquidations\Models\Liquidation::class);
    }

    protected static function booted()
    {
        static::updated(function ($cashAdvance) {
            if ($cashAdvance->wasChanged('outstanding_balance')) {
                \Illuminate\Support\Facades\DB::table('liquidations')
                    ->where('cash_advance_id', $cashAdvance->id)
                    ->update(['outstanding_balance' => $cashAdvance->outstanding_balance]);
            }
        });
    }
}

