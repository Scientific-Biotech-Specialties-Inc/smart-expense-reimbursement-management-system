<?php

namespace App\Modules\Penalties\Models;

use App\Modules\Users\Models\User;
use Illuminate\Database\Eloquent\Model;

class PenaltyAppeal extends Model
{
    protected $table = 'penalty_appeals';

    protected $fillable = [
        'user_id',
        'cycle_number',
        'explanation',
        'letter_file_path',
        'letter_file_name',
        'letter_mime_type',
        'letter_file_hash',
        'status',
        'reviewed_by_id',
        'reviewed_by_name',
        'reviewed_at',
        'admin_comment',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'cycle_number' => 'integer',
        'reviewed_by_id' => 'integer',
        'reviewed_at' => 'datetime',
    ];

    protected $hidden = [
        'letter_file_path',
        'letter_file_hash',
    ];

    protected $appends = ['letter_url'];

    protected static function booted(): void
    {
        static::deleting(function () {
            throw new \Exception('Immutable breach: deleting penalty appeals is strictly prohibited.');
        });
    }

    public function getLetterUrlAttribute(): ?string
    {
        if (!$this->letter_file_path) {
            return null;
        }

        if (str_starts_with($this->letter_file_path, 'http://') || str_starts_with($this->letter_file_path, 'https://')) {
            return $this->letter_file_path;
        }

        $baseUrl = config('filesystems.disks.supabase.url');

        return $baseUrl ? rtrim($baseUrl, '/') . '/' . ltrim($this->letter_file_path, '/') : null;
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function reviewedBy()
    {
        return $this->belongsTo(User::class, 'reviewed_by_id');
    }

    public function strikes()
    {
        return $this->hasMany(PenaltyStrike::class, 'appeal_id');
    }
}
