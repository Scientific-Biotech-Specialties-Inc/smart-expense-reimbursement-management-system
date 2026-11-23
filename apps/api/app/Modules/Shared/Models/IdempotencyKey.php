<?php

namespace App\Modules\Shared\Models;

use App\Modules\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IdempotencyKey extends Model
{
    protected $table = 'idempotency_keys';

    protected $fillable = [
        'user_id',
        'idempotency_key',
        'request_method',
        'request_path',
        'request_hash',
        'status',
        'response_status',
        'response_body',
        'response_headers',
        'expires_at',
    ];

    protected $casts = [
        'response_status' => 'integer',
        'response_headers' => 'array',
        'expires_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
