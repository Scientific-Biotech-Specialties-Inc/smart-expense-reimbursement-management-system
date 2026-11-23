# Email Notifications and Settings Epic (EP 9: G2-074 to G2-079) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Epic 9 (Email Notifications and Settings) — `G2-074`, `G2-075`, `G2-076`, `G2-077`, `G2-078`, and `G2-079` — delivering queued Brevo SMTP email notifications with a branded SBSI HTML template, an `email_logs` table with automatic retries and skip logging, two-stage liquidation deadline reminders (near-deadline `<= 3` days + due-today + overdue), a role-aware Notification Settings page (`/settings/notifications`), and pre-send preference enforcement that keeps in-app notifications active even when emails are turned off.

**Architecture:**
1. **Preferences & Email Audit Persistence (`apps/api/app/Modules/Notifications`)**: Create `notification_settings` (per-user master switch `email_enabled` + 5 employee toggles and 3 admin toggles, all `true` by default) and `email_logs` (tracks `notification_id`, `user_id`, `recipient_email`, `type`, `setting_key`, `module`, `record_type`, `record_id`, `record_link`, `subject`, `status`, `attempts`, `error_message`, `sent_at`). Expose `GET /api/notifications/settings` and `PUT /api/notifications/settings` on `NotificationController` with `AuditLogService::log()`.
2. **Queued Email Dispatch, Retries & Branded SBSI Template (`apps/api`)**: Create `NotificationMail` (`resources/views/emails/sbsi-notification.blade.php`) with SBSI header, structured record details (module, record ID, status, amount in `₱`, Medium Date Format `Oct 22, 2026`, admin/employee notes or overdue penalty), a primary CTA button (`{FRONTEND_URL}{record_link}`), and a footer link to `{FRONTEND_URL}/settings/notifications`. Dispatch via `SendNotificationEmailJob` (`ShouldQueue`, `$tries = 3`, `$backoff = [10, 30, 60]`) from `NotificationService::notifyUser()`. If a user's master switch or category toggle is off, skip dispatching and record `status = 'skipped by user setting'` in `email_logs` while still saving the in-app `Notification`.
3. **Two-Stage Deadline Reminders & Role-Scoped Settings UI (`apps/api` & `apps/web/src`)**: Upgrade `CheckLiquidationDeadlines` (`notifications:check-liquidation-deadlines`) so employees receive one near-deadline email (`1..3` days left, `liquidation_due_soon`), one due-today email (`0` days left, `liquidation_due_today`), and one overdue email (`< 0` days left, `liquidation_overdue` + `admin_liquidation_overdue` for admins). Build `NotificationSettingsView.vue` (`/settings/notifications`), accessible from the top-right User Profile menu, the Notifications page, the Bell dropdown, and every email footer, showing only the toggles applicable to the logged-in role (`employee` vs `admin`) with a memory-preserving Master Switch and explicit `"Save Preferences"` button.

**Tech Stack:** Laravel 13 (PHP 8.3), Laravel Mail & Queues (`ShouldQueue`, Brevo SMTP `smtp-relay.brevo.com`), MySQL 8 / SQLite (in-memory tests), Vue 3 (Composition API, Pinia, Vue Router), Tailwind CSS 3.4, Lucide Vue Next, PHPUnit, Vitest (`@vue/test-utils`).

**Spec:** `docs/Sprint-5.xlsx` (EP 9 - Email Notifications and Settings: `G2-074` through `G2-079`)

## Global Constraints

- **Canonical 9 Modules & Cross-Module Rule:** All email notification models, mailables, jobs, controllers, and services live inside `App\Modules\Notifications`. Domain modules (`Reimbursements`, `CashAdvances`, `Liquidations`) trigger both in-app and email notifications exclusively through `NotificationService`.
- **In-App Independence (`G2-079` Task 3):** Turning off the Master Switch (`email_enabled`) or any individual email toggle must NEVER suppress in-app notifications (`notifications` table, top-bar Bell dropdown, and `/notifications` page).
- **Exact Skip Status Logging (`G2-079` Task 2):** When an email is suppressed because the user turned off the master switch or the specific email category, an `EmailLog` row MUST be written with `status = 'skipped by user setting'`.
- **My Expense Draft Upload Exclusion (`G2-075`, `G2-078`):** Raw draft receipt uploads and OCR completions in My Expense (`receipt_uploaded`, `receipt_processed`) remain in-app only (`resolveSettingKey` returns `null`) so employees are not spammed before submitting a reimbursement request. Admin notes on a receipt (`receipt_admin_note`) and OCR auto-rejections (`receipt_auto_rejected`) map to `admin_comments` and `status_updates` respectively.
- **Role-Scoped Settings UI (`G2-078` Criterion 1):** `/settings/notifications` displays ONLY the 5 Employee toggles (`request_submissions`, `status_updates`, `admin_comments`, `near_deadline_reminders`, `overdue_alerts`) when `!auth.isAdmin`, and ONLY the 3 Admin toggles (`admin_new_requests`, `admin_employee_updates`, `admin_overdue_liquidations`) when `auth.isAdmin`, plus the Master Switch for both.
- **All Default On (`G2-078` Criterion 4):** New users without a saved `notification_settings` row default to `true` (On) for `email_enabled` and all category toggles.
- **Medium Date Format & Currency:** Format all human-readable dates in email templates and notification copy using Medium Date Format (`Oct 22, 2026`, PHP `M j, Y`) and format currency in Philippine Pesos (`₱`).
- **Audit Logging & Reusability (`A-09`):** Log all `notification_settings` updates via `AuditLogService::log()` inside the same DB transaction, and use `BaseButton.vue` and `useToast.js` on the frontend.

---

## File Map

| Action | File Path | Responsibility |
| --- | --- | --- |
| Create | `apps/api/app/Modules/Notifications/Database/Migrations/2026_10_22_000002_create_notification_settings_and_email_logs_tables.php` | Create `notification_settings` and `email_logs` tables (`G2-074`, `G2-078`, `G2-079`) |
| Create | `apps/api/app/Modules/Notifications/Models/NotificationSetting.php` | Eloquent model for `notification_settings` with boolean casts and default factory attributes (`G2-078`) |
| Create | `apps/api/app/Modules/Notifications/Models/EmailLog.php` | Eloquent model for `email_logs` tracking queued, sent, failed, and skipped emails (`G2-074`, `G2-079`) |
| Create | `apps/api/app/Modules/Notifications/Services/NotificationPreferenceService.php` | Map notification `type` to preference toggle keys, fetch/initialize user settings, and evaluate `shouldSendEmail()` (`G2-078`, `G2-079`) |
| Modify | `apps/api/app/Modules/Notifications/Http/Controllers/NotificationController.php` | Add `getSettings` (`GET /api/notifications/settings`) and `updateSettings` (`PUT /api/notifications/settings`) with `AuditLogService::log()` (`G2-078`, `G2-079`) |
| Modify | `apps/api/app/Modules/Notifications/routes/api.php` | Register `GET /settings` and `PUT /settings` under `/api/notifications` (`G2-078`) |
| Create | `apps/api/tests/Feature/NotificationSettingsApiTest.php` | Feature tests for default settings, role-scoped toggles, persistence across sessions, and audit logs (`G2-078`) |
| Create | `apps/api/app/Modules/Notifications/Mail/NotificationMail.php` | Laravel `Mailable` building the branded SBSI email with record details, deep-link button, and settings link (`G2-074`–`G2-077`) |
| Create | `apps/api/resources/views/emails/sbsi-notification.blade.php` | Branded SBSI HTML email Blade view (`G2-074` Task 2 & 4) |
| Create | `apps/api/app/Modules/Notifications/Jobs/SendNotificationEmailJob.php` | Queued job (`ShouldQueue`, `$tries = 3`, `$backoff = [10, 30, 60]`) delivering `NotificationMail`, updating `EmailLog`, and handling retries/failures (`G2-074`, `G2-079`) |
| Modify | `apps/api/app/Modules/Notifications/Services/NotificationService.php` | Hook email preference check, `EmailLog` creation (`queued` or `skipped by user setting`), and `SendNotificationEmailJob::dispatch()` into `notifyUser()` (`G2-074`–`G2-079`) |
| Modify | `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php` | Enrich notification `metadata` (`amount`, `status`, `comment`, `employee_name`) for email templates (`G2-075`, `G2-076`) |
| Modify | `apps/api/app/Modules/Reimbursements/Services/ReceiptService.php` | Enrich notification `metadata` on receipt admin notes and employee resubmissions/uploads (`G2-075`, `G2-076`) |
| Modify | `apps/api/app/Modules/CashAdvances/Services/CashAdvanceService.php` | Enrich notification `metadata` (`amount`, `status`, `comment`, `employee_name`, `channel`, `reference`) (`G2-075`, `G2-076`) |
| Modify | `apps/api/app/Modules/Liquidations/Http/Controllers/LiquidationController.php` | Enrich notification `metadata` (`amount`, `status`, `comment`, `employee_name`) (`G2-075`, `G2-076`) |
| Modify | `apps/api/.env.example` | Add Brevo SMTP (`MAIL_*`) and `FRONTEND_URL` configuration defaults (`G2-074`) |
| Modify | `docker-compose.yml` | Forward `MAIL_*` and `FRONTEND_URL` environment variables to `php` and `api_queue` containers (`G2-074`) |
| Create | `apps/api/tests/Feature/EmailNotificationDeliveryTest.php` | Feature tests for employee/admin email triggers, SBSI template rendering, retry/failure logging, and skipped-by-setting behavior (`G2-074`, `G2-075`, `G2-076`, `G2-079`) |
| Modify | `apps/api/app/Console/Commands/CheckLiquidationDeadlines.php` | Split `0..3` days into `liquidation_due_soon` (`1..3` days left) and `liquidation_due_today` (`0` days left), and enrich overdue metadata (`G2-077`) |
| Modify | `apps/api/tests/Feature/LiquidationDeadlineNotificationTest.php` | Test near-deadline, due-today, and overdue email dispatch, single-send per stage, settled exclusion, and setting opt-out (`G2-077`, `G2-079`) |
| Modify | `apps/web/src/stores/notification.js` | Add `settings`, `isSavingSettings`, `fetchSettings()`, and `saveSettings()` to `useNotificationStore` (`G2-078`, `G2-079`) |
| Create | `apps/web/src/views/NotificationSettingsView.vue` | Notification Settings page (`/settings/notifications`) with Master Switch, role-filtered toggles (5 employee / 3 admin), and `"Save Preferences"` button (`G2-078`) |
| Modify | `apps/web/src/router/index.js` | Register `/settings/notifications` route (`NotificationSettingsView.vue`) (`G2-078`) |
| Modify | `apps/web/src/layouts/AppLayout.vue` | Add `"Notification Settings"` item to top-right User Profile dropdown menu (`G2-078`) |
| Modify | `apps/web/src/views/NotificationsView.vue` | Add `"Notification Settings"` button in the `/notifications` page header (`G2-078`) |
| Modify | `apps/web/src/components/base/NotificationPanel.vue` | Add `"Notification Settings"` link in the top-bar Bell dropdown (`G2-078`) |
| Create | `apps/web/src/views/NotificationSettingsView.test.js` | Vitest unit tests for role-specific toggles, Master Switch dimming/memory, Save Preferences API call + toast, and persistence (`G2-078`, `G2-079`) |
| Modify | `apps/web/src/stores/notification.test.js` | Add unit tests for `fetchSettings` and `saveSettings` store actions (`G2-078`) |

