<?php

namespace App\Modules\Shared\Models;

use Illuminate\Database\Eloquent\Model;

class CurrencyRate extends Model
{
    protected $table = 'currency_rates';

    protected $fillable = [
        'currency_code',
        'rate_to_php',
        'effective_date',
        'source',
        'fetched_at',
    ];

    protected $casts = [
        'rate_to_php'    => 'decimal:6',
        'effective_date' => 'date',
        'fetched_at'     => 'datetime',
    ];
}
