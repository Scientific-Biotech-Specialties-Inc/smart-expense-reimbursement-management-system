<?php

namespace App\Modules\AuditLogs\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    protected $fillable = [
        'actor_id',
        'actor_role',
        'action_type',
        'entity_type',
        'entity_id',
        'before_state',
        'after_state',
        'ip_address',
    ];

    protected $casts = [
        'before_state' => 'json',
        'after_state' => 'json',
        'created_at' => 'datetime',
    ];

    /**
     * Disable standard timestamps; we only track created_at (since logs are append-only).
     */
    public $timestamps = false;

    public function actor()
    {
        return $this->belongsTo(\App\Modules\Users\Models\User::class, 'actor_id');
    }

    protected static function booted()
    {
        // Enforce audit log immutability
        static::creating(function ($log) {
            $log->created_at = now();
        });

        static::updating(function ($log) {
            throw new \Exception('Immutable breach: modifying audit logs is strictly prohibited.');
        });

        static::deleting(function ($log) {
            throw new \Exception('Immutable breach: deleting audit logs is strictly prohibited.');
        });
    }
}