---

### Task 1: Backend `notification_settings` & `email_logs` Tables, Models, `NotificationPreferenceService` & Settings API (`G2-078`, `G2-079`)

**Files:**
- Create: `apps/api/app/Modules/Notifications/Database/Migrations/2026_10_22_000002_create_notification_settings_and_email_logs_tables.php`
- Create: `apps/api/app/Modules/Notifications/Models/NotificationSetting.php`
- Create: `apps/api/app/Modules/Notifications/Models/EmailLog.php`
- Create: `apps/api/app/Modules/Notifications/Services/NotificationPreferenceService.php`
- Modify: `apps/api/app/Modules/Notifications/Http/Controllers/NotificationController.php`
- Modify: `apps/api/app/Modules/Notifications/routes/api.php`
- Create: `apps/api/tests/Feature/NotificationSettingsApiTest.php`

**Interfaces:**
- Produces:
  - `NotificationPreferenceService::getForUser(int $userId): NotificationSetting`
  - `NotificationPreferenceService::resolveSettingKey(string $notificationType, User $recipient): ?string`
  - `NotificationPreferenceService::shouldSendEmail(User $recipient, string $notificationType): array{allowed: bool, setting_key: ?string, reason: ?string}`
  - `GET /api/notifications/settings` → `{ data: NotificationSetting, role_scope: 'admin'|'employee' }`
  - `PUT /api/notifications/settings` → `{ message: string, data: NotificationSetting, role_scope: 'admin'|'employee' }`

- [ ] **Step 1: Write the failing backend feature test in `apps/api/tests/Feature/NotificationSettingsApiTest.php`**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Services\NotificationPreferenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;

class NotificationSettingsApiTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@sbsi.com',
            'role' => 'employee',
            'department' => 'Operations',
        ]);

        $this->admin = User::create([
            'name' => 'Maria Admin',
            'email' => 'maria@sbsi.com',
            'role' => 'admin',
            'department' => 'Accounting',
        ]);
    }

    public function test_new_users_default_to_all_email_types_enabled(): void
    {
        $response = $this->actingAs($this->employee)->getJson('/api/notifications/settings');

        $response->assertOk()
            ->assertJsonPath('role_scope', 'employee')
            ->assertJsonPath('data.email_enabled', true)
            ->assertJsonPath('data.request_submissions', true)
            ->assertJsonPath('data.status_updates', true)
            ->assertJsonPath('data.admin_comments', true)
            ->assertJsonPath('data.near_deadline_reminders', true)
            ->assertJsonPath('data.overdue_alerts', true);

        $adminResponse = $this->actingAs($this->admin)->getJson('/api/notifications/settings');

        $adminResponse->assertOk()
            ->assertJsonPath('role_scope', 'admin')
            ->assertJsonPath('data.email_enabled', true)
            ->assertJsonPath('data.admin_new_requests', true)
            ->assertJsonPath('data.admin_employee_updates', true)
            ->assertJsonPath('data.admin_overdue_liquidations', true);
    }

    public function test_user_can_update_individual_toggles_and_master_switch_with_audit_log(): void
    {
        $updateResponse = $this->actingAs($this->employee)->putJson('/api/notifications/settings', [
            'email_enabled' => true,
            'request_submissions' => false,
            'status_updates' => true,
            'admin_comments' => false,
            'near_deadline_reminders' => true,
            'overdue_alerts' => true,
        ]);

        $updateResponse->assertOk()
            ->assertJsonPath('message', 'Notification settings saved successfully.')
            ->assertJsonPath('data.request_submissions', false)
            ->assertJsonPath('data.admin_comments', false)
            ->assertJsonPath('data.status_updates', true);

        // Choices persist across subsequent fetches (simulating log out & log in)
        $fetchAgain = $this->actingAs($this->employee)->getJson('/api/notifications/settings');
        $fetchAgain->assertOk()
            ->assertJsonPath('data.request_submissions', false)
            ->assertJsonPath('data.admin_comments', false)
            ->assertJsonPath('data.status_updates', true);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'action_type' => 'NOTIFICATION_SETTINGS_UPDATED',
            'entity_type' => 'notification_setting',
        ]);
    }

    public function test_preference_service_maps_types_and_evaluates_master_and_individual_switches(): void
    {
        // Default: allowed
        $eval1 = NotificationPreferenceService::shouldSendEmail($this->employee, 'reimbursement_submitted');
        $this->assertTrue($eval1['allowed']);
        $this->assertSame('request_submissions', $eval1['setting_key']);

        // Turn off request_submissions only
        NotificationSetting::where('user_id', $this->employee->id)->update([
            'request_submissions' => false,
        ]);

        $eval2 = NotificationPreferenceService::shouldSendEmail($this->employee, 'reimbursement_submitted');
        $this->assertFalse($eval2['allowed']);
        $this->assertSame('skipped by user setting', $eval2['reason']);

        // Other types remain allowed
        $eval3 = NotificationPreferenceService::shouldSendEmail($this->employee, 'reimbursement_approved');
        $this->assertTrue($eval3['allowed']);
        $this->assertSame('status_updates', $eval3['setting_key']);

        // Turn off master switch: blocks everything
        NotificationSetting::where('user_id', $this->employee->id)->update([
            'email_enabled' => false,
        ]);

        $eval4 = NotificationPreferenceService::shouldSendEmail($this->employee, 'reimbursement_approved');
        $this->assertFalse($eval4['allowed']);
        $this->assertSame('skipped by user setting', $eval4['reason']);

        // Draft receipt upload in My Expense is in-app only (setting_key === null)
        $evalDraft = NotificationPreferenceService::shouldSendEmail($this->employee, 'receipt_uploaded');
        $this->assertFalse($evalDraft['allowed']);
        $this->assertNull($evalDraft['setting_key']);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec serms_php php artisan test --filter=NotificationSettingsApiTest`
Expected: FAIL (`Class "App\Modules\Notifications\Models\NotificationSetting" not found`)

- [ ] **Step 3: Create the migration, `NotificationSetting` & `EmailLog` models, `NotificationPreferenceService`, and controller endpoints**

Create `apps/api/app/Modules/Notifications/Database/Migrations/2026_10_22_000002_create_notification_settings_and_email_logs_tables.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('notification_settings')) {
            Schema::create('notification_settings', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->unique();
                $table->boolean('email_enabled')->default(true);

                // Employee toggles (G2-078)
                $table->boolean('request_submissions')->default(true);
                $table->boolean('status_updates')->default(true);
                $table->boolean('admin_comments')->default(true);
                $table->boolean('near_deadline_reminders')->default(true);
                $table->boolean('overdue_alerts')->default(true);

                // Admin toggles (G2-078)
                $table->boolean('admin_new_requests')->default(true);
                $table->boolean('admin_employee_updates')->default(true);
                $table->boolean('admin_overdue_liquidations')->default(true);

                $table->timestamps();
            });
        }

        if (!Schema::hasTable('email_logs')) {
            Schema::create('email_logs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('notification_id')->nullable()->index();
                $table->unsignedBigInteger('user_id')->index();
                $table->string('recipient_email');
                $table->string('type', 100)->index();
                $table->string('setting_key', 100)->nullable()->index();
                $table->string('module', 60);
                $table->string('record_type', 60)->nullable();
                $table->unsignedBigInteger('record_id')->nullable();
                $table->string('record_link', 255)->nullable();
                $table->string('subject', 255);
                $table->string('status', 60)->index(); // queued, sent, failed, skipped by user setting
                $table->unsignedTinyInteger('attempts')->default(0);
                $table->text('error_message')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'status']);
                $table->index(['record_type', 'record_id', 'type']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('email_logs');
        Schema::dropIfExists('notification_settings');
    }
};
```

Create `apps/api/app/Modules/Notifications/Models/NotificationSetting.php`:

```php
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
```

Create `apps/api/app/Modules/Notifications/Models/EmailLog.php`:

```php
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
```

Create `apps/api/app/Modules/Notifications/Services/NotificationPreferenceService.php`:

```php
<?php

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Users\Models\User;

class NotificationPreferenceService
{
    public const EMPLOYEE_SETTING_KEYS = [
        'request_submissions',
        'status_updates',
        'admin_comments',
        'near_deadline_reminders',
        'overdue_alerts',
    ];

    public const ADMIN_SETTING_KEYS = [
        'admin_new_requests',
        'admin_employee_updates',
        'admin_overdue_liquidations',
    ];

