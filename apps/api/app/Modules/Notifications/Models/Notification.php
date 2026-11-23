<?php

namespace App\Modules\Notifications\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Modules\Users\Models\User;

class Notification extends Model
{
    protected $table = 'notifications';

    protected $fillable = [
        'user_id',
        'type',
        'module',
        'title',
        'message',
        'record_type',
        'record_id',
        'record_link',
        'is_read',
        'read_at',
        'metadata',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'record_id' => 'integer',
        'is_read' => 'boolean',
        'read_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
