# User Profile Module (G2-104 to G2-110) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete User Profile module (Sprint 6 User Stories G2-104 through G2-110) for both Employee and Admin roles in SERMS, featuring a modern tabbed header card + 2-column card grid UI, Dual-Sync with `capstone-auth-module`, Supabase avatar & hybrid signature storage, client-encrypted password changes, signature pre-filling in Payout/Acknowledgement flows, and an immutable user-scoped login & account activity log.

**Architecture:**
- **Backend (`App\Modules\Users` & `App\Modules\Shared`):** Extends the `users` table with `first_name`, `middle_name`, `last_name`, `contact_number`, `signature` (Base64 PNG text), `signature_path` (Supabase storage path), and `last_login_at`, plus a computed `employee_id` (`EMP-000X`) and `avatar_url`. `AuthenticateWithExternalService` records `USER_LOGIN` audit events once per unique JWT `jti` and respects locally updated profile names/contacts. `ProfileController` & `ProfileService` in `App\Modules\Users` handle profile updates (with Dual-Sync to `capstone-auth-module`), Supabase photo upload/removal, hybrid signature save/removal, encrypted password changes (proxied with RSA encryption to `capstone-auth-module`), and user-scoped activity retrieval from `audit_logs`.
- **Frontend (`apps/web/src`):** Adds `/profile` route and `ProfileView.vue` structured after the reference UI (Profile Header card with avatar upload/remove, role badge, joined date, active indicator, top-right `Edit Profile` CTA, and 3 integrated tabs: **Personal & Work**, **Security**, and **Activity**). Enhances `<BaseSignaturePad />` to render pre-filled Base64 PNG signatures on canvas and wires saved signature pre-filling into `GrantPayoutModal.vue` and `PayoutDetailsModal.vue`. Updates `AppLayout.vue` top bar to display the user's uploaded profile photo or initials fallback.

**Tech Stack:** Laravel 13 (PHP 8.3), MySQL 8.0 / SQLite (testing), Supabase S3 Storage (`Storage::disk('supabase')`), Web Crypto API (`AES-256-GCM` + `RSA-OAEP`), Vue 3 (Composition API), Pinia, Tailwind CSS 3.4, Lucide Vue Next, Vitest, PHPUnit.

**Spec:** `docs/Sprint-6.xlsx` (EP 12 / G2-104 to G2-110) & `docs/SERMS.md`

## Global Constraints

- **Canonical Source of Truth:** Cross-reference `docs/SERMS.md` and `docs/DSD.md` for all architectural and visual standards.
- **Design System (DSD) Compliance:** Strictly NO colored top borders (`border-t-*`) on cards, panels, or modals. Use clean clinical surfaces (`bg-white`, `border-slate-200`, `shadow-sm`). Use `BaseButton.vue` for buttons and `StatusBadge.vue` where status badges apply.
- **Medium Date Format:** All human-readable dates in UI and responses must use Medium Date Format (e.g., `Sept 1, 2026` via `formatDate()` / `formatDateTime()` in `src/utils/formatters.js`).
- **Immutability & Auditing:** Every database mutation (`PROFILE_UPDATED`, `PROFILE_PHOTO_UPDATED`, `PROFILE_PHOTO_REMOVED`, `PASSWORD_CHANGED`, `SIGNATURE_UPDATED`, `SIGNATURE_REMOVED`, `USER_LOGIN`) must call `AuditLogService::log()` inside the same transaction. Never update or delete `audit_logs`.
- **Historical Record Preservation (G2-106 & G2-109):** Updating an admin's or employee's name or saved signature must only affect *new* approvals, payouts, and acknowledgements; previously saved records in `reimbursements` and `cash_advances` retain their original snapshot values.
- **Client-Side Pre-Encryption:** Password change requests from the Vue SPA must encrypt `current_password`, `new_password`, and `new_password_confirmation` via `encryptPayload()` (`src/utils/crypto.js`) before transmission, and decrypt server-side via `PayloadDecryptionService::decryptEnvelope()`.
- **Boundary Error Handling:** Wrap all Supabase storage calls and external `capstone-auth-module` HTTP calls in explicit `try-catch` blocks that log actionable context and rethrow or return structured validation/error responses (zero silent swallowing).
- **Sister Repo Read-Only Rule:** Never modify files in `capstone-auth-module`; perform all Dual-Sync operations from SERMS via HTTP client calls to `capstone-auth-module`'s existing endpoints (`PUT /api/me/profile`, `GET /api/encryption-key`, `POST /api/me/password`).

---

## File Structure & Responsibilities

### Backend (`apps/api`)
- **Create:** `apps/api/database/migrations/2026_11_12_000001_add_profile_fields_to_users_table.php` — Adds `first_name`, `middle_name`, `last_name`, `contact_number`, `signature` (`longText`), `signature_path`, and `last_login_at` to `users`.
- **Modify:** `apps/api/app/Modules/Users/Models/User.php` — Adds fillable fields, casts (`last_login_at`), and appended accessors (`employee_id`, `avatar_url`, `has_signature`).
- **Modify:** `apps/api/app/Modules/AuditLogs/Services/AuditLogService.php` — Registers `USER_LOGIN`, `PROFILE_UPDATED`, `PROFILE_PHOTO_UPDATED`, `PROFILE_PHOTO_REMOVED`, `PASSWORD_CHANGED`, `SIGNATURE_UPDATED`, and `SIGNATURE_REMOVED` in `ACTION_META` and `DIFF_FIELDS`.
- **Modify:** `apps/api/app/Modules/Shared/Http/Middleware/AuthenticateWithExternalService.php` — Logs `USER_LOGIN` once per JWT token (`jti` cache key) and updates `last_login_at`; preserves locally customized `name`/`first_name`/`last_name`/`contact_number` if already set in SERMS.
- **Create:** `apps/api/app/Modules/Users/Services/ProfileService.php` — Business logic for updating personal/contact details (with Dual-Sync to `capstone-auth-module`), uploading/removing avatar photo on `supabase` disk, saving/removing hybrid signature (Base64 + `supabase` disk PNG), changing password (decrypting SERMS envelope and forwarding RSA-encrypted fields to `capstone-auth-module`), and querying user-scoped login & account activity from `audit_logs`.
- **Create:** `apps/api/app/Modules/Users/Http/Controllers/ProfileController.php` — REST endpoints under `/api/profile` (`show`, `update`, `uploadPhoto`, `removePhoto`, `updateSignature`, `removeSignature`, `changePassword`, `activity`).
- **Create:** `apps/api/app/Modules/Users/routes/api.php` — Defines `/api/profile` routes protected by `auth.external` middleware.
- **Modify:** `apps/api/app/Modules/Users/Providers/UsersServiceProvider.php` — Loads `Users/routes/api.php`.
- **Create:** `apps/api/tests/Feature/ProfileControllerTest.php` — Comprehensive PHPUnit feature tests covering G2-104 through G2-110.