    /**
     * Map notification type strings to their governing NotificationSetting column.
     * Returns null for in-app-only notifications (e.g. My Expense draft receipt upload/OCR).
     */
    public static function resolveSettingKey(string $notificationType, ?User $recipient = null): ?string
    {
        return match ($notificationType) {
            // Employee: 1. Request submissions (G2-075 Task 1, G2-078 Task 3)
            'reimbursement_submitted',
            'cash_advance_submitted',
            'liquidation_submitted' => 'request_submissions',

            // Employee: 2. Status updates (G2-075 Task 2 & 3, G2-078 Task 3)
            'reimbursement_approved',
            'reimbursement_rejected',
            'reimbursement_revised',
            'reimbursement_cancelled',
            'reimbursement_granted',
            'payout_acknowledged',
            'cash_advance_approved',
            'cash_advance_rejected',
            'cash_advance_revised',
            'cash_advance_cancelled',
            'cash_advance_disbursed',
            'liquidation_settled',
            'liquidation_approved',
            'liquidation_rejected',
            'liquidation_revised',
            'liquidation_cancelled',
            'receipt_auto_rejected' => 'status_updates',

            // Employee: 3. Admin comments and notes (G2-075 Task 3, G2-078 Task 3)
            'reimbursement_admin_note',
            'receipt_admin_note',
            'cash_advance_admin_note',
            'liquidation_admin_note' => 'admin_comments',

            // Employee: 4. Near-deadline reminders (G2-077 Task 1, G2-078 Task 3)
            'liquidation_due_soon',
            'liquidation_due_today' => 'near_deadline_reminders',

            // Employee: 5. Overdue alerts (G2-077 Task 2, G2-078 Task 3)
            'liquidation_overdue' => 'overdue_alerts',

            // Admin: 1. New requests from employees (G2-076 Task 1, G2-078 Task 3)
            'admin_reimbursement_submitted',
            'admin_cash_advance_submitted',
            'admin_liquidation_submitted' => 'admin_new_requests',

            // Admin: 2. Employee notes, signatures, uploads & resubmissions (G2-076 Task 2, G2-078 Task 3)
            'admin_employee_note_added',
            'admin_payout_signed',
            'admin_cash_advance_signed',
            'admin_reimbursement_resubmitted',
            'admin_cash_advance_resubmitted',
            'admin_liquidation_resubmitted',
            'admin_receipt_resubmitted',
            'admin_file_uploaded' => 'admin_employee_updates',

            // Admin: 3. Overdue liquidations (G2-077 Task 2, G2-078 Task 3)
            'admin_liquidation_overdue' => 'admin_overdue_liquidations',

            default => null,
        };
    }

    /**
     * Determine whether a user is considered an Admin in SERMS.
     */
    public static function isAdminUser(User $user): bool
    {
        $dept = strtolower(trim((string) ($user->department ?? '')));
        $role = strtolower(trim((string) ($user->role ?? '')));

        return $dept === 'accounting' || in_array($role, ['admin', 'superadmin', 'finance', 'accounting'], true);
    }

    /**
     * Retrieve or initialize notification settings for a user (all On by default per G2-078).
     */
    public static function getForUser(int $userId): NotificationSetting
    {
        return NotificationSetting::firstOrCreate(
            ['user_id' => $userId],
            [
                'email_enabled' => true,
                'request_submissions' => true,
                'status_updates' => true,
                'admin_comments' => true,
                'near_deadline_reminders' => true,
                'overdue_alerts' => true,
                'admin_new_requests' => true,
                'admin_employee_updates' => true,
                'admin_overdue_liquidations' => true,
            ]
        );
    }

    /**
     * Evaluate whether an email should be sent for the given user and notification type.
     *
     * @return array{allowed: bool, setting_key: ?string, reason: ?string}
     */
    public static function shouldSendEmail(User $recipient, string $notificationType): array
    {
        $settingKey = self::resolveSettingKey($notificationType, $recipient);

        if ($settingKey === null) {
            return [
                'allowed' => false,
                'setting_key' => null,
                'reason' => 'in_app_only',
            ];
        }

        $settings = self::getForUser((int) $recipient->id);

        if (!$settings->email_enabled) {
            return [
                'allowed' => false,
                'setting_key' => $settingKey,
                'reason' => 'skipped by user setting',
            ];
        }

        if (! (bool) ($settings->{$settingKey} ?? true)) {
            return [
                'allowed' => false,
                'setting_key' => $settingKey,
                'reason' => 'skipped by user setting',
            ];
        }

        return [
            'allowed' => true,
            'setting_key' => $settingKey,
            'reason' => null,
        ];
    }
}
```

Modify `apps/api/app/Modules/Notifications/Http/Controllers/NotificationController.php` to add `getSettings` and `updateSettings`:

```php
    /**
     * Retrieve the authenticated user's email notification settings (G2-078).
     */
    public function getSettings(Request $request)
    {
        $user = $request->user();
        $settings = \App\Modules\Notifications\Services\NotificationPreferenceService::getForUser((int) $user->id);
        $isAdmin = \App\Modules\Notifications\Services\NotificationPreferenceService::isAdminUser($user);

        return response()->json([
            'data' => $settings,
            'role_scope' => $isAdmin ? 'admin' : 'employee',
        ]);
    }

    /**
     * Update the authenticated user's email notification settings (G2-078, G2-079).
     */
    public function updateSettings(Request $request)
    {
        $user = $request->user();
        $validated = $request->validate([
            'email_enabled' => ['sometimes', 'boolean'],
            'request_submissions' => ['sometimes', 'boolean'],
            'status_updates' => ['sometimes', 'boolean'],
            'admin_comments' => ['sometimes', 'boolean'],
            'near_deadline_reminders' => ['sometimes', 'boolean'],
            'overdue_alerts' => ['sometimes', 'boolean'],
            'admin_new_requests' => ['sometimes', 'boolean'],
            'admin_employee_updates' => ['sometimes', 'boolean'],
            'admin_overdue_liquidations' => ['sometimes', 'boolean'],
        ]);

        $settings = \App\Modules\Notifications\Services\NotificationPreferenceService::getForUser((int) $user->id);

        DB::transaction(function () use ($settings, $validated, $user, $request) {
            $before = $settings->toArray();
            $settings->update($validated);

            AuditLogService::log(
                actorId: $user->id,
                actorRole: (string) ($user->role ?? 'employee'),
                actionType: 'NOTIFICATION_SETTINGS_UPDATED',
                entityType: 'notification_setting',
                entityId: $settings->id,
                beforeState: $before,
                afterState: $settings->fresh()->toArray(),
                ipAddress: $request->ip()
            );
        });

        $isAdmin = \App\Modules\Notifications\Services\NotificationPreferenceService::isAdminUser($user);

        return response()->json([
            'message' => 'Notification settings saved successfully.',
            'data' => $settings->fresh(),
            'role_scope' => $isAdmin ? 'admin' : 'employee',
        ]);
    }
```

Modify `apps/api/app/Modules/Notifications/routes/api.php` to register `/settings`:

```php
<?php

use Illuminate\Support\Facades\Route;
use App\Modules\Notifications\Http\Controllers\NotificationController;

