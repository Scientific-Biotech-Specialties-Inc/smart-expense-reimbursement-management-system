<?php

namespace App\Modules\Penalties\Models;

use App\Modules\Users\Models\User;
use Illuminate\Database\Eloquent\Model;

class PenaltyStrike extends Model
{
    protected $table = 'penalty_strikes';

    protected $fillable = [
        'user_id',
        'cycle_number',
        'source_module',
        'source_id',
        'source_reference',
        'trigger_type',
        'reason',
        'status',
        'issued_by_id',
        'issued_by_name',
        'appeal_id',
        'resolved_by_id',
        'resolved_at',
        'resolution_note',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'cycle_number' => 'integer',
        'source_id' => 'integer',
        'issued_by_id' => 'integer',
        'appeal_id' => 'integer',
        'resolved_by_id' => 'integer',
        'resolved_at' => 'datetime',
    ];

    protected $appends = ['redirect_path'];

    protected static function booted(): void
    {
        static::deleting(function () {
            throw new \Exception('Immutable breach: deleting penalty strikes is strictly prohibited.');
        });
    }

    public function getRedirectPathAttribute(): string
    {
        return match ($this->source_module) {
            'liquidation' => "/liquidations?view={$this->source_id}",
            'reimbursement' => "/reimbursements?view={$this->source_id}",
            default => "/cash-advances?view={$this->source_id}",
        };
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function issuedBy()
    {
        return $this->belongsTo(User::class, 'issued_by_id');
    }

    public function resolvedBy()
    {
        return $this->belongsTo(User::class, 'resolved_by_id');
    }

    public function appeal()
    {
        return $this->belongsTo(PenaltyAppeal::class, 'appeal_id');
    }
}