### Frontend (`apps/web`)
- **Modify:** `apps/web/src/components/base/BaseSignaturePad.vue` — Watches `props.modelValue` to render an existing Base64 PNG signature onto the `<canvas>` so pre-filled signatures display visually and can be cleared/redrawn.
- **Modify:** `apps/web/src/stores/auth.js` — Adds profile action helpers (`updateProfile`, `uploadProfilePhoto`, `removeProfilePhoto`, `saveSignature`, `removeSignature`, `changePassword`, `fetchProfileActivity`) that sync `auth.user` and `localStorage`.
- **Create:** `apps/web/src/views/ProfileView.vue` — The unified Employee & Admin Profile page following the reference UI layout (Header card with avatar upload/remove, role badge, joined date in Medium Date Format, active dot, `Edit Profile` button, Admin approval/payout banner note for G2-105, and 3 tabs: `Personal & Work`, `Security`, `Activity`).
- **Modify:** `apps/web/src/router/index.js` — Registers `{ path: "profile", name: "Profile", component: () => import("@/views/ProfileView.vue"), meta: { title: "My Profile" } }`.
- **Modify:** `apps/web/src/layouts/AppLayout.vue` — Renders `auth.user.avatar_url` image in the top bar avatar circle when present, falling back to `userInitials`.
- **Modify:** `apps/web/src/components/reimbursements/GrantPayoutModal.vue` — Pre-fills `granterSignature` from `auth.user?.signature` when the modal opens (G2-109), with a subtle badge indicating the saved signature was loaded and can be cleared/redrawn.
- **Modify:** `apps/web/src/components/payouts/PayoutDetailsModal.vue` — Pre-fills `employeeSignature` from `auth.user?.signature` when an awaiting-acknowledgement record is opened by an employee (G2-109).
- **Create:** `apps/web/src/views/ProfileView.test.js` — Vitest unit/integration tests covering G2-104 to G2-110 UI states, edit validation, photo upload/remove, signature pad, password checklist, and activity log rendering.

---

### Task 1: Database Migration, User Model Accessors & Audit Log Metadata

**Files:**
- Create: `apps/api/database/migrations/2026_11_12_000001_add_profile_fields_to_users_table.php`
- Modify: `apps/api/app/Modules/Users/Models/User.php`
- Modify: `apps/api/app/Modules/AuditLogs/Services/AuditLogService.php`
- Modify: `apps/api/app/Modules/Shared/Http/Middleware/AuthenticateWithExternalService.php`
- Test: `apps/api/tests/Feature/ProfileControllerTest.php`

**Interfaces:**
- Produces:
  - `User` attributes: `first_name`, `middle_name`, `last_name`, `contact_number`, `signature`, `signature_path`, `last_login_at`
  - `User` appended JSON attributes: `is_admin` (bool), `employee_id` (string, e.g. `EMP-0001`), `avatar_url` (?string), `has_signature` (bool)
  - `AuditLogService::ACTION_META` keys: `USER_LOGIN`, `PROFILE_UPDATED`, `PROFILE_PHOTO_UPDATED`, `PROFILE_PHOTO_REMOVED`, `PASSWORD_CHANGED`, `SIGNATURE_UPDATED`, `SIGNATURE_REMOVED`

- [ ] **Step 1: Write the failing test for User profile attributes and login audit tracking**

Create `apps/api/tests/Feature/ProfileControllerTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_model_exposes_employee_id_and_profile_attributes(): void
    {
        $user = User::create([
            'auth_id' => 42,
            'name' => 'Sara Smith',
            'first_name' => 'Sara',
            'middle_name' => 'Marie',
            'last_name' => 'Smith',
            'email' => 'sara.smith@sbsi.com',
            'role' => 'employee',
            'department' => 'Operations',
            'grade' => 'L2',
            'contact_number' => '+63 917 123 4567',
            'avatar' => 'avatars/user-42.png',
            'signature' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'signature_path' => 'signatures/user-42.png',
        ]);

        $array = $user->toArray();

        $this->assertSame('EMP-0042', $array['employee_id']);
        $this->assertSame('Sara', $array['first_name']);
        $this->assertSame('Marie', $array['middle_name']);
        $this->assertSame('Smith', $array['last_name']);
        $this->assertSame('+63 917 123 4567', $array['contact_number']);
        $this->assertTrue($array['has_signature']);
        $this->assertNotNull($array['avatar_url']);
        $this->assertStringContainsString('avatars/user-42.png', $array['avatar_url']);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && php artisan test --filter=test_user_model_exposes_employee_id_and_profile_attributes`
Expected: FAIL with SQLite/MySQL column not found (`first_name`) or missing array key `employee_id`.

- [ ] **Step 3: Create migration and update `User.php`, `AuditLogService.php`, and `AuthenticateWithExternalService.php`**

Create `apps/api/database/migrations/2026_11_12_000001_add_profile_fields_to_users_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name', 100)->nullable()->after('name');
            $table->string('middle_name', 100)->nullable()->after('first_name');
            $table->string('last_name', 100)->nullable()->after('middle_name');
            $table->string('contact_number', 30)->nullable()->after('department');
            $table->longText('signature')->nullable()->after('avatar');
            $table->string('signature_path')->nullable()->after('signature');
            $table->timestamp('last_login_at')->nullable()->after('signature_path');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'first_name',
                'middle_name',
                'last_name',
                'contact_number',
                'signature',
                'signature_path',
                'last_login_at',
            ]);
        });
    }
};
```

Update `apps/api/app/Modules/Users/Models/User.php`:

```php
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
        if (str_starts_with($this->avatar, 'http://') || str_starts_with($this->avatar, 'https://') || str_starts_with($this->avatar, 'data:')) {
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
}
```

Update `apps/api/app/Modules/AuditLogs/Services/AuditLogService.php` to include profile action metadata in `ACTION_META` and `DIFF_FIELDS`:

