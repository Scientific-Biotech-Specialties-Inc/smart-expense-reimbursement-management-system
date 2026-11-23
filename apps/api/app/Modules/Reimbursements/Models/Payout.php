<?php

namespace App\Modules\Reimbursements\Models;

use Illuminate\Database\Eloquent\Model;

class Payout extends Model
{
    protected $fillable = [
        'reimbursement_id',
        'request_date',
        'approved_at',
        'granted_at',
        'approved_by',
        'granted_by',
        'payout_method',
        'payout_method_other',
        'amount',
        'granter_signature',
        'employee_signature',
        'acknowledged_at',
    ];

    protected $casts = [
        'request_date' => 'date',
        'approved_at' => 'datetime',
        'granted_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'amount' => 'decimal:2',
    ];

    public function reimbursement()
    {
        return $this->belongsTo(Reimbursement::class);
    }
}
