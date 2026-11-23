<?php

namespace App\Modules\Notifications\Models;

use App\Modules\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmailLog extends Model
{
    protected $table = 'email_logs';

    protected $fillable = [
        'notification_id',
        'user_id',
        'recipient_email',
        'type',
        'setting_key',
        'module',
        'record_type',
        'record_id',
        'record_link',
        'subject',
        'status',
        'attempts',
        'error_message',
        'sent_at',
    ];

    protected $casts = [
        'notification_id' => 'integer',
        'user_id' => 'integer',
        'record_id' => 'integer',
        'attempts' => 'integer',
        'sent_at' => 'datetime',
    ];

    public function notification(): BelongsTo
    {
        return $this->belongsTo(Notification::class, 'notification_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