```php
        'OVERDUE_PENALTY' => ['label' => 'Daily Penalty Applied', 'tone' => 'danger', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],

        'USER_LOGIN' => ['label' => 'Signed In', 'tone' => 'info', 'domain' => 'profile', 'domain_label' => 'Account Security'],
        'PROFILE_UPDATED' => ['label' => 'Profile Details Updated', 'tone' => 'neutral', 'domain' => 'profile', 'domain_label' => 'Profile'],
        'PROFILE_PHOTO_UPDATED' => ['label' => 'Profile Photo Updated', 'tone' => 'info', 'domain' => 'profile', 'domain_label' => 'Profile'],
        'PROFILE_PHOTO_REMOVED' => ['label' => 'Profile Photo Removed', 'tone' => 'warning', 'domain' => 'profile', 'domain_label' => 'Profile'],
        'PASSWORD_CHANGED' => ['label' => 'Password Changed', 'tone' => 'success', 'domain' => 'profile', 'domain_label' => 'Account Security'],
        'SIGNATURE_UPDATED' => ['label' => 'Digital Signature Saved', 'tone' => 'info', 'domain' => 'profile', 'domain_label' => 'Profile'],
        'SIGNATURE_REMOVED' => ['label' => 'Digital Signature Removed', 'tone' => 'warning', 'domain' => 'profile', 'domain_label' => 'Profile'],
```

And in `DIFF_FIELDS` inside `AuditLogService.php`:

```php
        'payout_method' => 'Payout Method',
        'status' => 'Status',
        'name' => 'Full Name',
        'first_name' => 'First Name',
        'middle_name' => 'Middle Name',
        'last_name' => 'Last Name',
        'contact_number' => 'Contact Number',
```

Update `apps/api/app/Modules/Shared/Http/Middleware/AuthenticateWithExternalService.php` (lines 62-105) so that:
1. `first_name` and `last_name` from the JWT are stored on initial creation, or only if the user hasn't already customized their name locally in SERMS.
2. When a new JWT `jti` is encountered (checked via `Cache::add("serms_login_logged:{$jti}", true, 86400)`), `last_login_at` is updated and `AuditLogService::log($user->id, $user->role, 'USER_LOGIN', 'user', $user->id, null, ['ip_address' => $request->ip(), 'user_agent' => substr((string) $request->userAgent(), 0, 255)], $request->ip())` is recorded.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && php artisan test --filter=test_user_model_exposes_employee_id_and_profile_attributes`
Expected: PASS

---

### Task 2: Backend ProfileService & ProfileController (G2-104 to G2-110)

**Files:**
- Create: `apps/api/app/Modules/Users/Services/ProfileService.php`
- Create: `apps/api/app/Modules/Users/Http/Controllers/ProfileController.php`
- Create: `apps/api/app/Modules/Users/routes/api.php`
- Modify: `apps/api/app/Modules/Users/Providers/UsersServiceProvider.php`
- Test: `apps/api/tests/Feature/ProfileControllerTest.php`

**Interfaces:**
- Consumes:
  - `User` model (`App\Modules\Users\Models\User`)
  - `AuditLogService::log()` (`App\Modules\AuditLogs\Services\AuditLogService`)
  - `PayloadDecryptionService::decryptEnvelope()` (`App\Modules\Shared\Services\PayloadDecryptionService`)
- Produces REST Endpoints (all under `auth.external` middleware):
  - `GET /api/profile` → Returns authenticated user profile JSON + `last_login_at`
  - `PUT /api/profile` → Validates `first_name`, `middle_name`, `last_name`, `contact_number`, updates local `User`, Dual-Syncs `PUT /api/me/profile` on `capstone-auth-module`, logs `PROFILE_UPDATED`
  - `POST /api/profile/photo` → Validates `photo` (`image|mimes:jpeg,jpg,png|max:2048`), stores on `supabase` disk under `avatars/`, deletes previous avatar if present, logs `PROFILE_PHOTO_UPDATED`
  - `DELETE /api/profile/photo` → Deletes avatar from `supabase` disk, clears `users.avatar`, logs `PROFILE_PHOTO_REMOVED`
  - `POST /api/profile/signature` → Validates `signature` (required `data:image/png;base64,...` string), decodes PNG and uploads to `supabase` disk under `signatures/`, saves `signature` and `signature_path` on `User`, logs `SIGNATURE_UPDATED`
  - `DELETE /api/profile/signature` → Deletes signature file from `supabase` disk, clears `signature` and `signature_path`, logs `SIGNATURE_REMOVED`
  - `POST /api/profile/password` → Decrypts client envelope (`current_password`, `new_password`, `new_password_confirmation`), validates password complexity (min 12 chars, 1 uppercase, 1 number, 1 special char, confirmed), fetches RSA key from `capstone-auth-module` (`GET /api/encryption-key`), encrypts fields with `openssl_public_encrypt`, calls `POST /api/me/password` on `capstone-auth-module`, logs `PASSWORD_CHANGED`
  - `GET /api/profile/activity` → Queries `audit_logs` where `actor_id = $user->id` and `action_type` in `['USER_LOGIN', 'PROFILE_UPDATED', 'PROFILE_PHOTO_UPDATED', 'PROFILE_PHOTO_REMOVED', 'PASSWORD_CHANGED', 'SIGNATURE_UPDATED', 'SIGNATURE_REMOVED']`, returning `last_login`, `recent_logins`, and `account_changes`

- [ ] **Step 1: Write failing feature tests in `ProfileControllerTest.php` for all Profile endpoints**

Append tests to `apps/api/tests/Feature/ProfileControllerTest.php` covering:
1. `test_get_profile_returns_authenticated_user_details` (G2-104, G2-105)
2. `test_update_profile_saves_name_and_contact_and_keeps_email_and_role_readonly` (G2-106)
3. `test_update_profile_validates_required_name_and_contact_format` (G2-106)
4. `test_upload_and_remove_profile_photo_stores_in_supabase_and_logs_audit` (G2-107)
5. `test_upload_profile_photo_rejects_non_image_or_oversized_file` (G2-107)
6. `test_save_and_remove_signature_stores_hybrid_base64_and_supabase_file` (G2-109)
7. `test_change_password_validates_rules_and_proxies_to_auth_module` (G2-108)
8. `test_profile_activity_returns_only_logged_in_user_logins_and_account_changes` (G2-110)

- [ ] **Step 2: Run PHPUnit to verify the new tests fail**

Run: `cd apps/api && php artisan test --filter=ProfileControllerTest`
Expected: FAIL with 404 Not Found on `/api/profile`.

- [ ] **Step 3: Implement `ProfileService.php`, `ProfileController.php`, `Users/routes/api.php`, and register routes in `UsersServiceProvider.php`**

Create `apps/api/app/Modules/Users/Services/ProfileService.php`:

```php
<?php

