<?php

namespace App\Modules\Shared\Models;

use App\Modules\Users\Models\User;
use Illuminate\Database\Eloquent\Model;

class CmsContractRequest extends Model
{
    protected $fillable = [
        'source_reference_id',
        'vendor_name',
        'tin_number',
        'normalized_tin',
        'service_description',
        'category',
        'region',
        'occurrence_count',
        'total_spend',
        'period_start',
        'period_end',
        'expense_items',
        'contract_code',
        'cms_request_id',
        'supporting_expense_summary',
        'status',
        'forwarded_by',
        'forwarded_at',
    ];

    protected $casts = [
        'occurrence_count' => 'integer',
        'total_spend'      => 'decimal:2',
        'period_start'     => 'date',
        'period_end'       => 'date',
        'expense_items'    => 'array',
        'cms_request_id'   => 'integer',
        'forwarded_by'     => 'integer',
        'forwarded_at'     => 'datetime',
    ];

    public function forwarder()
    {
        return $this->belongsTo(User::class, 'forwarded_by');
    }
}
