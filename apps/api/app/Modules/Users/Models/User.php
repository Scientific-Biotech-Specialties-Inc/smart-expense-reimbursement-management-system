<?php

namespace App\Modules\Users\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Authenticatable
{
    use HasFactory;

    protected $appends = [
        'is_admin',
        'employee_id',
        'avatar_url',
        'has_signature',
    ];

    protected $fillable = [
        'auth_id',
        'name',
        'first_name',
        'middle_name',
        'last_name',
        'email',
        'role',
        'grade',
        'department',
        'contact_number',
        'avatar',
        'signature',
        'signature_path',
        'last_login_at',
    ];

    protected $casts = [
        'email' => 'string',
        'last_login_at' => 'datetime',
    ];

    public function isAccountingDepartment(): bool
    {
        return strtolower(trim((string) $this->department)) === 'accounting';
    }

    public function hasAdminPrivileges(): bool
    {
        return $this->isAccountingDepartment();
    }

    public function getIsAdminAttribute(): bool
    {
        return $this->hasAdminPrivileges();
    }

    public function getEmployeeIdAttribute(): string
    {
        $num = $this->auth_id ?: $this->id ?: 0;
        return sprintf('EMP-%04d', (int) $num);
    }

    public function getAvatarUrlAttribute(): ?string
    {
        if (!$this->avatar) {
            return null;
        }
        if (
            str_starts_with($this->avatar, 'http://') ||
            str_starts_with($this->avatar, 'https://') ||
            str_starts_with($this->avatar, 'data:')
        ) {
            return $this->avatar;
        }
        $baseUrl = rtrim((string) config('filesystems.disks.supabase.url', ''), '/');
        $path = ltrim($this->avatar, '/');
        return $baseUrl !== '' ? "{$baseUrl}/{$path}" : "/storage/{$path}";
    }

    public function getHasSignatureAttribute(): bool
    {
        return !empty($this->signature);
    }

    /**
     * In-memory runtime permissions assigned dynamically by auth middleware.
     *
     * @var array<int, string>
     */
    public array $runtimePermissions = [];

    public function getPermissionsAttribute(): array
    {
        return $this->runtimePermissions;
    }

    public function setPermissionsAttribute($value): void
    {
        $this->runtimePermissions = is_array($value) ? $value : [];
        unset($this->attributes['permissions']);
    }

    public function setIsAdminAttribute($value): void
    {
        unset($this->attributes['is_admin']);
    }

    public function setEmployeeIdAttribute($value): void
    {
        unset($this->attributes['employee_id']);
    }

    public function setAvatarUrlAttribute($value): void
    {
        unset($this->attributes['avatar_url']);
    }

    public function setHasSignatureAttribute($value): void
    {
        unset($this->attributes['has_signature']);
    }
}