Route::middleware('auth.external')->group(function () {
    Route::get('/', [NotificationController::class, 'index']);
    Route::get('/settings', [NotificationController::class, 'getSettings']);
    Route::put('/settings', [NotificationController::class, 'updateSettings']);
    Route::post('/read-all', [NotificationController::class, 'markAllRead']);
    Route::patch('/{id}/read', [NotificationController::class, 'markRead']);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec serms_php php artisan test --filter=NotificationSettingsApiTest`
Expected: PASS (3 tests, 26 assertions)

- [ ] **Step 5: Commit (when permitted by user)**

```bash
git add apps/api/app/Modules/Notifications/Database/Migrations/2026_10_22_000002_create_notification_settings_and_email_logs_tables.php \
        apps/api/app/Modules/Notifications/Models/NotificationSetting.php \
        apps/api/app/Modules/Notifications/Models/EmailLog.php \
        apps/api/app/Modules/Notifications/Services/NotificationPreferenceService.php \
        apps/api/app/Modules/Notifications/Http/Controllers/NotificationController.php \
        apps/api/app/Modules/Notifications/routes/api.php \
        apps/api/tests/Feature/NotificationSettingsApiTest.php
git commit -m "feat(notifications): add notification_settings and email_logs schema and settings endpoints (G2-078, G2-079)"
```

---

### Task 2: Branded SBSI Email Template, `NotificationMail`, Queued `SendNotificationEmailJob` & `NotificationService` Dispatch (`G2-074`, `G2-075`, `G2-076`, `G2-079`)

**Files:**
- Create: `apps/api/app/Modules/Notifications/Mail/NotificationMail.php`
- Create: `apps/api/resources/views/emails/sbsi-notification.blade.php`
- Create: `apps/api/app/Modules/Notifications/Jobs/SendNotificationEmailJob.php`
- Modify: `apps/api/app/Modules/Notifications/Services/NotificationService.php`
- Modify: `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php`
- Modify: `apps/api/app/Modules/Reimbursements/Services/ReceiptService.php`
- Modify: `apps/api/app/Modules/CashAdvances/Services/CashAdvanceService.php`
- Modify: `apps/api/app/Modules/Liquidations/Http/Controllers/LiquidationController.php`
- Modify: `apps/api/.env.example`
- Modify: `docker-compose.yml`
- Create: `apps/api/tests/Feature/EmailNotificationDeliveryTest.php`

**Interfaces:**
- Consumes:
  - `NotificationPreferenceService::shouldSendEmail(User $recipient, string $notificationType)`
  - `EmailLog`, `Notification`, `NotificationSetting`
- Produces:
  - `NotificationMail(Notification $notification, User $recipient, array $details = [])`
  - `SendNotificationEmailJob(int $emailLogId)` (`$tries = 3`, `$backoff = [10, 30, 60]`)
  - Automatic queued email dispatch + `EmailLog` tracking inside `NotificationService::notifyUser()`

- [ ] **Step 1: Write the failing backend feature test in `apps/api/tests/Feature/EmailNotificationDeliveryTest.php`**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Notifications\Models\EmailLog;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Jobs\SendNotificationEmailJob;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;

class EmailNotificationDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@sbsi.com',
            'role' => 'employee',
            'department' => 'Operations',
        ]);

        $this->admin = User::create([
            'name' => 'Maria Admin',
            'email' => 'maria@sbsi.com',
            'role' => 'admin',
            'department' => 'Accounting',
        ]);
    }

    public function test_notify_user_queues_sbsi_branded_email_and_logs_sent_status(): void
    {
        Mail::fake();

        $notif = NotificationService::notifyUser(
            userId: $this->employee->id,
            type: 'reimbursement_approved',
            module: 'Reimbursement',
            title: 'Reimbursement Approved',
            message: 'Your reimbursement of ₱2,500.00 was approved by Maria Admin. Admin comment: "Verified OR receipt"',
            recordLink: '/reimbursements?view=42',
            recordType: 'reimbursement',
            recordId: 42,
            metadata: [
                'status' => 'Approved',
                'amount' => '₱2,500.00',
                'comment' => 'Verified OR receipt',
            ]
        );

        // EmailLog was created and marked 'sent' after synchronous test queue execution
        $log = EmailLog::where('notification_id', $notif->id)->first();
        $this->assertNotNull($log);
        $this->assertSame('juan@sbsi.com', $log->recipient_email);
        $this->assertSame('reimbursement_approved', $log->type);
        $this->assertSame('status_updates', $log->setting_key);
        $this->assertSame('sent', $log->status);
        $this->assertNotNull($log->sent_at);

        Mail::assertSent(NotificationMail::class, function (NotificationMail $mail) {
            $html = $mail->render();
            return $mail->hasTo('juan@sbsi.com')
                && str_contains($html, 'SMART EXPENSE')
                && str_contains($html, 'Reimbursement Approved')
                && str_contains($html, '₱2,500.00')
                && str_contains($html, 'Verified OR receipt')
                && str_contains($html, '/reimbursements?view=42')
                && str_contains($html, '/settings/notifications');
        });
    }

    public function test_disabled_setting_skips_email_and_logs_skipped_by_user_setting_while_keeping_in_app_notification(): void
    {
        Mail::fake();
        Queue::fake();

        NotificationSetting::create([
            'user_id' => $this->employee->id,
            'email_enabled' => true,
            'request_submissions' => false,
            'status_updates' => true,
            'admin_comments' => true,
            'near_deadline_reminders' => true,
            'overdue_alerts' => true,
            'admin_new_requests' => true,
            'admin_employee_updates' => true,
            'admin_overdue_liquidations' => true,
        ]);

        $notif = NotificationService::notifyUser(
            userId: $this->employee->id,
            type: 'reimbursement_submitted',
            module: 'Reimbursement',
            title: 'Reimbursement Submitted',
            message: 'Your reimbursement request of ₱1,200.00 was submitted.',
            recordLink: '/reimbursements?view=55',
            recordType: 'reimbursement',
            recordId: 55
        );

        // 1. In-app notification STILL exists (G2-079 Task 3)
        $this->assertDatabaseHas('notifications', [
            'id' => $notif->id,
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_submitted',
        ]);

        // 2. Email log records 'skipped by user setting' (G2-079 Task 2)
        $this->assertDatabaseHas('email_logs', [
            'notification_id' => $notif->id,
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_submitted',
            'setting_key' => 'request_submissions',
            'status' => 'skipped by user setting',
        ]);

        // 3. No queue job or email dispatched
        Queue::assertNothingPushed();
        Mail::assertNothingSent();
    }

    public function test_failed_email_job_records_attempts_error_message_and_failed_status(): void
    {
        $log = EmailLog::create([
            'user_id' => $this->employee->id,
            'recipient_email' => 'juan@sbsi.com',
            'type' => 'reimbursement_submitted',
            'setting_key' => 'request_submissions',
            'module' => 'Reimbursement',
            'record_type' => 'reimbursement',
            'record_id' => 99,
            'record_link' => '/reimbursements?view=99',
            'subject' => '[SERMS] Reimbursement Submitted',
            'status' => 'queued',
            'attempts' => 0,
        ]);

        $job = new SendNotificationEmailJob($log->id);
        $this->assertSame(3, $job->tries);
        $this->assertSame([10, 30, 60], $job->backoff);

        $job->failed(new \RuntimeException('SMTP connection timed out'));

        $fresh = $log->fresh();
        $this->assertSame('failed', $fresh->status);
        $this->assertStringContainsString('SMTP connection timed out', (string) $fresh->error_message);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec serms_php php artisan test --filter=EmailNotificationDeliveryTest`
Expected: FAIL (`Class "App\Modules\Notifications\Mail\NotificationMail" not found`)

- [ ] **Step 3: Create `NotificationMail`, `sbsi-notification.blade.php`, `SendNotificationEmailJob`, and wire into `NotificationService`**

Create `apps/api/app/Modules/Notifications/Mail/NotificationMail.php`:

```php
<?php

namespace App\Modules\Notifications\Mail;

use App\Modules\Notifications\Models\Notification;
use App\Modules\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class NotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public Notification $notification;
    public User $recipient;
    public array $details;
    public string $recordUrl;
    public string $settingsUrl;
    public string $formattedDate;

    public function __construct(Notification $notification, User $recipient, array $details = [])
    {
        $this->notification = $notification;
        $this->recipient = $recipient;
        $this->details = $details;

        $frontendBase = rtrim((string) config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5002')), '/');
        $rawLink = (string) ($notification->record_link ?? '/dashboard');
        $cleanLink = str_starts_with($rawLink, '/') ? $rawLink : '/' . $rawLink;

        $this->recordUrl = $frontendBase . $cleanLink;
        $this->settingsUrl = $frontendBase . '/settings/notifications';
        $this->formattedDate = ($notification->created_at ?? now())->format('M j, Y');
    }

    public function build(): self
    {
        $subject = '[SERMS] ' . ($this->notification->title ?: $this->notification->module);

        return $this->subject($subject)
            ->view('emails.sbsi-notification');
    }
}
```

Create `apps/api/resources/views/emails/sbsi-notification.blade.php`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $notification->title }}</title>
</head>
<body style="margin:0; padding:0; background-color:#F4F7FA; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#1E293B;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F7FA; padding:32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #E2E8F0; box-shadow:0 4px 12px rgba(15, 23, 42, 0.06);">
                    <!-- Branded SBSI Header -->
                    <tr>
                        <td style="background-color:#1B365D; padding:24px 32px;">
                            <div style="font-size:11px; font-weight:700; letter-spacing:1.5px; color:#93C5FD; text-transform:uppercase; margin-bottom:4px;">
                                SBSI • SMART EXPENSE &amp; REIMBURSEMENT MANAGEMENT SYSTEM
                            </div>
                            <div style="font-size:20px; font-weight:700; color:#FFFFFF; line-height:1.3;">
                                {{ $notification->title }}
                            </div>
                        </td>
                    </tr>

                    <!-- Greeting & Primary Message -->
                    <tr>
                        <td style="padding:28px 32px 16px 32px;">
                            <p style="margin:0 0 12px 0; font-size:15px; color:#334155;">
                                Hello <strong>{{ $recipient->name ?? 'User' }}</strong>,
                            </p>
                            <p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#1E293B;">
                                {{ $notification->message }}
                            </p>

                            <!-- Structured Record Details Card -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-left:4px solid #2E85D8; border-radius:8px; padding:16px 20px; margin-bottom:24px;">
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B; width:150px;">Module:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:600; color:#0F172A;">{{ $notification->module }}</td>
                                </tr>
                                @if($notification->record_id)
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Record Reference:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:600; color:#0F172A;">#{{ $notification->record_id }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['employee_name']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Employee:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:600; color:#0F172A;">{{ $details['employee_name'] }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['status']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Status:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:700; color:#1B365D;">{{ $details['status'] }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['amount']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Amount:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:700; color:#0F172A;">{{ $details['amount'] }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['days_overdue']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Days Overdue:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:700; color:#DC2626;">{{ $details['days_overdue'] }} {{ (int)$details['days_overdue'] === 1 ? 'day' : 'days' }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['penalty_formatted']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Accrued Penalty:</td>
                                    <td style="padding:4px 0; font-size:13px; font-weight:700; color:#DC2626;">{{ $details['penalty_formatted'] }}</td>
                                </tr>
                                @endif
                                @if(!empty($details['comment']))
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B; vertical-align:top;">Note / Reason:</td>
                                    <td style="padding:4px 0; font-size:13px; font-style:italic; color:#334155;">"{{ $details['comment'] }}"</td>
                                </tr>
                                @endif
                                <tr>
                                    <td style="padding:4px 0; font-size:13px; color:#64748B;">Date:</td>
                                    <td style="padding:4px 0; font-size:13px; color:#0F172A;">{{ $formattedDate }}</td>
                                </tr>
                            </table>

                            <!-- Primary CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;">
                                <tr>
                                    <td align="center" style="border-radius:8px; background-color:#2E85D8;">
                                        <a href="{{ $recordUrl }}" target="_blank" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:8px;">
                                            View Record in SERMS
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer with Notification Settings Link (G2-074 Task 4) -->
                    <tr>
                        <td style="background-color:#F8FAFC; border-top:1px solid #E2E8F0; padding:18px 32px; font-size:12px; color:#64748B; line-height:1.5;">
                            <p style="margin:0 0 6px 0;">
                                You received this email because notifications are enabled for your SBSI SERMS account.
                            </p>
                            <p style="margin:0;">
                                <a href="{{ $settingsUrl }}" target="_blank" style="color:#2E85D8; font-weight:600; text-decoration:underline;">
                                    Manage Notification Settings
                                </a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
```

Create `apps/api/app/Modules/Notifications/Jobs/SendNotificationEmailJob.php`:

```php
<?php

namespace App\Modules\Notifications\Jobs;

