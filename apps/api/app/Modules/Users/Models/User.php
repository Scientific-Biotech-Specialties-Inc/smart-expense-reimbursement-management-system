<?php

namespace App\Modules\Users\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class User extends Authenticatable
{
    use HasFactory;

    protected $appends = [
        'is_admin',
    ];

    protected $fillable = [
        'auth_id',
        'name',
        'email',
        'role',
        'grade',
        'department',
        'avatar',
    ];

    protected $casts = [
        'email' => 'string',
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
}
