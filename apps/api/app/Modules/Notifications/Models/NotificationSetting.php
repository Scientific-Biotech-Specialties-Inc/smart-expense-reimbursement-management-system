<?php

namespace App\Modules\Notifications\Models;

use App\Modules\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationSetting extends Model
{
    protected $table = 'notification_settings';

    protected $fillable = [
        'user_id',
        'email_enabled',
        'request_submissions',
        'status_updates',
        'admin_comments',
        'near_deadline_reminders',
        'overdue_alerts',
        'admin_new_requests',
        'admin_employee_updates',
        'admin_overdue_liquidations',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'email_enabled' => 'boolean',
        'request_submissions' => 'boolean',
        'status_updates' => 'boolean',
        'admin_comments' => 'boolean',
        'near_deadline_reminders' => 'boolean',
        'overdue_alerts' => 'boolean',
        'admin_new_requests' => 'boolean',
        'admin_employee_updates' => 'boolean',
        'admin_overdue_liquidations' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