namespace App\Modules\Users\Services;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Shared\Services\PayloadDecryptionService;
use App\Modules\Users\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProfileService
{
    public const PROFILE_ACTIVITY_ACTIONS = [
        'USER_LOGIN',
        'PROFILE_UPDATED',
        'PROFILE_PHOTO_UPDATED',
        'PROFILE_PHOTO_REMOVED',
        'PASSWORD_CHANGED',
        'SIGNATURE_UPDATED',
        'SIGNATURE_REMOVED',
    ];

    /**
     * Update user's personal & contact details and dual-sync with capstone-auth-module.
     */
    public function updateProfile(User $user, array $validated, Request $request): User
    {
        $firstName = trim($validated['first_name']);
        $middleName = isset($validated['middle_name']) && trim($validated['middle_name']) !== ''
            ? trim($validated['middle_name'])
            : null;
        $lastName = trim($validated['last_name']);
        $contactNumber = trim($validated['contact_number']);

        $fullName = trim(collect([$firstName, $middleName, $lastName])->filter()->implode(' '));

        $beforeState = [
            'name' => $user->name,
            'first_name' => $user->first_name,
            'middle_name' => $user->middle_name,
            'last_name' => $user->last_name,
            'contact_number' => $user->contact_number,
        ];

        // Dual-sync with capstone-auth-module if a bearer/cookie token is present
        $this->syncProfileWithAuthModule($user, [
            'first_name' => $firstName,
            'middle_name' => $middleName,
            'last_name' => $lastName,
            'phone' => $contactNumber,
            'email' => $user->email,
        ], $request);

        return DB::transaction(function () use ($user, $firstName, $middleName, $lastName, $fullName, $contactNumber, $beforeState, $request) {
            $user->update([
                'name' => $fullName,
                'first_name' => $firstName,
                'middle_name' => $middleName,
                'last_name' => $lastName,
                'contact_number' => $contactNumber,
            ]);

            $afterState = [
                'name' => $user->name,
                'first_name' => $user->first_name,
                'middle_name' => $user->middle_name,
                'last_name' => $user->last_name,
                'contact_number' => $user->contact_number,
            ];

            AuditLogService::log(
                $user->id,
                $user->role ?? 'employee',
                'PROFILE_UPDATED',
                'user',
                $user->id,
                $beforeState,
                $afterState,
                $request->ip()
            );

            return $user->fresh();
        });
    }

    /**
     * Upload a new profile photo (JPG/PNG) to Supabase storage and save path on User.
     */
    public function updatePhoto(User $user, UploadedFile $file, Request $request): User
    {
        $previousAvatar = $user->avatar;

        try {
            $path = $file->store('avatars', 'supabase');
            if (!$path) {
                throw new \RuntimeException('Supabase storage returned an empty file path for avatar upload.');
            }
        } catch (\Throwable $e) {
            Log::error('ProfileService@updatePhoto: Supabase upload failed at boundary.', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }

        if ($previousAvatar && !str_starts_with($previousAvatar, 'http')) {
            try {
                Storage::disk('supabase')->delete($previousAvatar);
            } catch (\Throwable $e) {
                Log::warning('ProfileService@updatePhoto: Failed to delete old avatar from Supabase.', [
                    'user_id' => $user->id,
                    'old_avatar' => $previousAvatar,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return DB::transaction(function () use ($user, $path, $previousAvatar, $request) {
            $user->update(['avatar' => $path]);

            AuditLogService::log(
                $user->id,
                $user->role ?? 'employee',
                'PROFILE_PHOTO_UPDATED',
                'user',
                $user->id,
                ['avatar' => $previousAvatar],
                ['avatar' => $path],
                $request->ip()
            );

            return $user->fresh();
        });
    }

    /**
     * Remove the user's profile photo from Supabase storage and revert to initials avatar.
     */
    public function removePhoto(User $user, Request $request): User
    {
        $previousAvatar = $user->avatar;

        if ($previousAvatar && !str_starts_with($previousAvatar, 'http')) {
            try {
                Storage::disk('supabase')->delete($previousAvatar);
            } catch (\Throwable $e) {
                Log::error('ProfileService@removePhoto: Failed to delete avatar from Supabase.', [
                    'user_id' => $user->id,
                    'avatar' => $previousAvatar,
                    'error' => $e->getMessage(),
                ]);
                throw $e;
            }
        }

        return DB::transaction(function () use ($user, $previousAvatar, $request) {
            $user->update(['avatar' => null]);

            AuditLogService::log(
                $user->id,
                $user->role ?? 'employee',
                'PROFILE_PHOTO_REMOVED',
                'user',
                $user->id,
                ['avatar' => $previousAvatar],
                ['avatar' => null],
                $request->ip()
            );

            return $user->fresh();
        });
    }

    /**
     * Save the user's drawn signature (Base64 PNG + Supabase bucket PNG copy).
     */
    public function updateSignature(User $user, string $dataUrl, Request $request): User
    {
        if (!preg_match('/^data:image\/png;base64,([A-Za-z0-9+\/=]+)$/', $dataUrl, $matches)) {
            throw ValidationException::withMessages([
                'signature' => ['Signature must be a valid PNG data URL.'],
            ]);
        }

        $binary = base64_decode($matches[1], true);
        if ($binary === false || strlen($binary) < 32) {
            throw ValidationException::withMessages([
                'signature' => ['Signature image data is corrupted or empty.'],
            ]);
        }

        $previousPath = $user->signature_path;
        $hadSignature = !empty($user->signature);
        $fileName = 'signatures/user-' . $user->id . '-' . Str::random(10) . '.png';

        try {
            $stored = Storage::disk('supabase')->put($fileName, $binary);
            if (!$stored) {
                throw new \RuntimeException('Failed to write signature PNG to Supabase storage.');
            }
        } catch (\Throwable $e) {
            Log::error('ProfileService@updateSignature: Supabase upload failed at boundary.', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }

        if ($previousPath) {
            try {
                Storage::disk('supabase')->delete($previousPath);
            } catch (\Throwable $e) {
                Log::warning('ProfileService@updateSignature: Could not delete previous signature file.', [
                    'user_id' => $user->id,
                    'previous_path' => $previousPath,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return DB::transaction(function () use ($user, $dataUrl, $fileName, $hadSignature, $request) {
            $user->update([
                'signature' => $dataUrl,
                'signature_path' => $fileName,
            ]);

            AuditLogService::log(
                $user->id,
                $user->role ?? 'employee',
                'SIGNATURE_UPDATED',
                'user',
                $user->id,
                ['has_signature' => $hadSignature],
                ['has_signature' => true, 'signature_path' => $fileName],
                $request->ip()
            );

            return $user->fresh();
        });
    }

    /**
     * Remove the user's saved signature from both DB and Supabase storage.
     */
    public function removeSignature(User $user, Request $request): User
    {
        $previousPath = $user->signature_path;

        if ($previousPath) {
            try {
                Storage::disk('supabase')->delete($previousPath);
            } catch (\Throwable $e) {
                Log::error('ProfileService@removeSignature: Supabase delete failed at boundary.', [
                    'user_id' => $user->id,
                    'path' => $previousPath,
                    'error' => $e->getMessage(),
                ]);
                throw $e;
            }
        }

        return DB::transaction(function () use ($user, $previousPath, $request) {
            $user->update([
                'signature' => null,
                'signature_path' => null,
            ]);

            AuditLogService::log(
                $user->id,
                $user->role ?? 'employee',
                'SIGNATURE_REMOVED',
                'user',
                $user->id,
                ['has_signature' => true, 'signature_path' => $previousPath],
                ['has_signature' => false, 'signature_path' => null],
                $request->ip()
            );

            return $user->fresh();
        });
    }

    /**
     * Verify current password and update password in capstone-auth-module, logging PASSWORD_CHANGED.
     */
    public function changePassword(User $user, Request $request): void
    {
        $payload = $this->resolvePasswordPayload($request);

        $validator = validator($payload, [
            'current_password' => ['required', 'string', 'max:255'],
            'new_password' => [
                'required',
                'string',
                'min:12',
                'max:255',
                'regex:/[A-Z]/',
                'regex:/[a-z]/',
                'regex:/[0-9]/',
                'regex:/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\ increments\/~`]/',
                'different:current_password',
            ],
            'new_password_confirmation' => ['required', 'string', 'same:new_password'],
        ], [
            'new_password.min' => 'The new password must be at least 12 characters.',
            'new_password.regex' => 'The new password must include uppercase and lowercase letters, a number, and a special character.',
            'new_password.different' => 'The new password must be different from your current password.',
            'new_password_confirmation.same' => 'The password confirmation does not match.',
        ]);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        $this->forwardPasswordChangeToAuthModule(
            $payload['current_password'],
            $payload['new_password'],
            $payload['new_password_confirmation'],
            $request
        );

        DB::transaction(function () use ($user, $request) {
            AuditLogService::log(
                $user->id,
                $user->role ?? 'employee',
                'PASSWORD_CHANGED',
                'user',
                $user->id,
                null,
                ['password_changed_at' => now()->toIso8601String()],
                $request->ip()
            );
        });
    }

    /**
     * Get the logged-in user's last login, recent logins, and recent account changes from audit_logs.
     */
    public function getActivity(User $user): array
    {
        $logs = AuditLog::query()
            ->where('actor_id', $user->id)
            ->whereIn('action_type', self::PROFILE_ACTIVITY_ACTIONS)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        $loginLogs = $logs->where('action_type', 'USER_LOGIN')->values();
        $changeLogs = $logs->where('action_type', '!==', 'USER_LOGIN')->values();

        $formatItem = function (AuditLog $log): array {
            $meta = AuditLogService::ACTION_META[$log->action_type] ?? [
                'label' => $log->action_type,
                'tone' => 'neutral',
            ];
            return [
                'id' => $log->id,
                'action_type' => $log->action_type,
                'label' => $meta['label'],
                'tone' => $meta['tone'],
                'changes' => AuditLogService::computeSanitizedDiff($log->before_state, $log->after_state),
                'created_at' => $log->created_at?->toIso8601String(),
            ];
        };

        $lastLoginAt = $user->last_login_at?->toIso8601String()
            ?? $loginLogs->first()?->created_at?->toIso8601String();

        return [
            'last_login_at' => $lastLoginAt,
            'recent_logins' => $loginLogs->take(10)->map($formatItem)->all(),
            'account_changes' => $changeLogs->take(20)->map($formatItem)->all(),
        ];
    }

    private function resolvePasswordPayload(Request $request): array
    {
        if ($request->has(['encryptedKey', 'iv', 'ciphertext'])) {
            try {
                $decryptedJson = PayloadDecryptionService::decryptEnvelope(
                    $request->only(['encryptedKey', 'iv', 'ciphertext'])
                );
                $decoded = json_decode($decryptedJson, true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            } catch (\Throwable $e) {
                Log::error('ProfileService@resolvePasswordPayload: Failed to decrypt password envelope.', [
                    'error' => $e->getMessage(),
                ]);
                throw ValidationException::withMessages([
                    'current_password' => ['Encrypted password payload could not be verified. Please refresh and try again.'],
                ]);
            }
        }

        return $request->only(['current_password', 'new_password', 'new_password_confirmation']);
    }

    private function syncProfileWithAuthModule(User $user, array $payload, Request $request): void
    {
        $authUrl = rtrim((string) config('services.capstone_auth.url', ''), '/');
        $token = $request->bearerToken() ?: ($request->hasCookie('access_token') ? urldecode((string) $request->cookie('access_token')) : null);

        if ($authUrl === '' || !$token) {
            return;
        }

        try {
            $headers = [
                'Authorization' => "Bearer {$token}",
                'Accept' => 'application/json',
            ];
            if ($request->hasHeader('Cookie')) {
                $headers['Cookie'] = $request->header('Cookie');
            }

            $response = Http::withHeaders($headers)->put("{$authUrl}/api/me/profile", $payload);

            if ($response->status() === 422) {
                throw ValidationException::withMessages(
                    $response->json('errors') ?? ['contact_number' => [$response->json('message') ?? 'Invalid profile details.']]
                );
            }

            if (!$response->successful()) {
                Log::warning('ProfileService@syncProfileWithAuthModule: Non-2xx response from auth module.', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
            }
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('ProfileService@syncProfileWithAuthModule: Integration boundary error.', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    private function forwardPasswordChangeToAuthModule(
        string $currentPassword,
        string $newPassword,
        string $newPasswordConfirmation,
        Request $request
    ): void {
        $authUrl = rtrim((string) config('services.capstone_auth.url', ''), '/');
        $token = $request->bearerToken() ?: ($request->hasCookie('access_token') ? urldecode((string) $request->cookie('access_token')) : null);

        if ($authUrl === '' || !$token) {
            throw ValidationException::withMessages([
                'current_password' => ['Authentication session token is missing. Please log in again.'],
            ]);
        }

        try {
            $headers = [
                'Authorization' => "Bearer {$token}",
                'Accept' => 'application/json',
            ];
            if ($request->hasHeader('Cookie')) {
                $headers['Cookie'] = $request->header('Cookie');
            }

            // 1. Fetch ephemeral RSA key from capstone-auth-module
            $keyResponse = Http::withHeaders($headers)->get("{$authUrl}/api/encryption-key");
            $body = [
                'current_password' => $currentPassword,
                'new_password' => $newPassword,
                'new_password_confirmation' => $newPasswordConfirmation,
            ];

            if ($keyResponse->successful() && $keyResponse->json('public_key') && $keyResponse->json('key_id')) {
                $pubKey = $keyResponse->json('public_key');
                $keyId = $keyResponse->json('key_id');
                $headers['X-Key-Id'] = $keyId;

                foreach ($body as $field => $plainVal) {
                    $encrypted = '';
                    if (openssl_public_encrypt($plainVal, $encrypted, $pubKey)) {
                        $body[$field] = base64_encode($encrypted);
                    }
                }
            }

            $response = Http::withHeaders($headers)->post("{$authUrl}/api/me/password", $body);

            if ($response->status() === 422 || $response->status() === 400) {
                $errors = $response->json('errors') ?? [];
                $message = $response->json('message') ?? 'Current password is incorrect or new password is invalid.';
                if (empty($errors)) {
                    $errors = ['current_password' => [$message]];
                }
                throw ValidationException::withMessages($errors);
            }

            if (!$response->successful()) {
                Log::error('ProfileService@forwardPasswordChangeToAuthModule: Non-success response.', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                throw ValidationException::withMessages([
                    'current_password' => [$response->json('message') ?? 'Unable to change password at this time.'],
                ]);
            }
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('ProfileService@forwardPasswordChangeToAuthModule: Integration boundary error.', [
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
```

Create `apps/api/app/Modules/Users/Http/Controllers/ProfileController.php`:

```php
<?php

namespace App\Modules\Users\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Users\Services\ProfileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function __construct(private readonly ProfileService $profileService)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:50'],
            'middle_name' => ['nullable', 'string', 'max:50'],
            'last_name' => ['required', 'string', 'max:50'],
            'contact_number' => [
                'required',
                'string',
                'max:20',
                'regex:/^(\+63|0)?[0-9\s\-()]{7,18}$/',
            ],
        ], [
            'first_name.required' => 'First name is required.',
            'last_name.required' => 'Last name is required.',
            'contact_number.required' => 'Contact number is required.',
            'contact_number.regex' => 'Please enter a valid contact number (e.g., +63 917 123 4567 or 09171234567).',
        ]);

        $user = $this->profileService->updateProfile($request->user(), $validated, $request);

        return response()->json([
            'message' => 'Profile details updated successfully.',
            'user' => $user,
        ]);
    }

    public function uploadPhoto(Request $request): JsonResponse
    {
        $request->validate([
            'photo' => ['required', 'file', 'mimes:jpeg,jpg,png', 'max:2048'],
        ], [
            'photo.mimes' => 'Only JPG and PNG files are allowed.',
            'photo.max' => 'Profile photo must not exceed 2MB.',
        ]);

        $user = $this->profileService->updatePhoto($request->user(), $request->file('photo'), $request);

        return response()->json([
            'message' => 'Profile photo updated successfully.',
            'user' => $user,
        ]);
    }

    public function removePhoto(Request $request): JsonResponse
    {
        $user = $this->profileService->removePhoto($request->user(), $request);

        return response()->json([
            'message' => 'Profile photo removed.',
            'user' => $user,
        ]);
    }

    public function updateSignature(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'signature' => ['required', 'string'],
        ], [
            'signature.required' => 'Please draw your signature before saving.',
        ]);

        $user = $this->profileService->updateSignature($request->user(), $validated['signature'], $request);

        return response()->json([
            'message' => 'Signature saved to your profile.',
            'user' => $user,
        ]);
    }

    public function removeSignature(Request $request): JsonResponse
    {
        $user = $this->profileService->removeSignature($request->user(), $request);

        return response()->json([
            'message' => 'Saved signature removed.',
            'user' => $user,
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $this->profileService->changePassword($request->user(), $request);

        return response()->json([
            'message' => 'Password changed successfully.',
        ]);
    }

    public function activity(Request $request): JsonResponse
    {
        return response()->json(
            $this->profileService->getActivity($request->user())
        );
    }
}
```

Create `apps/api/app/Modules/Users/routes/api.php`:

```php
<?php

use App\Modules\Users\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->middleware('auth.external')->group(function () {
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/photo', [ProfileController::class, 'uploadPhoto']);
    Route::delete('/profile/photo', [ProfileController::class, 'removePhoto']);
    Route::post('/profile/signature', [ProfileController::class, 'updateSignature']);
    Route::delete('/profile/signature', [ProfileController::class, 'removeSignature']);
    Route::post('/profile/password', [ProfileController::class, 'changePassword']);
    Route::get('/profile/activity', [ProfileController::class, 'activity']);
});
```

Update `apps/api/app/Modules/Users/Providers/UsersServiceProvider.php` to load `routes/api.php`:

```php
    public function boot(): void
    {
        $migrationPath = __DIR__ . '/../Database/Migrations';
        if (is_dir($migrationPath)) {
            $this->loadMigrationsFrom($migrationPath);
        }

        $routesPath = __DIR__ . '/../routes/api.php';
        if (file_exists($routesPath)) {
            $this->loadRoutesFrom($routesPath);
        }
    }
```

- [ ] **Step 4: Run PHPUnit feature tests to verify all backend endpoints pass**

Run: `cd apps/api && php artisan test --filter=ProfileControllerTest`
Expected: PASS (all assertions green).

---

### Task 3: Enhance `<BaseSignaturePad />`, Auth Store Profile Actions & Payout Signature Pre-fill (G2-109)

**Files:**
- Modify: `apps/web/src/components/base/BaseSignaturePad.vue`
- Modify: `apps/web/src/stores/auth.js`
- Modify: `apps/web/src/components/reimbursements/GrantPayoutModal.vue`
- Modify: `apps/web/src/components/payouts/PayoutDetailsModal.vue`
- Modify: `apps/web/src/layouts/AppLayout.vue`
- Test: `apps/web/src/views/PayoutView.test.js`

**Interfaces:**
- Consumes: `auth.user.signature` (Base64 PNG string), `auth.user.avatar_url` (?string)
- Produces:
  - `<BaseSignaturePad v-model="..." />` automatically draws initial or updated `modelValue` data URL onto the canvas and supports clearing/redrawing.
  - `useAuthStore()` methods: `updateProfile(payload)`, `uploadProfilePhoto(file)`, `removeProfilePhoto()`, `saveSignature(dataUrl)`, `removeSignature()`, `changePassword(payload)`, `fetchProfileActivity()`
  - Automatic signature pre-filling in `GrantPayoutModal.vue` (`granterSignature`) and `PayoutDetailsModal.vue` (`employeeSignature`) when `auth.user?.signature` is present.

- [ ] **Step 1: Write failing frontend tests for signature pre-fill and auth store actions**

Add unit test cases in `apps/web/src/views/ProfileView.test.js` (or `PayoutView.test.js`) verifying:
1. When `auth.user.signature` is set, opening `GrantPayoutModal` pre-fills `granterSignature` with the saved signature, and clicking Clear resets it so the user can redraw.
2. When `auth.user.signature` is set, opening `PayoutDetailsModal` for an awaiting-acknowledgement payout pre-fills `employeeSignature` with the saved signature, while still requiring the user to click "Acknowledge Receipt" to confirm.
3. `AppLayout.vue` renders an `<img :src="auth.user.avatar_url" />` in the top bar when `avatar_url` is set, and reverts to initials when `avatar_url` is null.

- [ ] **Step 2: Run Vitest to see the tests fail**

Run: `cd apps/web && npx vitest run src/views/PayoutView.test.js`
Expected: FAIL (signature not pre-filled from `auth.user.signature`).

- [ ] **Step 3: Update `BaseSignaturePad.vue`, `auth.js`, `GrantPayoutModal.vue`, `PayoutDetailsModal.vue`, and `AppLayout.vue`**

In `apps/web/src/components/base/BaseSignaturePad.vue`, watch `props.modelValue` and render any incoming Base64 image onto the canvas:

```javascript
import { ref, watch, onMounted, nextTick } from "vue";

function renderDataUrlOnCanvas(dataUrl) {
  const canvas = signatureCanvas.value;
  if (!canvas) return;
  const ctx = prepareCanvas();
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width || canvas.width, rect.height || canvas.height);

  if (!dataUrl) {
    hasSignature.value = false;
    return;
  }

  hasSignature.value = true;
  if (typeof Image !== "undefined") {
    const img = new Image();
    img.onload = () => {
      const w = rect.width || 400;
      const h = rect.height || 144;
      ctx.drawImage(img, 0, 0, w, h);
    };
    img.src = dataUrl;
  }
}

watch(
  () => props.modelValue,
  (newVal) => {
    if (!isSigning.value) {
      nextTick(() => renderDataUrlOnCanvas(newVal));
    }
  },
  { immediate: true }
);
```

In `apps/web/src/components/reimbursements/GrantPayoutModal.vue`:
- Import `useAuthStore` from `@/stores/auth`.
- When `props.isOpen` becomes `true`, initialize `granterSignature.value = auth.user?.signature || ""`.
- Show a helper pill above `<BaseSignaturePad />` when `auth.user?.signature && granterSignature === auth.user.signature`: `"Pre-filled from your saved profile signature. Click Clear to redraw."`

In `apps/web/src/components/payouts/PayoutDetailsModal.vue`:
- Import `useAuthStore` from `@/stores/auth`.
- When `props.record` changes, initialize `employeeSignature.value = auth.user?.signature || ""`.
- Show a helper note above `<BaseSignaturePad />` when `auth.user?.signature && employeeSignature === auth.user.signature`: `"Pre-filled from your saved profile signature. Click Clear to redraw."`

In `apps/web/src/layouts/AppLayout.vue`:
- Replace the static initials circle in the top header dropdown trigger (lines 250-254) with:
```html
<img
  v-if="auth.user?.avatar_url"
  :src="auth.user.avatar_url"
  :alt="auth.user?.name || 'Profile Photo'"
  data-testid="topbar-avatar-img"
  class="w-8 h-8 rounded-full object-cover border border-slate-200 shadow-sm"
/>
<div
  v-else
  data-testid="topbar-avatar-initials"
  class="w-8 h-8 rounded-full bg-avatar flex items-center justify-center text-white text-xs font-bold font-sans shadow-sm"
>
  {{ userInitials }}
</div>
```

In `apps/web/src/stores/auth.js`:
- Add `updateUserState(updatedUser)` helper that updates `user.value` and persists `localStorage.setItem("serms_user", JSON.stringify(user.value))`.
- Add `updateProfile(payload)`, `uploadProfilePhoto(file)`, `removeProfilePhoto()`, `saveSignature(signatureDataUrl)`, `removeSignature()`, `changePassword({ current_password, new_password, new_password_confirmation })` (using `encryptPayload(JSON.stringify(...))`), and `fetchProfileActivity()`.

- [ ] **Step 4: Run Vitest to verify tests pass**

Run: `cd apps/web && npx vitest run src/views/PayoutView.test.js`
Expected: PASS

---

### Task 4: Build `ProfileView.vue` & Router Registration (G2-104 to G2-110)

**Files:**
- Create: `apps/web/src/views/ProfileView.vue`
- Modify: `apps/web/src/router/index.js`
- Create: `apps/web/src/views/ProfileView.test.js`

**Interfaces:**
- Consumes: `useAuthStore()`, `useToast()`, `BaseButton.vue`, `BaseSignaturePad.vue`, `formatDate()`, `formatDateTime()`, `getInitials()`
- Produces:
  - Route `/profile` (`name: "Profile"`, `meta: { title: "My Profile" }`)
  - `ProfileView.vue` implementing the reference layout in SERMS Clinical Visual System:
    1. **Breadcrumb & Top Action Bar:** `Users > [User Name] details` on the left; `Edit Profile` primary button on the right (switches to `Cancel` / `Save Changes` when editing on the `Personal & Work` tab).
    2. **Profile Header Card (`bg-white rounded-xl border border-slate-200 shadow-sm` — zero colored top border):**
       - **Avatar Section:** Large circular avatar (`w-20 h-20`) displaying `auth.user.avatar_url` (or preview before saving) or `getInitials(auth.user.name)`, with camera overlay / `Upload Photo` (JPG/PNG <= 2MB with preview & confirm) and `Remove Photo` buttons (G2-107).
       - **Identity Lockup:** Full Name (`text-2xl font-bold text-slate-900`), Role pill badge (`Admin` for accounting admins, `Employee` for standard employees), email address, and sub-caption: `Joined on {{ formatDate(auth.user?.created_at) }} • Active` with green status dot (`bg-emerald-500`).
       - **Admin Approval & Payout Banner (G2-105):** Visible when `auth.isAdmin` is true — clean clinical info banner noting: *"Your account name ({{ auth.user?.name }}) is recorded as 'Approved by' and 'Granted by' on approvals and payouts. Updating your name applies to new actions only; historical records preserve their original name."*
       - **Integrated Tab Bar:** Bottom border tabs inside the header card:
         - `Personal & Work` (`data-testid="tab-personal"`)
         - `Security` (`data-testid="tab-security"`)
         - `Activity` (`data-testid="tab-activity"`)
    3. **Tab 1 — `Personal & Work` (2-Column Card Grid matching the reference screenshot):**
       - **Left Column — Card 1: Personal Information** (with inline pencil icon button `data-testid="edit-personal-btn"`):
         - Displays 2-column field grid (`text-[11px] font-medium text-slate-500 uppercase` label above `text-sm font-medium text-slate-800` value; missing values render `"Not set"` per G2-104 AC3):
           - `Full Name` (in Edit mode: split into `First Name *`, `Middle Name`, `Last Name *` inputs)
           - `Contact Number` (in Edit mode: validated input `+63 9XX XXX XXXX` / `09XXXXXXXXX`)
           - `Email Address` (read-only with lock badge)
           - `Account Status` (`Active`)
       - **Left Column — Card 2: Work & Role Information** (read-only company-controlled fields per G2-104 Task 3):
         - `Employee ID` (`auth.user.employee_id`, e.g. `EMP-0001`, read-only monospace)
         - `Role` (`Admin` or `Employee`, read-only)
         - `Department` (`auth.user.department || "Not set"`, read-only)
         - `Position / Grade` (`auth.user.grade || "Not set"`, read-only)
         - `Date Joined` (`formatDate(auth.user.created_at)` or `"Not set"`, read-only)
       - **Right Column — Card 3: Digital Signature (G2-109):**
         - Shows saved signature preview image if `auth.user.signature` exists, with `Replace Signature` and `Remove Signature` buttons.
         - When drawing/replacing (or when no signature is saved), displays `<BaseSignaturePad />` with `Clear` and `Save Signature` buttons.
         - Explains that this signature is automatically pre-filled in the Admin Payout modal (`Granter's Signature`) and Employee Payout Acknowledgement modal, and that changing it never alters past signed records.
    4. **Tab 2 — `Security` (G2-108):**
       - **Change Password Card:**
         - `Current Password *`, `New Password *`, `Confirm New Password *` inputs, each with independent show/hide eye toggle buttons.
         - Live interactive password policy checklist (Minimum 12 characters, Uppercase & lowercase letters, At least one number, At least one special character, Passwords match).
         - Submits via `auth.changePassword()` (client-side encrypted envelope), clears fields on success, and displays inline validation or wrong-current-password errors.
    5. **Tab 3 — `Activity` (G2-110):**
       - **2-Column Card Grid:**
         - **Left Card: Login History & Last Access:** Highlights `Last Login` in Medium Date & Time format (`formatDateTime(activity.last_login_at)` or `"First active session"`), followed by a read-only chronological list of recent logins for the logged-in user only.
         - **Right Card: Recent Account Changes:** Read-only chronological feed of `PROFILE_UPDATED`, `PROFILE_PHOTO_UPDATED`, `PROFILE_PHOTO_REMOVED`, `PASSWORD_CHANGED`, `SIGNATURE_UPDATED`, and `SIGNATURE_REMOVED` events with formatted timestamps (`formatDateTime`) and sanitized before/after field diffs.

- [ ] **Step 1: Write comprehensive Vitest unit/integration tests in `apps/web/src/views/ProfileView.test.js`**

Test cases in `apps/web/src/views/ProfileView.test.js`:
1. Renders Employee profile details accurately, formats Date Joined in Medium Date format, shows `"Not set"` for null fields, and keeps Email, Role, and Employee ID read-only (G2-104).
2. Renders Admin profile with role displayed as `Admin` and displays the "Approved by" / "Granted by" compliance note (G2-105).
3. Validates and saves edited Name (`first_name`, `middle_name`, `last_name`) and `contact_number`, blocks empty/invalid input with inline errors, and updates `auth.user.name` immediately (G2-106).
4. Validates JPG/PNG file type and 2MB size limit on photo selection, renders a preview before saving, uploads to backend, and supports removing photo back to initials (G2-107).
5. Validates Change Password rules (min 12 chars, letters/numbers/special char, match confirmation), toggles password visibility, and surfaces wrong-current-password error (G2-108).
6. Saves, replaces, and removes a signature via `<BaseSignaturePad />` (G2-109).
7. Loads and displays read-only Last Login, Recent Logins, and Account Changes on the `Activity` tab (G2-110).

- [ ] **Step 2: Run Vitest to confirm `ProfileView.test.js` fails before implementation**

Run: `cd apps/web && npx vitest run src/views/ProfileView.test.js`
Expected: FAIL (`Cannot find module '@/views/ProfileView.vue'`).

- [ ] **Step 3: Implement `apps/web/src/views/ProfileView.vue` and add `/profile` route in `apps/web/src/router/index.js`**

Register the route in `apps/web/src/router/index.js` right after `settings/notifications`:

```javascript
      {
        path: "profile",
        name: "Profile",
        component: () => import("@/views/ProfileView.vue"),
        meta: { title: "My Profile" },
      },
```

Implement `apps/web/src/views/ProfileView.vue` adhering to all DSD typography, neutral border rules (no `border-t-*`), `BaseButton`, `BaseSignaturePad`, and Medium Date Formatting (`formatDate` / `formatDateTime`).

- [ ] **Step 4: Run Vitest suite to verify `ProfileView.test.js` and all existing frontend tests pass**

Run: `cd apps/web && npx vitest run src/views/ProfileView.test.js`
Expected: PASS

---

### Task 5: Documentation Sync & Full Verification Gate

**Files:**
- Modify: `docs/SERMS.md`
- Modify: `docs/SDD.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Update `docs/SERMS.md`, `docs/SDD.md`, and `docs/CHANGELOG.md`**

1. In `docs/SERMS.md` (§6.1 Module Roster — `Users` module): Document `ProfileController` and `ProfileService` under `/api/profile` (`App\Modules\Users`) covering profile management, Dual-Sync with `capstone-auth-module`, Supabase avatar/signature storage, encrypted password updates, and user-scoped activity logs.
2. In `docs/SDD.md`: Add the `/api/profile` endpoint contract and `users` table profile columns (`first_name`, `middle_name`, `last_name`, `contact_number`, `signature`, `signature_path`, `last_login_at`).
3. In `docs/CHANGELOG.md`: Add an entry dated `Nov 12, 2026` summarizing the Sprint 6 User Profile module specification and implementation plan.

- [ ] **Step 2: Run full backend and frontend test suites**

Run:
- `cd apps/api && php artisan test`
- `cd apps/web && npx vitest run`
Expected: All PHPUnit and Vitest suites pass with zero regressions.
