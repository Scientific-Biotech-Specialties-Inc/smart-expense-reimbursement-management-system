<?php

namespace App\Modules\CashAdvances\Models;

use Illuminate\Database\Eloquent\Model;
use App\Modules\Users\Models\User;

class CashAdvanceDisbursement extends Model
{
    protected $fillable = [
        'cash_advance_id',
        'disbursed_by_id',
        'granted_by',
        'disbursement_date',
        'channel',
        'payout_method',
        'payout_method_other',
        'reference_number',
        'granter_signature',
    ];

    protected $casts = [
        'disbursement_date' => 'date',
    ];

    public function cashAdvance()
    {
        return $this->belongsTo(CashAdvance::class);
    }

    public function disbursedBy()
    {
        return $this->belongsTo(User::class, 'disbursed_by_id');
    }
}