use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Models\EmailLog;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Services\NotificationPreferenceService;
use App\Modules\Users\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendNotificationEmailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    /**
     * Backoff intervals in seconds before retrying a failed email delivery.
     *
     * @var array<int, int>
     */
    public array $backoff = [10, 30, 60];

    public function __construct(public int $emailLogId)
    {
    }

    public function handle(): void
    {
        $emailLog = EmailLog::find($this->emailLogId);
        if (!$emailLog || $emailLog->status === 'sent') {
            return;
        }

        $recipient = User::find($emailLog->user_id);
        if (!$recipient || empty($recipient->email)) {
            $emailLog->update([
                'status' => 'failed',
                'error_message' => 'Recipient user or email address is missing.',
            ]);
            return;
        }

        // Re-check user settings immediately prior to dispatch (G2-079 Criterion 4)
        $eval = NotificationPreferenceService::shouldSendEmail($recipient, $emailLog->type);
        if (!$eval['allowed']) {
            $emailLog->update([
                'status' => $eval['reason'] ?? 'skipped by user setting',
            ]);
            return;
        }

        $notification = $emailLog->notification_id
            ? Notification::find($emailLog->notification_id)
            : new Notification([
                'user_id' => $emailLog->user_id,
                'type' => $emailLog->type,
                'module' => $emailLog->module,
                'title' => str_replace('[SERMS] ', '', $emailLog->subject),
                'message' => $emailLog->subject,
                'record_type' => $emailLog->record_type,
                'record_id' => $emailLog->record_id,
                'record_link' => $emailLog->record_link,
            ]);

        $attemptNumber = max(1, (int) $this->attempts());

        try {
            $details = is_array($notification?->metadata) ? $notification->metadata : [];
            Mail::to($recipient->email)->send(new NotificationMail($notification, $recipient, $details));

            $emailLog->update([
                'status' => 'sent',
                'attempts' => $attemptNumber,
                'sent_at' => now(),
                'error_message' => null,
            ]);
        } catch (\Throwable $e) {
            $emailLog->update([
                'attempts' => $attemptNumber,
                'error_message' => $e->getMessage(),
            ]);

            Log::error('SendNotificationEmailJob delivery attempt failed', [
                'email_log_id' => $emailLog->id,
                'recipient' => $recipient->email,
                'type' => $emailLog->type,
                'attempt' => $attemptNumber,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function failed(\Throwable $exception): void
    {
        $emailLog = EmailLog::find($this->emailLogId);
        if ($emailLog) {
            $emailLog->update([
                'status' => 'failed',
                'attempts' => max((int) $emailLog->attempts, 1),
                'error_message' => $exception->getMessage(),
            ]);
        }
    }
}
```

Modify `apps/api/app/Modules/Notifications/Services/NotificationService.php` to enrich metadata from message patterns when not explicitly passed and dispatch `SendNotificationEmailJob` (or log `'skipped by user setting'`):

```php
<?php

namespace App\Modules\Notifications\Services;

use App\Modules\Notifications\Jobs\SendNotificationEmailJob;
use App\Modules\Notifications\Models\EmailLog;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Users\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    /**
     * Format a numeric amount in Philippine Pesos (e.g. ₱4,500.10).
     */
    public static function formatPeso(float|int|string|null $amount): string
    {
        return '₱' . number_format((float) ($amount ?? 0), 2, '.', ',');
    }

    /**
     * Query all admin users (Accounting department or explicit admin/finance roles).
     */
    public static function getAdminUsers(?int $excludeUserId = null): Collection
    {
        $query = User::query()->where(function ($q) {
            $q->whereRaw('LOWER(TRIM(COALESCE(department, ""))) = ?', ['accounting'])
              ->orWhereIn('role', ['admin', 'superadmin', 'finance', 'accounting']);
        });

        if ($excludeUserId !== null) {
            $query->where('id', '!=', $excludeUserId);
        }

        return $query->get();
    }

    /**
     * Enrich metadata with extracted amount, status, and comment/reason so emails always show structured fields.
     */
    private static function enrichMetadata(string $type, string $title, string $message, array $metadata = []): array
    {
        if (empty($metadata['amount']) && preg_match('/₱[\d,]+(?:\.\d{2})?/', $message, $amtMatch)) {
            $metadata['amount'] = $amtMatch[0];
        } elseif (isset($metadata['amount']) && is_numeric($metadata['amount'])) {
            $metadata['amount'] = self::formatPeso($metadata['amount']);
        }

        if (empty($metadata['comment']) && preg_match('/(?:comment|note|reason):\s*"([^"]+)"/i', $message, $commentMatch)) {
            $metadata['comment'] = $commentMatch[1];
        }

        if (empty($metadata['status'])) {
            $metadata['status'] = match (true) {
                str_contains($type, 'approved') => 'Approved',
                str_contains($type, 'rejected') => 'Rejected',
                str_contains($type, 'revised') => 'Needs Revision',
                str_contains($type, 'cancelled') => 'Cancelled',
                str_contains($type, 'granted') => 'Granted',
                str_contains($type, 'disbursed') => 'Disbursed',
                str_contains($type, 'settled') => 'Settled',
                str_contains($type, 'submitted') => 'Pending / Submitted',
                str_contains($type, 'signed') || str_contains($type, 'acknowledged') => 'Acknowledged',
                str_contains($type, 'resubmitted') => 'Resubmitted',
                str_contains($type, 'overdue') => 'Overdue',
                str_contains($type, 'due_today') => 'Due Today',
                str_contains($type, 'due_soon') => 'Due Soon',
                default => null,
            };
        }

        if (!empty($metadata['penalty_amount']) && empty($metadata['penalty_formatted'])) {
            $metadata['penalty_formatted'] = self::formatPeso($metadata['penalty_amount']);
        }

        return array_filter($metadata, fn ($v) => $v !== null && $v !== '');
    }

    /**
     * Evaluate user email settings, record an EmailLog row, and dispatch SendNotificationEmailJob if allowed.
     */
    private static function dispatchEmailForNotification(Notification $notification): void
    {
        try {
            $recipient = User::find($notification->user_id);
            if (!$recipient || empty($recipient->email)) {
                return;
            }

            $eval = NotificationPreferenceService::shouldSendEmail($recipient, $notification->type);
            if ($eval['setting_key'] === null) {
                // In-app only notification type (e.g. My Expense draft receipt upload)
                return;
            }

            $subject = '[SERMS] ' . ($notification->title ?: $notification->module);

            if (!$eval['allowed']) {
                EmailLog::create([
                    'notification_id' => $notification->id,
                    'user_id' => $recipient->id,
                    'recipient_email' => $recipient->email,
                    'type' => $notification->type,
                    'setting_key' => $eval['setting_key'],
                    'module' => $notification->module,
                    'record_type' => $notification->record_type,
                    'record_id' => $notification->record_id,
                    'record_link' => $notification->record_link,
                    'subject' => $subject,
                    'status' => $eval['reason'] ?? 'skipped by user setting',
                    'attempts' => 0,
                ]);
                return;
            }

            $emailLog = EmailLog::create([
                'notification_id' => $notification->id,
                'user_id' => $recipient->id,
                'recipient_email' => $recipient->email,
                'type' => $notification->type,
                'setting_key' => $eval['setting_key'],
                'module' => $notification->module,
                'record_type' => $notification->record_type,
                'record_id' => $notification->record_id,
                'record_link' => $notification->record_link,
                'subject' => $subject,
                'status' => 'queued',
                'attempts' => 0,
            ]);

            SendNotificationEmailJob::dispatch($emailLog->id);
        } catch (\Throwable $e) {
            Log::error('NotificationService::dispatchEmailForNotification failed', [
                'notification_id' => $notification->id,
                'user_id' => $notification->user_id,
                'type' => $notification->type,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Create a single unread notification for a target user and queue its email if enabled.
     */
    public static function notifyUser(
        int $userId,
        string $type,
        string $module,
        string $title,
        string $message,
        string $recordLink,
        ?string $recordType = null,
        ?int $recordId = null,
        array $metadata = []
    ): Notification {
        try {
            $enriched = self::enrichMetadata($type, $title, $message, $metadata);

            $notification = Notification::create([
                'user_id' => $userId,
                'type' => $type,
                'module' => $module,
                'title' => $title,
                'message' => $message,
                'record_type' => $recordType,
                'record_id' => $recordId,
                'record_link' => $recordLink,
                'is_read' => false,
                'metadata' => !empty($enriched) ? $enriched : null,
            ]);

            self::dispatchEmailForNotification($notification);

            return $notification;
        } catch (\Throwable $e) {
            Log::error('NotificationService::notifyUser failed', [
                'user_id' => $userId,
                'type' => $type,
                'module' => $module,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * Create a single unread notification only if an identical (user_id, type, record_type, record_id)
     * notification does not already exist. Used by daily deadline/overdue checks (G2-071, G2-077).
     */
    public static function notifyOnce(
        int $userId,
        string $type,
        string $module,
        string $title,
        string $message,
        string $recordLink,
        string $recordType,
        int $recordId,
        array $metadata = []
    ): ?Notification {
        $exists = Notification::query()
            ->where('user_id', $userId)
            ->where('type', $type)
            ->where('record_type', $recordType)
            ->where('record_id', $recordId)
            ->exists();

        if ($exists) {
            return null;
        }

        return self::notifyUser(
            userId: $userId,
            type: $type,
            module: $module,
            title: $title,
            message: $message,
            recordLink: $recordLink,
            recordType: $recordType,
            recordId: $recordId,
            metadata: $metadata
        );
    }

    /**
     * Notify all admin users.
     */
    public static function notifyAdmins(
        string $type,
        string $module,
        string $title,
        string $message,
        string $recordLink,
        ?string $recordType = null,
        ?int $recordId = null,
        array $metadata = [],
        ?int $excludeUserId = null
    ): Collection {
        $admins = self::getAdminUsers($excludeUserId);
        $created = collect();

        foreach ($admins as $admin) {
            $created->push(self::notifyUser(
                userId: (int) $admin->id,
                type: $type,
                module: $module,
                title: $title,
                message: $message,
                recordLink: $recordLink,
                recordType: $recordType,
                recordId: $recordId,
                metadata: $metadata
            ));
        }

        return $created;
    }

    /**
     * Notify all admin users once per (type, record_type, record_id).
     */
    public static function notifyAdminsOnce(
        string $type,
        string $module,
        string $title,
        string $message,
        string $recordLink,
        string $recordType,
        int $recordId,
        array $metadata = [],
        ?int $excludeUserId = null
    ): Collection {
        $admins = self::getAdminUsers($excludeUserId);
        $created = collect();

        foreach ($admins as $admin) {
            $notif = self::notifyOnce(
                userId: (int) $admin->id,
                type: $type,
                module: $module,
                title: $title,
                message: $message,
                recordLink: $recordLink,
                recordType: $recordType,
                recordId: $recordId,
                metadata: $metadata
            );
            if ($notif) {
                $created->push($notif);
            }
        }

        return $created;
    }
}
```

Update `apps/api/.env.example` (`MAIL_*` and `FRONTEND_URL`) and `docker-compose.yml` (`php` and `api_queue` environment variables) so Brevo SMTP credentials and `FRONTEND_URL` are passed into both the API and queue containers:

In `apps/api/.env.example` (lines 50–58):

```dotenv
FRONTEND_URL=http://localhost:5002

MAIL_MAILER=smtp
MAIL_SCHEME=null
MAIL_HOST=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_FROM_ADDRESS="no-reply@sbsi.com"
MAIL_FROM_NAME="SBSI SERMS"
```

In `docker-compose.yml` (under both `php.environment` and `api_queue.environment`):

```yaml
      - FRONTEND_URL=${FRONTEND_URL:-http://localhost:5002}
      - MAIL_MAILER=${MAIL_MAILER:-log}
      - MAIL_SCHEME=${MAIL_SCHEME:-}
      - MAIL_HOST=${MAIL_HOST:-smtp-relay.brevo.com}
      - MAIL_PORT=${MAIL_PORT:-587}
      - MAIL_USERNAME=${MAIL_USERNAME:-}
      - MAIL_PASSWORD=${MAIL_PASSWORD:-}
      - MAIL_FROM_ADDRESS=${MAIL_FROM_ADDRESS:-no-reply@sbsi.com}
      - MAIL_FROM_NAME=${MAIL_FROM_NAME:-SBSI SERMS}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec serms_php php artisan test --filter=EmailNotificationDeliveryTest`
Expected: PASS (3 tests, 20 assertions)

- [ ] **Step 5: Commit (when permitted by user)**

```bash
git add apps/api/app/Modules/Notifications/Mail/NotificationMail.php \
        apps/api/resources/views/emails/sbsi-notification.blade.php \
        apps/api/app/Modules/Notifications/Jobs/SendNotificationEmailJob.php \
        apps/api/app/Modules/Notifications/Services/NotificationService.php \
        apps/api/.env.example \
        docker-compose.yml \
        apps/api/tests/Feature/EmailNotificationDeliveryTest.php
git commit -m "feat(notifications): add branded SBSI email template, queued email job with retries, and EmailLog tracking (G2-074, G2-075, G2-076, G2-079)"
```

---

### Task 3: Two-Stage Liquidation Deadline & Overdue Email Reminders (`G2-077`)

**Files:**
- Modify: `apps/api/app/Console/Commands/CheckLiquidationDeadlines.php`
- Modify: `apps/api/tests/Feature/LiquidationDeadlineNotificationTest.php`

**Interfaces:**
- Consumes:
  - `NotificationService::notifyOnce()` and `NotificationService::notifyAdminsOnce()`
  - `NotificationPreferenceService` (`near_deadline_reminders`, `overdue_alerts`, `admin_overdue_liquidations`)
- Produces:
  - `liquidation_due_soon` (`1 <= $daysLeft <= 3`) — sent once per liquidation when 1 to 3 days remain
  - `liquidation_due_today` (`$daysLeft === 0`) — sent once per liquidation on the due date itself
  - `liquidation_overdue` & `admin_liquidation_overdue` (`$daysLeft < 0`) — sent once per liquidation with `days_overdue` and `penalty_amount`

- [ ] **Step 1: Update `apps/api/tests/Feature/LiquidationDeadlineNotificationTest.php` with failing assertions for two-stage near-deadline + due-today emails and email logs (`G2-077`)**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Notifications\Models\EmailLog;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Mail\NotificationMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;

class LiquidationDeadlineNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@sbsi.com',
            'role' => 'employee',
            'department' => 'Operations',
        ]);

        $this->admin = User::create([
            'name' => 'Maria Admin',
            'email' => 'maria@sbsi.com',
            'role' => 'admin',
            'department' => 'Accounting',
        ]);
    }

    public function test_due_soon_due_today_and_overdue_notifications_and_emails_are_sent_once_per_stage_and_skip_settled(): void
    {
        Mail::fake();

        // 1. Near deadline (2 days left -> liquidation_due_soon)
        $dueSoonAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Due Soon Trip',
            'amount' => 5000.00,
            'outstanding_balance' => 5000.00,
            'expected_disbursement_date' => now()->subDays(5)->toDateString(),
            'expected_liquidation_date' => now()->addDays(2)->toDateString(),
            'status' => 'signed',
            'acknowledged_at' => now()->subDays(4),
        ]);

        // 2. Due today (0 days left -> liquidation_due_today)
        $dueTodayAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Due Today Conference',
            'amount' => 4200.00,
            'outstanding_balance' => 4200.00,
            'expected_disbursement_date' => now()->subDays(7)->toDateString(),
            'expected_liquidation_date' => now()->toDateString(),
            'status' => 'signed',
            'acknowledged_at' => now()->subDays(6),
        ]);

        // 3. Overdue (3 days past due)
        $overdueAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Overdue Field Work',
            'amount' => 8000.00,
            'outstanding_balance' => 8000.00,
            'expected_disbursement_date' => now()->subDays(10)->toDateString(),
            'expected_liquidation_date' => now()->subDays(3)->toDateString(),
            'status' => 'signed',
            'acknowledged_at' => now()->subDays(9),
        ]);

        // 4. Already liquidated/settled (should NEVER be flagged)
        $settledAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Settled Work',
            'amount' => 3000.00,
            'outstanding_balance' => 0.00,
            'expected_disbursement_date' => now()->subDays(12)->toDateString(),
            'expected_liquidation_date' => now()->subDays(5)->toDateString(),
            'status' => 'liquidated',
            'acknowledged_at' => now()->subDays(11),
        ]);
        Liquidation::create([
            'cash_advance_id' => $settledAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'liquidated',
            'reimbursement_ids' => [],
            'total_expense_amount' => 3000.00,
            'outstanding_balance' => 0.00,
        ]);

        Artisan::call('penalties:calculate');

        // Stage 1: Near-deadline (2 days left) creates 1 notification & 1 sent email
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'liquidation_due_soon',
            'record_type' => 'cash_advance',
            'record_id' => $dueSoonAdvance->id,
        ]);
        $this->assertDatabaseHas('email_logs', [
            'user_id' => $this->employee->id,
            'type' => 'liquidation_due_soon',
            'record_id' => $dueSoonAdvance->id,
            'status' => 'sent',
        ]);

        // Stage 2: Due-today (0 days left) creates 1 notification & 1 sent email
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'liquidation_due_today',
            'record_type' => 'cash_advance',
            'record_id' => $dueTodayAdvance->id,
        ]);
        $this->assertDatabaseHas('email_logs', [
            'user_id' => $this->employee->id,
            'type' => 'liquidation_due_today',
            'record_id' => $dueTodayAdvance->id,
            'status' => 'sent',
        ]);

        // Also verify that if dueSoonAdvance transitions to due today (0 days left), it STILL receives the due-today email!
        $dueSoonAdvance->update(['expected_liquidation_date' => now()->toDateString()]);
        Artisan::call('notifications:check-liquidation-deadlines');
        $this->assertDatabaseHas('email_logs', [
            'user_id' => $this->employee->id,
            'type' => 'liquidation_due_today',
            'record_id' => $dueSoonAdvance->id,
            'status' => 'sent',
        ]);

        // Stage 3: Overdue creates 1 notification + email for employee and 1 for admin with days overdue and penalty (₱150.00)
        $empOverdue = Notification::where('user_id', $this->employee->id)
            ->where('type', 'liquidation_overdue')
            ->where('record_id', $overdueAdvance->id)
            ->first();
        $this->assertNotNull($empOverdue);
        $this->assertStringContainsString('3 days overdue', $empOverdue->message);
        $this->assertStringContainsString('₱150.00', $empOverdue->message);

        $this->assertDatabaseHas('email_logs', [
            'user_id' => $this->employee->id,
            'type' => 'liquidation_overdue',
            'record_id' => $overdueAdvance->id,
            'status' => 'sent',
        ]);

        $this->assertDatabaseHas('email_logs', [
            'user_id' => $this->admin->id,
            'type' => 'admin_liquidation_overdue',
            'record_id' => $overdueAdvance->id,
            'status' => 'sent',
        ]);

        // Settled advance is never flagged
        $this->assertDatabaseMissing('notifications', [
            'record_type' => 'cash_advance',
            'record_id' => $settledAdvance->id,
        ]);
        $this->assertDatabaseMissing('email_logs', [
            'record_type' => 'cash_advance',
            'record_id' => $settledAdvance->id,
        ]);

        // Running again does not send duplicate emails for the same stage
        $emailCountBefore = EmailLog::count();
        Artisan::call('notifications:check-liquidation-deadlines');
        $this->assertSame($emailCountBefore, EmailLog::count());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec serms_php php artisan test --filter=LiquidationDeadlineNotificationTest`
Expected: FAIL (`Failed asserting that a row in the table [notifications] matches the attributes {"type":"liquidation_due_today"}`)

- [ ] **Step 3: Update `apps/api/app/Console/Commands/CheckLiquidationDeadlines.php` to support `liquidation_due_soon` (`1..3` days) and `liquidation_due_today` (`0` days)**

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\PenaltyRecord;
use App\Modules\Notifications\Services\NotificationService;
use Carbon\Carbon;

class CheckLiquidationDeadlines extends Command
{
    protected $signature = 'notifications:check-liquidation-deadlines';

    protected $description = 'Send Near-Deadline (1-3 days), Due Today (0 days), and Overdue liquidation notifications and emails to employees and admins.';

    public function handle(): int
    {
        $today = Carbon::now()->startOfDay();

        $advances = CashAdvance::with(['requester', 'liquidations'])
            ->whereIn('status', ['disbursed', 'signed', 'incomplete', 'overdue'])
            ->whereNotNull('expected_liquidation_date')
            ->where('outstanding_balance', '>', 0)
            ->get();

        foreach ($advances as $advance) {
            // Skip if any linked liquidation is already settled/liquidated/approved/under-review/pending
            $hasSettledOrActiveAudit = $advance->liquidations->contains(function ($liq) {
                return in_array(strtolower((string) $liq->status), ['liquidated', 'settled', 'approved', 'pending', 'under-review'], true);
            });

            if ($hasSettledOrActiveAudit) {
                continue;
            }

            $dueDate = Carbon::parse($advance->expected_liquidation_date)->startOfDay();
            $daysLeft = (int) $today->diffInDays($dueDate, false);
            $formattedDue = $dueDate->format('M j, Y');
            $formattedAmount = NotificationService::formatPeso($advance->amount);
            $employeeName = $advance->requester?->name ?? 'Employee';
            $latestLiq = $advance->liquidations->sortByDesc('id')->first();
            $recordLink = $latestLiq
                ? "/liquidations?view={$latestLiq->id}"
                : "/liquidations?advance={$advance->id}";

            if ($daysLeft >= 1 && $daysLeft <= 3) {
                // Stage 1: Near-deadline warning (1 to 3 days left) (G2-071 Task 3 & G2-077 Task 1)
                $dayWord = $daysLeft === 1 ? 'day' : 'days';
                NotificationService::notifyOnce(
                    userId: (int) $advance->user_id,
                    type: 'liquidation_due_soon',
                    module: 'Liquidation',
                    title: 'Liquidation Due Soon',
                    message: "Your liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is due in {$daysLeft} {$dayWord} ({$formattedDue}).",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'status' => 'Due Soon',
                        'amount' => $formattedAmount,
                        'days_left' => $daysLeft,
                        'due_date' => $formattedDue,
                    ]
                );
            } elseif ($daysLeft === 0) {
                // Stage 2: Due Today reminder (G2-077 Task 1)
                NotificationService::notifyOnce(
                    userId: (int) $advance->user_id,
                    type: 'liquidation_due_today',
                    module: 'Liquidation',
                    title: 'Liquidation Due Today',
                    message: "Your liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is due today ({$formattedDue}).",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'status' => 'Due Today',
                        'amount' => $formattedAmount,
                        'days_left' => 0,
                        'due_date' => $formattedDue,
                    ]
                );
            } elseif ($daysLeft < 0) {
                // Stage 3: Overdue alert for employee and all admins (G2-071 Task 2 & 3, G2-077 Task 2)
                $daysOverdue = abs($daysLeft);
                $penaltySum = (float) PenaltyRecord::where('cash_advance_id', $advance->id)->sum('penalty_amount');
                if ($penaltySum <= 0) {
                    $penaltySum = $daysOverdue * 50.00;
                }
                $formattedPenalty = NotificationService::formatPeso($penaltySum);
                $dayWord = $daysOverdue === 1 ? 'day' : 'days';

                NotificationService::notifyOnce(
                    userId: (int) $advance->user_id,
                    type: 'liquidation_overdue',
                    module: 'Liquidation',
                    title: 'Liquidation Overdue',
                    message: "Your liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is {$daysOverdue} {$dayWord} overdue (Due: {$formattedDue}). Current penalty: {$formattedPenalty}.",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'status' => 'Overdue',
                        'amount' => $formattedAmount,
                        'days_overdue' => $daysOverdue,
                        'penalty_amount' => $penaltySum,
                        'penalty_formatted' => $formattedPenalty,
                        'due_date' => $formattedDue,
                    ]
                );

                NotificationService::notifyAdminsOnce(
                    type: 'admin_liquidation_overdue',
                    module: 'Liquidation',
                    title: 'Overdue Liquidation Alert',
                    message: "{$employeeName}'s liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is {$daysOverdue} {$dayWord} overdue. Accrued penalty: {$formattedPenalty}.",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'employee_name' => $employeeName,
                        'status' => 'Overdue',
                        'amount' => $formattedAmount,
                        'days_overdue' => $daysOverdue,
                        'penalty_amount' => $penaltySum,
                        'penalty_formatted' => $formattedPenalty,
                        'due_date' => $formattedDue,
                    ],
                    excludeUserId: (int) $advance->user_id
                );
            }
        }

        return Command::SUCCESS;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec serms_php php artisan test --filter=LiquidationDeadlineNotificationTest`
Expected: PASS (1 test, 20 assertions)

- [ ] **Step 5: Commit (when permitted by user)**

```bash
git add apps/api/app/Console/Commands/CheckLiquidationDeadlines.php \
        apps/api/tests/Feature/LiquidationDeadlineNotificationTest.php
git commit -m "feat(notifications): add two-stage near-deadline and due-today email reminders for liquidations (G2-077)"
```

---

### Task 4: Frontend Notification Settings Page (`/settings/notifications`), Store Actions & Entry Points (`G2-078`, `G2-079`, `G2-074`)

**Files:**
- Modify: `apps/web/src/stores/notification.js`
- Create: `apps/web/src/views/NotificationSettingsView.vue`
- Modify: `apps/web/src/router/index.js`
- Modify: `apps/web/src/layouts/AppLayout.vue`
- Modify: `apps/web/src/views/NotificationsView.vue`
- Modify: `apps/web/src/components/base/NotificationPanel.vue`
- Create: `apps/web/src/views/NotificationSettingsView.test.js`
- Modify: `apps/web/src/stores/notification.test.js`

**Interfaces:**
- Consumes:
  - `GET /api/serms/notifications/settings` → `{ data: NotificationSetting, role_scope: 'admin'|'employee' }`
  - `PUT /api/serms/notifications/settings` → `{ message: string, data: NotificationSetting, role_scope: 'admin'|'employee' }`
  - `useAuthStore().isAdmin`
- Produces:
  - `useNotificationStore().settings`, `useNotificationStore().fetchSettings()`, `useNotificationStore().saveSettings(payload)`
  - Route `/settings/notifications` (`NotificationSettingsView.vue`)
  - Navigation links in `AppLayout.vue` (User Profile dropdown), `NotificationsView.vue`, and `NotificationPanel.vue`

- [ ] **Step 1: Write the failing frontend tests in `apps/web/src/views/NotificationSettingsView.test.js`**

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NotificationSettingsView from "./NotificationSettingsView.vue";
import { useAuthStore } from "@/stores/auth";
import { useNotificationStore } from "@/stores/notification";

const mockPush = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ path: "/settings/notifications", query: {} }),
}));

const mockAddToast = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/utils/apiFetch";

describe("NotificationSettingsView.vue (G2-078, G2-079)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders only the 5 employee email toggles when logged in as an employee", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Juan Dela Cruz", role: "employee", is_admin: false };

    apiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        role_scope: "employee",
        data: {
          email_enabled: true,
          request_submissions: true,
          status_updates: true,
          admin_comments: true,
          near_deadline_reminders: true,
          overdue_alerts: true,
          admin_new_requests: true,
          admin_employee_updates: true,
          admin_overdue_liquidations: true,
        },
      }),
    });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    // Employee toggles visible
    expect(wrapper.find('[data-testid="toggle-request_submissions"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-status_updates"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-admin_comments"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-near_deadline_reminders"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-overdue_alerts"]').exists()).toBe(true);

    // Admin toggles NOT visible for employee (G2-078 Criterion 1)
    expect(wrapper.find('[data-testid="toggle-admin_new_requests"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="toggle-admin_employee_updates"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="toggle-admin_overdue_liquidations"]').exists()).toBe(false);
  });

  it("renders only the 3 admin email toggles when logged in as an admin", async () => {
    const auth = useAuthStore();
    auth.user = { id: 2, name: "Maria Admin", role: "admin", department: "Accounting", is_admin: true };

    apiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        role_scope: "admin",
        data: {
          email_enabled: true,
          request_submissions: true,
          status_updates: true,
          admin_comments: true,
          near_deadline_reminders: true,
          overdue_alerts: true,
          admin_new_requests: true,
          admin_employee_updates: true,
          admin_overdue_liquidations: true,
        },
      }),
    });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    // Admin toggles visible
    expect(wrapper.find('[data-testid="toggle-admin_new_requests"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-admin_employee_updates"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-admin_overdue_liquidations"]').exists()).toBe(true);

    // Employee toggles NOT visible for admin
    expect(wrapper.find('[data-testid="toggle-request_submissions"]').exists()).toBe(false);
  });

  it("allows toggling preferences and saving via Save Preferences button with confirmation toast", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Juan Dela Cruz", role: "employee", is_admin: false };

    apiFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          role_scope: "employee",
          data: {
            email_enabled: true,
            request_submissions: true,
            status_updates: true,
            admin_comments: true,
            near_deadline_reminders: true,
            overdue_alerts: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          message: "Notification settings saved successfully.",
          role_scope: "employee",
          data: {
            email_enabled: true,
            request_submissions: false,
            status_updates: true,
            admin_comments: true,
            near_deadline_reminders: true,
            overdue_alerts: true,
          },
        }),
      });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    await wrapper.find('[data-testid="toggle-request_submissions"]').trigger("click");
    await wrapper.find('[data-testid="save-notification-settings"]').trigger("click");
    await flushPromises();

    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/serms/notifications/settings",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"request_submissions":false'),
      }),
    );

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Notification settings saved successfully.",
        type: "success",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec serms_web npx vitest run src/views/NotificationSettingsView.test.js`
Expected: FAIL (`Failed to resolve import "./NotificationSettingsView.vue"`)

- [ ] **Step 3: Update `useNotificationStore`, create `NotificationSettingsView.vue`, register `/settings/notifications`, and add navigation entry points**

Update `apps/web/src/stores/notification.js` to add `settings`, `isSavingSettings`, `fetchSettings()`, and `saveSettings(payload)` (and include `due_today` in `inferSeverity`):

```javascript
const DEFAULT_SETTINGS = () => ({
  email_enabled: true,
  request_submissions: true,
  status_updates: true,
  admin_comments: true,
  near_deadline_reminders: true,
  overdue_alerts: true,
  admin_new_requests: true,
  admin_employee_updates: true,
  admin_overdue_liquidations: true,
});
```

Add inside `useNotificationStore` in `apps/web/src/stores/notification.js`:

```javascript
  const settings = ref(DEFAULT_SETTINGS());
  const isSavingSettings = ref(false);

  async function fetchSettings() {
    const res = await apiFetch("/api/serms/notifications/settings");
    if (!res.ok) {
      return settings.value;
    }
    const payload = await res.json();
    if (payload?.data) {
      settings.value = {
        ...DEFAULT_SETTINGS(),
        ...payload.data,
      };
    }
    return settings.value;
  }

  async function saveSettings(updatedSettings) {
    const { addToast } = useToast();
    isSavingSettings.value = true;
    try {
      const res = await apiFetch("/api/serms/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });
      if (!res.ok) {
        addToast({
          message: "Failed to save notification settings.",
          type: "error",
        });
        throw new Error("Failed to save settings");
      }
      const payload = await res.json();
      if (payload?.data) {
        settings.value = {
          ...DEFAULT_SETTINGS(),
          ...payload.data,
        };
      }
      addToast({
        message: payload?.message || "Notification settings saved successfully.",
        type: "success",
      });
      return settings.value;
    } finally {
      isSavingSettings.value = false;
    }
  }
```

Create `apps/web/src/views/NotificationSettingsView.vue`:

```vue
<script setup>
import { reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useNotificationStore } from "@/stores/notification";
import BaseButton from "@/components/base/BaseButton.vue";
import { Bell, Mail, ArrowLeft, ShieldCheck, Save } from "lucide-vue-next";

const auth = useAuthStore();
const notifStore = useNotificationStore();
const router = useRouter();

const form = reactive({
  email_enabled: true,
  request_submissions: true,
  status_updates: true,
  admin_comments: true,
  near_deadline_reminders: true,
  overdue_alerts: true,
  admin_new_requests: true,
  admin_employee_updates: true,
  admin_overdue_liquidations: true,
});

const EMPLOYEE_TOGGLES = [
  {
    key: "request_submissions",
    label: "Request submissions",
    description:
      "Receive a confirmation email when you submit a reimbursement, cash advance, or liquidation.",
  },
  {
    key: "status_updates",
    label: "Status updates (approved, rejected, cancelled, granted, revised)",
    description:
      "Receive an email when an admin approves, rejects, cancels, grants, disburses, settles, or returns your request for revision.",
  },
  {
    key: "admin_comments",
    label: "Admin comments and notes",
    description:
      "Receive an email when an admin leaves a comment or note on your reimbursement, receipt, cash advance, or liquidation.",
  },
  {
    key: "near_deadline_reminders",
    label: "Near-deadline reminders",
    description:
      "Receive a reminder email when your liquidation has 3 days or less remaining, and again on the day it is due.",
  },
  {
    key: "overdue_alerts",
    label: "Overdue alerts",
    description:
      "Receive an alert email showing days overdue and accrued penalty when a liquidation passes its deadline.",
  },
];

const ADMIN_TOGGLES = [
  {
    key: "admin_new_requests",
    label: "New requests from employees",
    description:
      "Receive an email whenever an employee submits a new reimbursement, cash advance, or liquidation request.",
  },
  {
    key: "admin_employee_updates",
    label: "Employee notes, signatures and resubmissions",
    description:
      "Receive an email when an employee adds a comment/note, signs an acknowledgement, uploads a new file, or resubmits after revision.",
  },
  {
    key: "admin_overdue_liquidations",
    label: "Overdue liquidations",
    description:
      "Receive a daily alert email when an employee's liquidation becomes overdue, including days overdue and penalty.",
  },
];

const visibleToggles = computed(() =>
  auth.isAdmin ? ADMIN_TOGGLES : EMPLOYEE_TOGGLES,
);

function syncFromStore(data) {
  if (!data) return;
  Object.keys(form).forEach((key) => {
    if (typeof data[key] === "boolean") {
      form[key] = data[key];
    }
  });
}

function toggleMasterSwitch() {
  form.email_enabled = !form.email_enabled;
}

function toggleCategory(key) {
  if (!form.email_enabled) return;
  form[key] = !form[key];
}

async function handleSave() {
  await notifStore.saveSettings({ ...form });
  syncFromStore(notifStore.settings);
}

onMounted(async () => {
  const data = await notifStore.fetchSettings();
  syncFromStore(data);
});
</script>

<template>
  <div class="flex flex-col gap-6 max-w-3xl mx-auto font-sans">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <button
            type="button"
            class="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary transition-colors"
            @click="router.push('/notifications')"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>Back to Notifications</span>
          </button>
        </div>
        <h1 class="text-page-title">Notification Settings</h1>
        <p class="mt-1 text-sm text-slate-500">
          Choose which email notifications you want to receive at
          <span class="font-semibold text-slate-700">{{ auth.user?.email || "your registered email" }}</span>.
          In-app notifications (bell and Notifications page) remain active even when emails are turned off.
        </p>
      </div>
    </div>

    <!-- Master Email Switch Card -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center justify-between gap-4">
      <div class="flex items-start gap-3.5">
        <div class="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Mail class="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 class="text-sm font-bold text-slate-800">
            Receive Email Notifications (Master Switch)
          </h2>
          <p class="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Turn all email notifications on or off. When turned off, no emails will be sent to your inbox, while your individual preferences below are preserved.
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        data-testid="toggle-email_enabled"
        :aria-checked="form.email_enabled"
        :class="[
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
          form.email_enabled ? 'bg-primary' : 'bg-slate-300',
        ]"
        @click="toggleMasterSwitch"
      >
        <span
          :class="[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            form.email_enabled ? 'translate-x-5' : 'translate-x-0',
          ]"
        />
      </button>
    </div>

    <!-- Role-Scoped Email Type Toggles Card -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Bell class="w-4 h-4 text-primary" />
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            {{ auth.isAdmin ? "Admin Email Notification Types" : "Employee Email Notification Types" }}
          </h3>
        </div>
        <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
          {{ auth.isAdmin ? "Admin Role" : "Employee Role" }}
        </span>
      </div>

      <div class="divide-y divide-slate-100">
        <div
          v-for="item in visibleToggles"
          :key="item.key"
          :class="[
            'px-5 py-4 flex items-center justify-between gap-4 transition-opacity',
            !form.email_enabled ? 'opacity-50' : '',
          ]"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-800">
              {{ item.label }}
            </p>
            <p class="text-xs text-slate-500 mt-0.5 leading-relaxed">
              {{ item.description }}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            :data-testid="`toggle-${item.key}`"
            :disabled="!form.email_enabled"
            :aria-checked="form.email_enabled && form[item.key]"
            :class="[
              'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
              !form.email_enabled ? 'cursor-not-allowed bg-slate-200' : form[item.key] ? 'cursor-pointer bg-primary' : 'cursor-pointer bg-slate-300',
            ]"
            @click="toggleCategory(item.key)"
          >
            <span
              :class="[
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                form.email_enabled && form[item.key] ? 'translate-x-5' : 'translate-x-0',
              ]"
            />
          </button>
        </div>
      </div>

      <!-- Card Footer with Explicit Save Button -->
      <div class="px-5 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck class="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>In-app notifications will continue working regardless of your email preferences.</span>
        </div>

        <BaseButton
          data-testid="save-notification-settings"
          variant="primary"
          size="sm"
          :disabled="notifStore.isSavingSettings"
          @click="handleSave"
        >
          <Save class="w-4 h-4 mr-1.5" />
          {{ notifStore.isSavingSettings ? "Saving..." : "Save Preferences" }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
```

Modify `apps/web/src/router/index.js` to register `/settings/notifications`:

```javascript
      {
        path: "settings/notifications",
        name: "NotificationSettings",
        component: () => import("@/views/NotificationSettingsView.vue"),
        meta: { title: "Notification Settings" },
      },
```

Modify `apps/web/src/layouts/AppLayout.vue` to add `"Notification Settings"` in the top-right User Profile dropdown (right under `"My Profile"`):

```vue
              <DropdownMenuItem
                data-testid="menu-notification-settings"
                @select="router.push('/settings/notifications')"
              >
                <Bell class="w-4 h-4 text-slate-500 mr-2" />
                <span>Notification Settings</span>
              </DropdownMenuItem>
```

Modify `apps/web/src/views/NotificationsView.vue` to add a `"Notification Settings"` button next to `"Mark all as read"` in the header, and `apps/web/src/components/base/NotificationPanel.vue` to add a `"Notification Settings"` link in the dropdown footer.

- [ ] **Step 4: Run frontend and backend test suites to verify all tests pass**

Run:
- `docker exec serms_web npx vitest run src/views/NotificationSettingsView.test.js src/stores/notification.test.js src/views/NotificationsView.test.js`
- `docker exec serms_php php artisan test --filter="NotificationSettingsApiTest|EmailNotificationDeliveryTest|LiquidationDeadlineNotificationTest|NotificationApiTest"`
Expected: PASS

- [ ] **Step 5: Commit (when permitted by user)**

```bash
git add apps/web/src/stores/notification.js \
        apps/web/src/views/NotificationSettingsView.vue \
        apps/web/src/router/index.js \
        apps/web/src/layouts/AppLayout.vue \
        apps/web/src/views/NotificationsView.vue \
        apps/web/src/components/base/NotificationPanel.vue \
        apps/web/src/views/NotificationSettingsView.test.js
git commit -m "feat(web): add NotificationSettingsView and navigation links for email preferences (G2-078, G2-079)"
```
