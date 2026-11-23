# Notifications Epic (EP 8: G2-065 to G2-073) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Epic 8 (Notifications) — `G2-065`, `G2-066`, `G2-067`, `G2-068`, `G2-069`, `G2-070`, `G2-071`, `G2-072`, and `G2-073` — delivering an end-to-end in-app notification system with database persistence, cross-module event hooks, daily liquidation deadline/overdue alerts, a top-bar bell dropdown with 30-second auto-polling, a filterable Notifications history page (`/notifications`), and deep-linking to record View modals with `403 Forbidden` access-denied protection.

**Architecture:**
1. **Backend (`apps/api/app/Modules/Notifications`)**: Create the `notifications` table and `Notification` model, `NotificationService` (centralized factory for employee and admin notifications across `Reimbursement`, `Cash Advance`, `Liquidation`, and `My Expense`), and `NotificationController` (`GET /api/notifications`, `PATCH /api/notifications/{id}/read`, `POST /api/notifications/read-all`) under `auth.external` middleware with strict ownership verification (`403 Forbidden` if a user attempts to read/mutate another user's notification).
2. **Cross-Module Event Triggers & Scheduled Deadline Checks (`apps/api`)**: Wire `NotificationService` into `ReimbursementService`, `ReceiptService`, `OcrCallbackService`, `CashAdvanceService`, and `LiquidationController` for all employee and admin events (`G2-068`–`G2-070`, `G2-072`), and add `CheckLiquidationDeadlines` (`notifications:check-liquidation-deadlines`) to warn employees when a liquidation is Due Soon (`<= 3` days left) and notify both the employee and all admins once when it becomes Overdue with days overdue and accrued penalty (`G2-071`).
3. **Frontend Store, Top-Bar Dropdown, Notifications Page & Deep-Linking (`apps/web/src`)**: Upgrade `useNotificationStore` (`notification.js`) to fetch from `/api/serms/notifications` and poll every 30 seconds (`G2-073`), refactor `NotificationPanel.vue` into an anchored top-bar bell dropdown (`G2-066`) with a `"View all notifications"` link to `/notifications` (`NotificationsView.vue`, `G2-067`), and add a reusable `useNotificationDeepLink.js` composable (`A-09`) so clicking any notification opens the target record's View modal (`?view={id}`) or displays an access-denied error toast on `403 Forbidden`.

**Tech Stack:** Laravel 13 (PHP 8.3), MySQL 8 / SQLite (in-memory tests), Vue 3 (Composition API, Pinia, Vue Router), Tailwind CSS 3.4, Lucide Vue Next, PHPUnit, Vitest (`@vue/test-utils`).

**Spec:** `docs/Sprint-5.xlsx` (EP 8 - Notifications: `G2-065` through `G2-073`)

## Global Constraints

- **Canonical 9 Modules & Cross-Module Rule:** All notification persistence, controllers, and services live in `App\Modules\Notifications`. Other domain modules (`Reimbursements`, `CashAdvances`, `Liquidations`) call `NotificationService` to record events.
- **Strict Privacy & `403 Forbidden` Enforcement (`G2-073`):** `GET /api/notifications` returns only notifications where `user_id === $request->user()->id`. `PATCH /api/notifications/{id}/read` and record `show` endpoints (`GET /api/reimbursements/{id}`, `GET /api/cash-advances/{id}`, `GET /api/liquidations/{id}`, `GET /api/reimbursements/receipts/{id}`) must return `403 Forbidden` if a user attempts to access another user's notification or record, and the frontend must display an error toast (`"Access denied. You do not have permission to view this record."`).
- **Admin Receiver Resolution (`G2-065`, `G2-070`–`G2-072`):** Admin notifications are created for all users matching `LOWER(TRIM(department)) = 'accounting'` OR `LOWER(TRIM(role)) IN ('admin', 'superadmin', 'finance', 'accounting')`.
- **No Duplicate Trigger on My Expense Forward (`G2-068`):** Do NOT trigger a notification when forwarding a receipt to a draft in `MyExpenseView.vue`; My Expense triggers notifications only on receipt upload, OCR processed/flagged, and OCR auto-rejected, while submitting the reimbursement form triggers the single Reimbursement Submitted notification.
- **Top-Bar Dropdown Only (`G2-066`, `G2-067`):** Render the bell notification list as an anchored top-bar dropdown with `"View all notifications"` routing to `/notifications`. Do NOT add `/notifications` to the left sidebar navigation.
- **Medium Date Format & Currency:** Format all human-readable dates in notification messages and UI using Medium Date Format (`Oct 22, 2026`, `M j, Y`) and display currency in Philippine Pesos (`₱`).
- **Reusability (`A-09`) & Audit Logging:** Centralize deep-link modal opening in `useNotificationDeepLink.js` and log database mutations via `AuditLogService::log()`.

---

## File Map

| Action | File Path | Responsibility |
| --- | --- | --- |
| Create | `apps/api/app/Modules/Notifications/Database/Migrations/2026_10_22_000001_create_notifications_table.php` | Create `notifications` table (`user_id`, `type`, `module`, `title`, `message`, `record_type`, `record_id`, `record_link`, `is_read`, `read_at`, `metadata`, timestamps) (`G2-065`) |
| Create | `apps/api/app/Modules/Notifications/Models/Notification.php` | Eloquent model for `notifications` with casts and `user()` relationship (`G2-065`) |
| Create | `apps/api/app/Modules/Notifications/Services/NotificationService.php` | Centralized service to create notifications for a specific user or all admins, with deduplication helpers (`G2-065`, `G2-068`–`G2-072`) |
| Create | `apps/api/app/Modules/Notifications/Http/Controllers/NotificationController.php` | Handle `GET /api/notifications`, `PATCH /api/notifications/{id}/read`, and `POST /api/notifications/read-all` with `403` ownership check (`G2-066`, `G2-067`, `G2-073`) |
| Create | `apps/api/app/Modules/Notifications/routes/api.php` | Register `/api/notifications` endpoints under `auth.external` middleware |
| Modify | `apps/api/app/Modules/Notifications/Providers/NotificationsServiceProvider.php` | Load `Notifications` migrations and routes |
| Create | `apps/api/tests/Feature/NotificationApiTest.php` | Feature tests for `notifications` table, `NotificationService`, filtering, marking read, and `403` privacy rules (`G2-065`, `G2-067`, `G2-073`) |
| Modify | `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php` | Trigger employee & admin notifications on submit, approve, reject/revise, cancel, grant, acknowledge payout, admin notes, and employee resubmit/comment (`G2-068`–`G2-070`, `G2-072`) |
| Modify | `apps/api/app/Modules/Reimbursements/Services/ReceiptService.php` | Trigger notifications on My Expense receipt upload, admin review notes/status update, and employee receipt resubmit (`G2-068`, `G2-069`, `G2-072`) |
| Modify | `apps/api/app/Modules/Reimbursements/Services/OcrCallbackService.php` | Trigger employee notification when OCR finishes (`processed`/`flagged` or auto-`rejected`) (`G2-068`) |
| Modify | `apps/api/app/Modules/CashAdvances/Services/CashAdvanceService.php` | Trigger employee & admin notifications on submit, approve, reject/revise, disburse, acknowledge/sign, and employee update/resubmit (`G2-068`–`G2-070`, `G2-072`) |
| Modify | `apps/api/app/Modules/Liquidations/Http/Controllers/LiquidationController.php` | Trigger employee & admin notifications on submit, audit (approve/liquidated, revise, reject, admin_note), and employee update/resubmit (`G2-068`–`G2-070`, `G2-072`) |
| Create | `apps/api/tests/Feature/NotificationTriggersTest.php` | Feature tests verifying employee and admin notifications across Reimbursements, My Expense, Cash Advances, and Liquidations (`G2-068`–`G2-070`, `G2-072`) |
| Create | `apps/api/app/Console/Commands/CheckLiquidationDeadlines.php` | Daily scheduled command (`notifications:check-liquidation-deadlines`) for Due Soon (`<= 3` days) and Overdue liquidations (`G2-071`) |
| Modify | `apps/api/app/Console/Commands/ComputeDailyPenalties.php` | Invoke `notifications:check-liquidation-deadlines` after daily penalty calculation so overdue alerts include updated penalties (`G2-071`) |
| Modify | `apps/api/routes/console.php` | Schedule `notifications:check-liquidation-deadlines` daily (`G2-071`) |
| Create | `apps/api/tests/Feature/LiquidationDeadlineNotificationTest.php` | Feature tests for Due Soon warning, Overdue employee + admin alerts, settled exclusion, and single-send deduplication (`G2-071`) |
| Modify | `apps/web/src/stores/notification.js` | API-backed Pinia store (`fetchNotifications`, `markRead`, `markAllRead`, `startPolling`, `stopPolling`, `unreadCount`, `403` toast handling) (`G2-066`, `G2-067`, `G2-073`) |
| Modify | `apps/web/src/components/base/NotificationPanel.vue` | Anchored top-bar dropdown modal showing latest notifications, unread highlight, `"Mark all as read"`, record click navigation, and `"View all notifications"` link (`G2-066`) |
| Modify | `apps/web/src/layouts/AppLayout.vue` | Anchor `NotificationPanel` in top bar, bind `notif.unreadCount`, and start/stop 30s polling (`G2-066`, `G2-073`) |
| Create | `apps/web/src/stores/notification.test.js` | Unit tests for `useNotificationStore` API calls, 30s polling, and `403` error handling (`G2-066`, `G2-073`) |
| Create | `apps/web/src/components/base/NotificationPanel.test.js` | Unit tests for bell dropdown rendering, unread badge, mark read, and `"View all notifications"` navigation (`G2-066`) |
| Create | `apps/web/src/composables/useNotificationDeepLink.js` | Reusable composable (`A-09`) that watches `route.query.view` (and `route.query.advance`), fetches/verifies record access, opens the View modal, or triggers a `403` access-denied toast (`G2-065`–`G2-067`, `G2-070`, `G2-072`, `G2-073`) |
| Create | `apps/web/src/views/NotificationsView.vue` | Full Notifications page (`/notifications`) with module/unread filters (`All`, `Unread`, `Reimbursements`, `Cash Advances`, `Liquidations`, `My Expense`), `Mark as read`, `Mark all as read`, and deep-link navigation (`G2-067`) |
| Modify | `apps/web/src/router/index.js` | Register `/notifications` route (`NotificationsView.vue`) (`G2-067`) |
| Modify | `apps/web/src/views/ReimbursementsView.vue` | Integrate `useNotificationDeepLink` to open `ReimbursementDetailsModal` on `?view={id}` (`G2-066`, `G2-067`, `G2-073`) |
| Modify | `apps/web/src/views/CashAdvancesView.vue` | Integrate `useNotificationDeepLink` to open `CashAdvanceDetailsModal` on `?view={id}` (`G2-066`, `G2-067`, `G2-073`) |
| Modify | `apps/web/src/views/LiquidationsView.vue` | Integrate `useNotificationDeepLink` to open `LiquidationReviewModal` (admin) or `LiquidationSettlementForm` view modal (employee) on `?view={id}` / `?advance={id}` (`G2-066`, `G2-067`, `G2-071`, `G2-073`) |
| Modify | `apps/web/src/views/MyExpenseView.vue` | Integrate `useNotificationDeepLink` to open `ReceiptViewModal` on `?view={id}` (`G2-066`, `G2-067`, `G2-073`) |
| Modify | `apps/web/src/views/PayoutView.vue` | Integrate `useNotificationDeepLink` to open `PayoutDetailsModal` on `?view={id}` (`G2-066`, `G2-067`, `G2-073`) |
| Create | `apps/web/src/views/NotificationsView.test.js` | Unit tests for `NotificationsView.vue` filters, mark read/all read, and record navigation (`G2-067`) |
| Create | `apps/web/src/composables/useNotificationDeepLink.test.js` | Unit tests for deep-link modal opening and `403 Forbidden` access-denied toast (`G2-073`) |

---

### Task 1: Backend `notifications` Table, `Notification` Model, `NotificationService`, Controller & Privacy Guards (`G2-065`, `G2-067`, `G2-073`)

**Files:**
- Create: `apps/api/app/Modules/Notifications/Database/Migrations/2026_10_22_000001_create_notifications_table.php`
- Create: `apps/api/app/Modules/Notifications/Models/Notification.php`
- Create: `apps/api/app/Modules/Notifications/Services/NotificationService.php`
- Create: `apps/api/app/Modules/Notifications/Http/Controllers/NotificationController.php`
- Create: `apps/api/app/Modules/Notifications/routes/api.php`
- Modify: `apps/api/app/Modules/Notifications/Providers/NotificationsServiceProvider.php`
- Create: `apps/api/tests/Feature/NotificationApiTest.php`

**Interfaces:**
- Produces:
  - `NotificationService::notifyUser(int $userId, string $type, string $module, string $title, string $message, string $recordLink, ?string $recordType = null, ?int $recordId = null, array $metadata = []): Notification`
  - `NotificationService::notifyAdmins(string $type, string $module, string $title, string $message, string $recordLink, ?string $recordType = null, ?int $recordId = null, array $metadata = [], ?int $excludeUserId = null): \Illuminate\Support\Collection`
  - `NotificationService::notifyOnce(int $userId, string $type, string $module, string $title, string $message, string $recordLink, string $recordType, int $recordId, array $metadata = []): ?Notification`
  - `GET /api/notifications` (supports optional `?module=`, `?unread=1`, `?limit=`) → `{ data: Notification[], unread_count: int }`
  - `PATCH /api/notifications/{id}/read` → `{ message: string, data: Notification, unread_count: int }` (`403 Forbidden` if notification belongs to another user)
  - `POST /api/notifications/read-all` → `{ message: string, unread_count: 0 }`

- [ ] **Step 1: Write the failing backend feature test in `apps/api/tests/Feature/NotificationApiTest.php`**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Notifications\Models\Notification;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $otherEmployee;
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

        $this->otherEmployee = User::create([
            'name' => 'Pedro Penduko',
            'email' => 'pedro@sbsi.com',
            'role' => 'employee',
            'department' => 'Sales',
        ]);

        $this->admin = User::create([
            'name' => 'Maria Santos',
            'email' => 'maria@sbsi.com',
            'role' => 'admin',
            'department' => 'Accounting',
        ]);
    }

    public function test_notification_service_creates_unread_notification_for_user_and_admins(): void
    {
        $empNotif = NotificationService::notifyUser(
            userId: $this->employee->id,
            type: 'reimbursement_submitted',
            module: 'Reimbursement',
            title: 'Reimbursement Submitted',
            message: 'Your reimbursement of ₱4,500.10 was submitted.',
            recordLink: '/reimbursements?view=10',
            recordType: 'reimbursement',
            recordId: 10
        );

        $this->assertDatabaseHas('notifications', [
            'id' => $empNotif->id,
            'user_id' => $this->employee->id,
            'module' => 'Reimbursement',
            'record_link' => '/reimbursements?view=10',
            'is_read' => false,
        ]);

        $adminNotifs = NotificationService::notifyAdmins(
            type: 'admin_reimbursement_submitted',
            module: 'Reimbursement',
            title: 'New Reimbursement Request',
            message: 'Juan Dela Cruz submitted a reimbursement request of ₱4,500.10.',
            recordLink: '/reimbursements?view=10',
            recordType: 'reimbursement',
            recordId: 10
        );

        $this->assertCount(1, $adminNotifs);
        $this->assertEquals($this->admin->id, $adminNotifs->first()->user_id);
    }

    public function test_user_only_sees_own_notifications_newest_first_with_filters(): void
    {
        $older = NotificationService::notifyUser(
            userId: $this->employee->id,
            type: 'cash_advance_submitted',
            module: 'Cash Advance',
            title: 'Cash Advance Submitted',
            message: 'Your cash advance of ₱10,000.00 was submitted.',
            recordLink: '/cash-advances?view=1',
            recordType: 'cash_advance',
            recordId: 1
        );
        $older->forceFill(['created_at' => now()->subMinutes(10)])->save();

        $newer = NotificationService::notifyUser(
            userId: $this->employee->id,
            type: 'reimbursement_approved',
            module: 'Reimbursement',
            title: 'Reimbursement Approved',
            message: 'Your reimbursement of ₱2,500.00 was approved.',
            recordLink: '/reimbursements?view=2',
            recordType: 'reimbursement',
            recordId: 2
        );

        NotificationService::notifyUser(
            userId: $this->otherEmployee->id,
            type: 'reimbursement_submitted',
            module: 'Reimbursement',
            title: 'Other Employee Notification',
            message: 'Should never be visible to Juan.',
            recordLink: '/reimbursements?view=99',
            recordType: 'reimbursement',
            recordId: 99
        );

        $response = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->getJson('/api/notifications');

        $response->assertOk()
            ->assertJsonPath('unread_count', 2)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $newer->id)
            ->assertJsonPath('data.1.id', $older->id);

        // Filter by module
        $filtered = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->getJson('/api/notifications?module=Cash Advance');

        $filtered->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $older->id);
    }

    public function test_marking_notification_read_and_403_when_accessing_other_users_notification(): void
    {
        $own = NotificationService::notifyUser(
            userId: $this->employee->id,
            type: 'reimbursement_submitted',
            module: 'Reimbursement',
            title: 'Reimbursement Submitted',
            message: 'Your reimbursement was submitted.',
            recordLink: '/reimbursements?view=5',
            recordType: 'reimbursement',
            recordId: 5
        );

        $other = NotificationService::notifyUser(
            userId: $this->otherEmployee->id,
            type: 'reimbursement_submitted',
            module: 'Reimbursement',
            title: 'Other Submitted',
            message: 'Other message.',
            recordLink: '/reimbursements?view=6',
            recordType: 'reimbursement',
            recordId: 6
        );

        // Forbidden when trying to mark another user's notification as read
        $forbidden = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->patchJson("/api/notifications/{$other->id}/read");

        $forbidden->assertStatus(403);

        // Allowed for own notification
        $ok = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->patchJson("/api/notifications/{$own->id}/read");

        $ok->assertOk()
            ->assertJsonPath('data.is_read', true)
            ->assertJsonPath('unread_count', 0);
    }

    public function test_mark_all_as_read_marks_only_current_users_notifications(): void
    {
        NotificationService::notifyUser(
            userId: $this->employee->id,
            type: 'reimbursement_submitted',
            module: 'Reimbursement',
            title: 'First',
            message: 'First msg',
            recordLink: '/reimbursements?view=1'
        );
        $other = NotificationService::notifyUser(
            userId: $this->otherEmployee->id,
            type: 'reimbursement_submitted',
            module: 'Reimbursement',
            title: 'Other',
            message: 'Other msg',
            recordLink: '/reimbursements?view=2'
        );

        $res = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->postJson('/api/notifications/read-all');

        $res->assertOk()->assertJsonPath('unread_count', 0);
        $this->assertFalse((bool) $other->fresh()->is_read);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=NotificationApiTest` (in `apps/api`)
Expected: FAIL (`Class "App\Modules\Notifications\Models\Notification" not found`)

- [ ] **Step 3: Create migration, `Notification` model, `NotificationService`, `NotificationController`, `routes/api.php`, and update `NotificationsServiceProvider`**

Create `apps/api/app/Modules/Notifications/Database/Migrations/2026_10_22_000001_create_notifications_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('notifications')) {
            Schema::create('notifications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('type', 100)->index();
                $table->string('module', 60)->index();
                $table->string('title');
                $table->text('message');
                $table->string('record_type', 60)->nullable()->index();
                $table->unsignedBigInteger('record_id')->nullable()->index();
                $table->string('record_link');
                $table->boolean('is_read')->default(false)->index();
                $table->timestamp('read_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'is_read', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
```

Create `apps/api/app/Modules/Notifications/Models/Notification.php`:

```php
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
```

Create `apps/api/app/Modules/Notifications/Services/NotificationService.php`:

```php
<?php

namespace App\Modules\Notifications\Services;

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
     * Create a single unread notification for a target user.
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
            return Notification::create([
                'user_id' => $userId,
                'type' => $type,
                'module' => $module,
                'title' => $title,
                'message' => $message,
                'record_type' => $recordType,
                'record_id' => $recordId,
                'record_link' => $recordLink,
                'is_read' => false,
                'metadata' => !empty($metadata) ? $metadata : null,
            ]);
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
     * notification does not already exist. Used by daily deadline/overdue checks (G2-071).
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

Create `apps/api/app/Modules/Notifications/Http/Controllers/NotificationController.php`:

```php
<?php

namespace App\Modules\Notifications\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Notifications\Models\Notification;
use App\Modules\AuditLogs\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificationController extends Controller
{
    private function normalizeModuleFilter(?string $module): ?string
    {
        if (!$module) {
            return null;
        }

        $clean = strtolower(trim($module));
        return match ($clean) {
            'reimbursement', 'reimbursements' => 'Reimbursement',
            'cash advance', 'cash advances', 'cash-advance', 'cash-advances', 'cash_advance' => 'Cash Advance',
            'liquidation', 'liquidations' => 'Liquidation',
            'my expense', 'my expenses', 'my-expense', 'expense', 'expenses' => 'My Expense',
            default => null,
        };
    }

    /**
     * List authenticated user's notifications from newest to oldest.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        if ($request->filled('user_id') && (int) $request->query('user_id') !== (int) $user->id) {
            return response()->json([
                'message' => 'Forbidden. You cannot view another user\'s notifications.',
            ], 403);
        }

        $query = Notification::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        $moduleFilter = $this->normalizeModuleFilter($request->query('module'));
        if ($moduleFilter) {
            $query->where('module', $moduleFilter);
        }

        if ($request->boolean('unread') || strtolower((string) $request->query('filter')) === 'unread') {
            $query->where('is_read', false);
        }

        $limit = $request->query('limit');
        if ($limit !== null && is_numeric($limit)) {
            $query->limit(max(1, min((int) $limit, 200)));
        }

        $notifications = $query->get();

        $unreadCount = Notification::query()
            ->where('user_id', $user->id)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'data' => $notifications,
            'unread_count' => $unreadCount,
        ]);
    }

    /**
     * Mark a single notification as read. Returns 403 if owned by another user.
     */
    public function markRead(Request $request, int $id)
    {
        $user = $request->user();
        $notification = Notification::findOrFail($id);

        if ((int) $notification->user_id !== (int) $user->id) {
            return response()->json([
                'message' => 'Forbidden. You cannot access or modify another user\'s notification.',
            ], 403);
        }

        if (!$notification->is_read) {
            DB::transaction(function () use ($notification, $user, $request) {
                $before = $notification->toArray();
                $notification->update([
                    'is_read' => true,
                    'read_at' => now(),
                ]);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) ($user->role ?? 'employee'),
                    actionType: 'NOTIFICATION_READ',
                    entityType: 'notification',
                    entityId: $notification->id,
                    beforeState: $before,
                    afterState: $notification->fresh()->toArray(),
                    ipAddress: $request->ip()
                );
            });
        }

        $unreadCount = Notification::query()
            ->where('user_id', $user->id)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'message' => 'Notification marked as read.',
            'data' => $notification->fresh(),
            'unread_count' => $unreadCount,
        ]);
    }

    /**
     * Mark all unread notifications for the authenticated user as read.
     */
    public function markAllRead(Request $request)
    {
        $user = $request->user();

        DB::transaction(function () use ($user, $request) {
            $updatedCount = Notification::query()
                ->where('user_id', $user->id)
                ->where('is_read', false)
                ->update([
                    'is_read' => true,
                    'read_at' => now(),
                    'updated_at' => now(),
                ]);

            if ($updatedCount > 0) {
                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) ($user->role ?? 'employee'),
                    actionType: 'NOTIFICATIONS_MARKED_ALL_READ',
                    entityType: 'notification',
                    entityId: $user->id,
                    beforeState: ['unread_updated' => $updatedCount],
                    afterState: ['unread_count' => 0],
                    ipAddress: $request->ip()
                );
            }
        });

        return response()->json([
            'message' => 'All notifications marked as read.',
            'unread_count' => 0,
        ]);
    }
}
```

Create `apps/api/app/Modules/Notifications/routes/api.php`:

```php
<?php

use Illuminate\Support\Facades\Route;
use App\Modules\Notifications\Http\Controllers\NotificationController;

Route::middleware('auth.external')->group(function () {
    Route::get('/', [NotificationController::class, 'index']);
    Route::post('/read-all', [NotificationController::class, 'markAllRead']);
    Route::patch('/{id}/read', [NotificationController::class, 'markRead']);
});
```

Modify `apps/api/app/Modules/Notifications/Providers/NotificationsServiceProvider.php`:

```php
<?php

namespace App\Modules\Notifications\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Route;

class NotificationsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $migrationPath = __DIR__ . '/../Database/Migrations';
        if (is_dir($migrationPath)) {
            $this->loadMigrationsFrom($migrationPath);
        }

        $routeFile = __DIR__ . '/../routes/api.php';
        if (file_exists($routeFile)) {
            Route::middleware('api')
                ->prefix('api/notifications')
                ->group($routeFile);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=NotificationApiTest` (in `apps/api`)
Expected: PASS (4 tests, all assertions passing)

---

### Task 2: Cross-Module Event Triggers for Reimbursements, My Expense, Cash Advances, and Liquidations (`G2-065`, `G2-068`, `G2-069`, `G2-070`, `G2-072`)

**Files:**
- Modify: `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php`
- Modify: `apps/api/app/Modules/Reimbursements/Services/ReceiptService.php`
- Modify: `apps/api/app/Modules/Reimbursements/Services/OcrCallbackService.php`
- Modify: `apps/api/app/Modules/CashAdvances/Services/CashAdvanceService.php`
- Modify: `apps/api/app/Modules/Liquidations/Http/Controllers/LiquidationController.php`
- Create: `apps/api/tests/Feature/NotificationTriggersTest.php`

**Interfaces:**
- Consumes: `NotificationService::notifyUser()`, `NotificationService::notifyAdmins()`, `NotificationService::formatPeso()`
- Produces notifications for:
  - **Employee self-confirmation (`G2-068`):**
    - Submit Reimbursement (`module: 'Reimbursement'`, `record_link: "/reimbursements?view={$id}"`)
    - Submit Cash Advance (`module: 'Cash Advance'`, `record_link: "/cash-advances?view={$id}"`)
    - Submit Liquidation (`module: 'Liquidation'`, `record_link: "/liquidations?view={$id}"`)
    - Upload My Expense receipt (`module: 'My Expense'`, `record_link: "/my-expense?view={$id}"`)
    - OCR Processed / Flagged / Auto-Rejected My Expense receipt (`module: 'My Expense'`, `record_link: "/my-expense?view={$id}"`)
    - Sign to acknowledge Payout (`module: 'Reimbursement'`, `record_link: "/payout?view={$id}"`)
  - **Employee notified on Admin actions (`G2-069`):**
    - Reimbursement Approved, Rejected, Revised, Cancelled, Granted, or Admin Comment/Notes (`module: 'Reimbursement'`, `record_link: "/reimbursements?view={$id}"`)
    - Cash Advance Approved, Rejected, Revised, Cancelled, Disbursed, or Admin Comment/Notes (`module: 'Cash Advance'`, `record_link: "/cash-advances?view={$id}"`)
    - Liquidation Approved/Settled (`liquidated`), Revised, Rejected, Cancelled, or Admin Comment/Notes (`module: 'Liquidation'`, `record_link: "/liquidations?view={$id}"`)
    - Receipt Admin Notes / Review Decision (`module: 'My Expense'`, `record_link: "/my-expense?view={$id}"`)
  - **Admins notified on Employee new requests (`G2-070`) & follow-ups (`G2-072`):**
    - New Reimbursement, Cash Advance, or Liquidation submitted (includes employee name, amount, and link to record View modal)
    - Employee adds comment/note on Reimbursement or shortfall explanation/note on Liquidation
    - Employee signs/acknowledges Payout (`/payout?view={$id}`) or Cash Advance (`/cash-advances?view={$id}`)
    - Employee updates/resubmits a Reimbursement, Cash Advance, Liquidation, or Receipt after revision, or uploads a new receipt/document

- [ ] **Step 1: Write the failing feature tests in `apps/api/tests/Feature/NotificationTriggersTest.php`**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Services\ReimbursementService;
use App\Modules\Reimbursements\Services\OcrCallbackService;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Services\CashAdvanceService;
use App\Modules\Notifications\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;

class NotificationTriggersTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;
    private ExpenseCategory $category;

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

        $this->category = ExpenseCategory::create([
            'name' => 'Meals',
            'description' => 'Meals and refreshments',
        ]);
    }

    public function test_reimbursement_lifecycle_triggers_employee_and_admin_notifications(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/r1.jpg'],
            'file_hash' => ['hash1'],
            'file_type' => ['jpeg'],
            'file_size_bytes' => [1024],
            'expense_category_id' => $this->category->id,
            'vendor_name' => 'Jollibee',
            'transaction_date' => '2026-10-20',
            'total_amount' => 4500.10,
            'status' => 'processed',
        ]);

        $service = app(ReimbursementService::class);

        // 1. Employee submits reimbursement (with user_comment)
        $reimbursement = $service->storeReimbursement($this->employee, [
            'description' => 'Client lunch meeting',
            'user_comment' => 'Urgent client visit in Makati',
            'expense_category_id' => $this->category->id,
            'amount' => 4500.10,
            'date' => '2026-10-20',
            'cutoff_period' => 'Oct 16 - Oct 31, 2026',
            'receipt_ids' => [$receipt->id],
        ], null);

        // Employee gets submission confirmation (G2-068)
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_submitted',
            'module' => 'Reimbursement',
            'record_link' => "/reimbursements?view={$reimbursement->id}",
        ]);

        // Admin gets new request notification (G2-070) + employee note notification (G2-072)
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_reimbursement_submitted',
            'module' => 'Reimbursement',
            'record_link' => "/reimbursements?view={$reimbursement->id}",
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_employee_note_added',
            'module' => 'Reimbursement',
        ]);

        // 2. Admin requests revision (G2-069)
        $req = Request::create('/api/reimbursements/' . $reimbursement->id . '/reject', 'POST');
        $service->rejectReimbursement($this->admin, $reimbursement->id, 'Please attach itemized slip.', null, '127.0.0.1', $req, 'revise');

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_revised',
            'module' => 'Reimbursement',
        ]);

        // 3. Employee resubmits after revision (G2-072)
        $service->updateReimbursement($this->employee, $reimbursement->id, [
            'description' => 'Client lunch meeting updated',
            'user_comment' => 'Attached updated slip',
        ], false);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_reimbursement_resubmitted',
            'module' => 'Reimbursement',
        ]);

        // 4. Admin approves and grants (G2-069)
        $service->approveReimbursement($this->admin, $reimbursement->id, null, '127.0.0.1', $req);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_approved',
            'module' => 'Reimbursement',
        ]);

        $service->grantReimbursement($this->admin, $reimbursement->id, null, '127.0.0.1', $req, [
            'granted_by' => $this->admin->name,
            'payout_method' => 'Cash',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_granted',
            'module' => 'Reimbursement',
        ]);

        // 5. Employee signs to acknowledge payout (G2-068 Task 4 & G2-072 Task 2)
        $service->acknowledgePayout($this->employee, $reimbursement->id, 'data:image/png;base64,sig', '127.0.0.1');
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'payout_acknowledged',
            'module' => 'Reimbursement',
            'record_link' => "/payout?view={$reimbursement->id}",
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_payout_signed',
            'module' => 'Reimbursement',
            'record_link' => "/payout?view={$reimbursement->id}",
        ]);
    }

    public function test_ocr_callback_notifies_employee_when_receipt_processed_or_auto_rejected(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/ocr1.jpg'],
            'file_hash' => ['hash_ocr1'],
            'file_type' => ['jpeg'],
            'file_size_bytes' => [1024],
            'status' => 'processing',
        ]);

        $ocrService = app(OcrCallbackService::class);
        $ocrService->handle($receipt->id, [
            'vendor_name' => 'Mercury Drug',
            'total_amount' => 850.00,
            'ocr_confidence_score' => 0.92,
            'status' => 'processed',
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'receipt_processed',
            'module' => 'My Expense',
            'record_link' => "/my-expense?view={$receipt->id}",
        ]);

        $badReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/ocr2.jpg'],
            'file_hash' => ['hash_ocr2'],
            'file_type' => ['jpeg'],
            'file_size_bytes' => [1024],
            'status' => 'processing',
        ]);

        $ocrService->handle($badReceipt->id, [
            'status' => 'rejected',
            'rejection_code' => 'blurry',
            'rejection_reason' => 'Image is too blurry to read.',
            'ocr_confidence_score' => 0.15,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'receipt_auto_rejected',
            'module' => 'My Expense',
            'record_link' => "/my-expense?view={$badReceipt->id}",
        ]);
    }

    public function test_cash_advance_and_liquidation_lifecycle_notifications(): void
    {
        $caService = app(CashAdvanceService::class);

        // Employee submits cash advance (G2-068 & G2-070)
        $advance = $caService->createAdvance($this->employee, [
            'purpose' => 'Regional Lab Calibration',
            'amount' => 12000.00,
            'expected_disbursement_date' => '2026-10-25',
            'expected_liquidation_date' => '2026-11-05',
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'cash_advance_submitted',
            'module' => 'Cash Advance',
            'record_link' => "/cash-advances?view={$advance->id}",
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_cash_advance_submitted',
            'module' => 'Cash Advance',
            'record_link' => "/cash-advances?view={$advance->id}",
        ]);

        // Employee signs cash advance (G2-072 Task 2)
        $advance->update(['status' => 'disbursed']);
        $caService->acknowledgeAdvance($advance, ['signature' => 'data:image/png;base64,casig']);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_cash_advance_signed',
            'module' => 'Cash Advance',
            'record_link' => "/cash-advances?view={$advance->id}",
        ]);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=NotificationTriggersTest` (in `apps/api`)
Expected: FAIL (`Failed asserting that a row in the table [notifications] matches the attributes`)

- [ ] **Step 3: Add `NotificationService` calls in `ReimbursementService`, `ReceiptService`, `OcrCallbackService`, `CashAdvanceService`, and `LiquidationController`**

1. In `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php`:
   - Import `App\Modules\Notifications\Services\NotificationService;`
   - In `storeReimbursement()` (before `return $reimbursement->load('receipts');`):
     ```php
     $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
     $link = "/reimbursements?view={$reimbursement->id}";

     NotificationService::notifyUser(
         userId: $user->id,
         type: 'reimbursement_submitted',
         module: 'Reimbursement',
         title: 'Reimbursement Submitted',
         message: "Your reimbursement of {$formattedAmount} was submitted.",
         recordLink: $link,
         recordType: 'reimbursement',
         recordId: $reimbursement->id
     );

     NotificationService::notifyAdmins(
         type: 'admin_reimbursement_submitted',
         module: 'Reimbursement',
         title: 'New Reimbursement Request',
         message: "{$user->name} submitted a reimbursement request of {$formattedAmount}.",
         recordLink: $link,
         recordType: 'reimbursement',
         recordId: $reimbursement->id,
         excludeUserId: $user->id
     );

     if (!empty($reimbursement->user_comment)) {
         NotificationService::notifyAdmins(
             type: 'admin_employee_note_added',
             module: 'Reimbursement',
             title: 'Employee Note on Reimbursement',
             message: "{$user->name} left a note on Reimbursement #{$reimbursement->id}: \"{$reimbursement->user_comment}\"",
             recordLink: $link,
             recordType: 'reimbursement',
             recordId: $reimbursement->id,
             excludeUserId: $user->id
         );
     }
     ```
   - In `approveReimbursement()`:
     ```php
     $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
     NotificationService::notifyUser(
         userId: $reimbursement->user_id,
         type: 'reimbursement_approved',
         module: 'Reimbursement',
         title: 'Reimbursement Approved',
         message: "Your reimbursement of {$formattedAmount} was approved by {$user->name}.",
         recordLink: "/reimbursements?view={$reimbursement->id}",
         recordType: 'reimbursement',
         recordId: $reimbursement->id
     );
     ```
   - In `rejectReimbursement()`:
     ```php
     $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
     $statusType = $isTerminal ? 'reimbursement_rejected' : 'reimbursement_revised';
     $statusTitle = $isTerminal ? 'Reimbursement Rejected' : 'Reimbursement Needs Revision';
     $statusVerb = $isTerminal ? 'rejected' : 'returned for revision';

     NotificationService::notifyUser(
         userId: $reimbursement->user_id,
         type: $statusType,
         module: 'Reimbursement',
         title: $statusTitle,
         message: "Your reimbursement of {$formattedAmount} was {$statusVerb}. Admin comment: \"{$comment}\"",
         recordLink: "/reimbursements?view={$reimbursement->id}",
         recordType: 'reimbursement',
         recordId: $reimbursement->id
     );
     ```
   - In `grantReimbursement()`:
     ```php
     $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
     NotificationService::notifyUser(
         userId: $reimbursement->user_id,
         type: 'reimbursement_granted',
         module: 'Reimbursement',
         title: 'Reimbursement Granted',
         message: "Your reimbursement of {$formattedAmount} has been granted ({$payoutMethod}). Please sign to acknowledge receipt.",
         recordLink: "/reimbursements?view={$reimbursement->id}",
         recordType: 'reimbursement',
         recordId: $reimbursement->id
     );
     ```
   - In `acknowledgePayout()`:
     ```php
     $formattedAmount = NotificationService::formatPeso($reimbursement->amount);
     $payoutLink = "/payout?view={$reimbursement->id}";

     NotificationService::notifyUser(
         userId: $user->id,
         type: 'payout_acknowledged',
         module: 'Reimbursement',
         title: 'Payout Acknowledged',
         message: "You signed to acknowledge your payout of {$formattedAmount} for Reimbursement #{$reimbursement->id}.",
         recordLink: $payoutLink,
         recordType: 'reimbursement',
         recordId: $reimbursement->id
     );

     NotificationService::notifyAdmins(
         type: 'admin_payout_signed',
         module: 'Reimbursement',
         title: 'Employee Signed Payout',
         message: "{$user->name} signed to acknowledge payout of {$formattedAmount} for Reimbursement #{$reimbursement->id}.",
         recordLink: $payoutLink,
         recordType: 'reimbursement',
         recordId: $reimbursement->id,
         excludeUserId: $user->id
     );
     ```
   - In `updateReimbursement()`:
     - In admin branch (`if ($canManage && ($user->id !== $reimbursement->user_id))`):
       - If `!empty($data['admin_notes'])`, notify employee with `type: 'reimbursement_admin_note'`, showing the note text.
       - If `!empty($data['status']) && $data['status'] === 'cancelled'`, notify employee with `type: 'reimbursement_cancelled'`.
     - In employee self-edit branch (after `$reimbursement->update($updatePayload)`):
       - Track `$wasRevise = $reimbursement->status === 'revise'` and `$previousComment = $reimbursement->user_comment` before `$reimbursement->update($updatePayload)`.
       - If `$wasRevise` or `$reportFile !== null`, notify admins with `type: 'admin_reimbursement_resubmitted'`, `title: 'Reimbursement Resubmitted'`, `message: "{$user->name} updated and resubmitted Reimbursement #{$reimbursement->id} (" . NotificationService::formatPeso($reimbursement->amount) . ")."`.
       - If `!empty($data['user_comment']) && $data['user_comment'] !== $previousComment`, notify admins with `type: 'admin_employee_note_added'`, `message: "{$user->name} added a comment on Reimbursement #{$reimbursement->id}: \"{$data['user_comment']}\""`.

2. In `apps/api/app/Modules/Reimbursements/Services/ReceiptService.php` & `OcrCallbackService.php`:
   - In `ReceiptService::storeReceipt()` (before returning `$receipt` in both mock and non-mock branches):
     ```php
     $amountText = $receipt->total_amount ? ' (' . NotificationService::formatPeso($receipt->total_amount) . ')' : '';
     NotificationService::notifyUser(
         userId: $user->id,
         type: $isMock ? 'receipt_processed' : 'receipt_uploaded',
         module: 'My Expense',
         title: $isMock ? 'Receipt Processed' : 'Receipt Uploaded',
         message: $isMock
             ? "Your My Expense receipt #{$receipt->id}{$amountText} was uploaded and processed."
             : "Your My Expense receipt #{$receipt->id} was uploaded and sent for OCR processing.",
         recordLink: "/my-expense?view={$receipt->id}",
         recordType: 'receipt',
         recordId: $receipt->id
     );

     NotificationService::notifyAdmins(
         type: 'admin_receipt_uploaded',
         module: 'My Expense',
         title: 'New Receipt Uploaded',
         message: "{$user->name} uploaded a new receipt #{$receipt->id}{$amountText}.",
         recordLink: "/my-expense?view={$receipt->id}",
         recordType: 'receipt',
         recordId: $receipt->id,
         excludeUserId: $user->id
     );
     ```
   - In `ReceiptService::updateReceipt()`:
     - When `$canManage && $receipt->uploaded_by !== $user->id`:
       - If `!empty($updateData['admin_notes'])`, notify `$receipt->uploaded_by` (`type: 'receipt_admin_note'`, `module: 'My Expense'`, message includes admin note text).
       - If `!empty($updateData['status'])`, notify `$receipt->uploaded_by` (`type: "receipt_{$updateData['status']}"`, `module: 'My Expense'`).
   - In `ReceiptService::resubmitReceipt()`:
     - Notify admins (`type: 'admin_receipt_resubmitted'`, `module: 'My Expense'`, `recordLink: "/my-expense?view={$receipt->id}"`, message: `"{$user->name} updated/resubmitted Receipt #{$receipt->id}."`).
   - In `OcrCallbackService::handle()` (after `AuditLogService::log()`):
     ```php
     $amountText = $receipt->total_amount ? ' of ' . NotificationService::formatPeso($receipt->total_amount) : '';
     if ($isRejected) {
         $reasonText = $rejectionReason ? " Reason: {$rejectionReason}" : '';
         NotificationService::notifyUser(
             userId: (int) $receipt->uploaded_by,
             type: 'receipt_auto_rejected',
             module: 'My Expense',
             title: 'Receipt Auto-Rejected',
             message: "Your My Expense receipt #{$receipt->id}{$amountText} was automatically rejected.{$reasonText}",
             recordLink: "/my-expense?view={$receipt->id}",
             recordType: 'receipt',
             recordId: $receipt->id
         );
     } else {
         NotificationService::notifyUser(
             userId: (int) $receipt->uploaded_by,
             type: 'receipt_processed',
             module: 'My Expense',
             title: 'Receipt Processed',
             message: "Your My Expense receipt #{$receipt->id}{$amountText} has been processed.",
             recordLink: "/my-expense?view={$receipt->id}",
             recordType: 'receipt',
             recordId: $receipt->id
         );
     }
     ```

3. In `apps/api/app/Modules/CashAdvances/Services/CashAdvanceService.php`:
   - Import `App\Modules\Notifications\Services\NotificationService;`
   - In `createAdvance()`:
     - Notify employee (`type: 'cash_advance_submitted'`, `module: 'Cash Advance'`, `recordLink: "/cash-advances?view={$advance->id}"`, message: `"Your cash advance request of " . NotificationService::formatPeso($advance->amount) . " was submitted."`)
     - Notify admins (`type: 'admin_cash_advance_submitted'`, `module: 'Cash Advance'`, `recordLink: "/cash-advances?view={$advance->id}"`, message: `"{$user->name} submitted a cash advance request of " . NotificationService::formatPeso($advance->amount) . "."`)
   - In `approveAdvance()`:
     - Notify `$advance->user_id` (`type: 'cash_advance_approved'`, `module: 'Cash Advance'`, `recordLink: "/cash-advances?view={$advance->id}"`, including `$comment` if provided).
   - In `rejectAdvance()`:
     - Notify `$advance->user_id` (`type: $newStatus === 'rejected' ? 'cash_advance_rejected' : 'cash_advance_revised'`, `module: 'Cash Advance'`, `recordLink: "/cash-advances?view={$advance->id}"`, including `$comment`).
   - In `disburseAdvance()`:
     - Notify `$advance->user_id` (`type: 'cash_advance_disbursed'`, `module: 'Cash Advance'`, `recordLink: "/cash-advances?view={$advance->id}"`, message: `"Your cash advance of " . NotificationService::formatPeso($advance->amount) . " was disbursed via {$data['channel']} (Ref: {$data['reference']})."`).
   - In `acknowledgeAdvance()`:
     - Load `$advance->loadMissing('requester')`; `$empName = $advance->requester?->name ?? 'Employee';`
     - Notify admins (`type: 'admin_cash_advance_signed'`, `module: 'Cash Advance'`, `recordLink: "/cash-advances?view={$advance->id}"`, message: `"{$empName} signed to acknowledge Cash Advance #{$advance->id} (" . NotificationService::formatPeso($advance->amount) . ")."`).
   - In `updateAdvance()`:
     - Notify admins (`type: 'admin_cash_advance_resubmitted'`, `module: 'Cash Advance'`, `recordLink: "/cash-advances?view={$advance->id}"`, message: `"{$user->name} updated/resubmitted Cash Advance #{$advance->id} (" . NotificationService::formatPeso($advance->amount) . ")."`).

4. In `apps/api/app/Modules/Liquidations/Http/Controllers/LiquidationController.php`:
   - Import `App\Modules\Notifications\Services\NotificationService;`
   - In `store()`:
     - Notify employee (`type: 'liquidation_submitted'`, `module: 'Liquidation'`, `recordLink: "/liquidations?view={$liquidation->id}"`, message: `"Your liquidation of " . NotificationService::formatPeso($liquidation->total_expense_amount) . " for Cash Advance #{$advance->id} was submitted."`)
     - Notify admins (`type: 'admin_liquidation_submitted'`, `module: 'Liquidation'`, `recordLink: "/liquidations?view={$liquidation->id}"`, message: `"{$user->name} submitted a liquidation of " . NotificationService::formatPeso($liquidation->total_expense_amount) . " for Cash Advance #{$advance->id}."`)
     - If `!empty($liquidation->shortfall_explanation)`, notify admins (`type: 'admin_employee_note_added'`, `module: 'Liquidation'`, `recordLink: "/liquidations?view={$liquidation->id}"`, message: `"{$user->name} added a note on Liquidation #{$liquidation->id}: \"{$liquidation->shortfall_explanation}\""`).
   - In `audit()`:
     - When `approved` (`liquidated`): notify `$liquidation->user_id` (`type: 'liquidation_settled'`, `module: 'Liquidation'`, `recordLink: "/liquidations?view={$liquidation->id}"`, message includes new status and `$validated['admin_note']` if present).
     - When `revise` or `rejected`: notify `$liquidation->user_id` (`type: $isTerminal ? 'liquidation_rejected' : 'liquidation_revised'`, `module: 'Liquidation'`, `recordLink: "/liquidations?view={$liquidation->id}"`, message includes `$validated['admin_note']`).
   - In `update()`:
     - Notify admins (`type: 'admin_liquidation_resubmitted'`, `module: 'Liquidation'`, `recordLink: "/liquidations?view={$liquidation->id}"`, message includes `$liquidation->shortfall_explanation` if present).

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=NotificationTriggersTest` (in `apps/api`)
Expected: PASS

---

### Task 3: Daily Scheduled Liquidation Deadline & Overdue Notification Check (`G2-071`)

**Files:**
- Create: `apps/api/app/Console/Commands/CheckLiquidationDeadlines.php`
- Modify: `apps/api/app/Console/Commands/ComputeDailyPenalties.php`
- Modify: `apps/api/routes/console.php`
- Create: `apps/api/tests/Feature/LiquidationDeadlineNotificationTest.php`

**Interfaces:**
- Consumes: `NotificationService::notifyOnce()`, `NotificationService::notifyAdminsOnce()`, `CashAdvance`, `PenaltyRecord`, `Liquidation`
- Produces:
  - Artisan command `notifications:check-liquidation-deadlines`
  - Due Soon employee warning (`type: 'liquidation_due_soon'`, `record_type: 'cash_advance'`, `record_id: $advance->id`, when `0 <= $daysLeft <= 3`)
  - Overdue employee & admin notification (`type: 'liquidation_overdue'` / `'admin_liquidation_overdue'`, `record_type: 'cash_advance'`, `record_id: $advance->id`, when `$daysOverdue >= 1`, showing employee name, amount, days overdue, and accrued penalty)

- [ ] **Step 1: Write the failing feature test in `apps/api/tests/Feature/LiquidationDeadlineNotificationTest.php`**

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Notifications\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;

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

    public function test_due_soon_and_overdue_notifications_are_created_once_and_skip_settled(): void
    {
        // 1. Due soon (2 days left)
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

        // 2. Overdue (3 days past due)
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

        // 3. Already liquidated/settled (should NEVER be flagged)
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

        // Run penalties:calculate (which calculates penalties and runs deadline notifications)
        Artisan::call('penalties:calculate');

        // Due soon creates 1 warning for employee
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'liquidation_due_soon',
            'record_type' => 'cash_advance',
            'record_id' => $dueSoonAdvance->id,
        ]);

        // Overdue creates 1 notification for employee and 1 for admin with days overdue and penalty (₱150.00)
        $empOverdue = Notification::where('user_id', $this->employee->id)
            ->where('type', 'liquidation_overdue')
            ->where('record_id', $overdueAdvance->id)
            ->first();
        $this->assertNotNull($empOverdue);
        $this->assertStringContainsString('3 days overdue', $empOverdue->message);
        $this->assertStringContainsString('₱150.00', $empOverdue->message);

        $adminOverdue = Notification::where('user_id', $this->admin->id)
            ->where('type', 'admin_liquidation_overdue')
            ->where('record_id', $overdueAdvance->id)
            ->first();
        $this->assertNotNull($adminOverdue);
        $this->assertStringContainsString('Juan Dela Cruz', $adminOverdue->message);
        $this->assertStringContainsString('₱8,000.00', $adminOverdue->message);
        $this->assertStringContainsString('3 days overdue', $adminOverdue->message);
        $this->assertStringContainsString('₱150.00', $adminOverdue->message);

        // Settled advance is never flagged
        $this->assertDatabaseMissing('notifications', [
            'record_type' => 'cash_advance',
            'record_id' => $settledAdvance->id,
        ]);

        // Running a second time does not create duplicate overdue or due-soon notifications
        Artisan::call('notifications:check-liquidation-deadlines');
        $this->assertEquals(1, Notification::where('user_id', $this->admin->id)->where('record_id', $overdueAdvance->id)->count());
        $this->assertEquals(1, Notification::where('user_id', $this->employee->id)->where('record_id', $overdueAdvance->id)->count());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --filter=LiquidationDeadlineNotificationTest` (in `apps/api`)
Expected: FAIL

- [ ] **Step 3: Create `CheckLiquidationDeadlines.php` and wire into `ComputeDailyPenalties.php` and `routes/console.php`**

Create `apps/api/app/Console/Commands/CheckLiquidationDeadlines.php`:

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

    protected $description = 'Send Due Soon (<= 3 days) and Overdue liquidation notifications to employees and admins.';

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

            if ($daysLeft >= 0 && $daysLeft <= 3) {
                // Due Soon warning for employee (G2-071 Task 3)
                $whenLabel = $daysLeft === 0 ? 'due today' : "due in {$daysLeft} " . ($daysLeft === 1 ? 'day' : 'days');
                NotificationService::notifyOnce(
                    userId: (int) $advance->user_id,
                    type: 'liquidation_due_soon',
                    module: 'Liquidation',
                    title: 'Liquidation Due Soon',
                    message: "Your liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is {$whenLabel} ({$formattedDue}).",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'days_left' => $daysLeft,
                        'due_date' => $dueDate->toDateString(),
                    ]
                );
            } elseif ($daysLeft < 0) {
                // Overdue alert for employee and all admins (G2-071 Task 2 & 3)
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
                        'days_overdue' => $daysOverdue,
                        'penalty_amount' => $penaltySum,
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
                        'days_overdue' => $daysOverdue,
                        'penalty_amount' => $penaltySum,
                    ],
                    excludeUserId: (int) $advance->user_id
                );
            }
        }

        return Command::SUCCESS;
    }
}
```

In `apps/api/app/Console/Commands/ComputeDailyPenalties.php`, call `$this->call('notifications:check-liquidation-deadlines');` right before `return Command::SUCCESS;`.
In `apps/api/routes/console.php`, add:
```php
Schedule::command('notifications:check-liquidation-deadlines')->daily();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --filter=LiquidationDeadlineNotificationTest` (in `apps/api`)
Expected: PASS

---

### Task 4: Frontend Notification Pinia Store (`useNotificationStore`), 30s Auto-Polling & Top-Bar Bell Dropdown (`G2-066`, `G2-073`)

**Files:**
- Modify: `apps/web/src/stores/notification.js`
- Modify: `apps/web/src/components/base/NotificationPanel.vue`
- Modify: `apps/web/src/layouts/AppLayout.vue`
- Create: `apps/web/src/stores/notification.test.js`
- Create: `apps/web/src/components/base/NotificationPanel.test.js`

**Interfaces:**
- Produces in `useNotificationStore`:
  - `alerts`: `Ref<Array>` of normalized notifications (`{ id, userId, type, severity, module, title, message, recordType, recordId, recordLink, read, time, createdAt }`)
  - `unreadCount`: `ComputedRef<number>`
  - `isLoading`: `Ref<boolean>`
  - `fetchNotifications(params = {})`: fetches `GET /api/serms/notifications`, updates `alerts` and `serverUnreadCount`, shows error toast on `403`
  - `markRead(id)`: calls `PATCH /api/serms/notifications/${id}/read`, updates state, shows error toast and throws on `403`
  - `markAllRead()`: calls `POST /api/serms/notifications/read-all`, marks all local alerts `read = true`
  - `startPolling(intervalMs = 30000)` & `stopPolling()`

- [ ] **Step 1: Write failing unit tests in `apps/web/src/stores/notification.test.js` and `apps/web/src/components/base/NotificationPanel.test.js`**

Create `apps/web/src/stores/notification.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useNotificationStore } from "./notification";

const mockApiFetch = vi.fn();
const mockAddToast = vi.fn();

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

describe("useNotificationStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches notifications and computes unreadCount", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        unread_count: 1,
        data: [
          {
            id: 10,
            user_id: 1,
            type: "reimbursement_submitted",
            module: "Reimbursement",
            title: "Reimbursement Submitted",
            message: "Your reimbursement of ₱4,500.10 was submitted.",
            record_link: "/reimbursements?view=5",
            is_read: false,
            created_at: "2026-10-22T10:00:00Z",
          },
        ],
      }),
    });

    const store = useNotificationStore();
    await store.fetchNotifications();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/serms/notifications");
    expect(store.alerts).toHaveLength(1);
    expect(store.unreadCount).toBe(1);
    expect(store.alerts[0].recordLink).toBe("/reimbursements?view=5");
  });

  it("shows error toast on 403 forbidden when marking another user's notification read", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "Forbidden." }),
    });

    const store = useNotificationStore();
    await expect(store.markRead(999)).rejects.toThrow();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: expect.stringMatching(/Access denied|Forbidden/i),
      }),
    );
  });

  it("polls every 30 seconds when startPolling is active", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unread_count: 0, data: [] }),
    });

    const store = useNotificationStore();
    store.startPolling(30000);

    await vi.advanceTimersByTimeAsync(30000);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30000);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);

    store.stopPolling();
  });
});
```

Create `apps/web/src/components/base/NotificationPanel.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NotificationPanel from "./NotificationPanel.vue";
import { useNotificationStore } from "@/stores/notification";

const mockPush = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("NotificationPanel (Top-Bar Dropdown)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders latest notifications, highlights unread, and routes on click and View all", async () => {
    const store = useNotificationStore();
    store.alerts = [
      {
        id: 1,
        type: "reimbursement_submitted",
        severity: "info",
        module: "Reimbursement",
        title: "Reimbursement Submitted",
        message: "Your reimbursement of ₱4,500.10 was submitted.",
        recordLink: "/reimbursements?view=12",
        read: false,
        time: "Oct 22, 2026",
      },
    ];
    vi.spyOn(store, "markRead").mockResolvedValue();

    const wrapper = mount(NotificationPanel, {
      props: { open: true },
    });

    expect(wrapper.text()).toContain("Reimbursement Submitted");
    expect(wrapper.text()).toContain("Your reimbursement of ₱4,500.10 was submitted.");
    expect(wrapper.text()).toContain("View all notifications");

    await wrapper.find("[data-testid='notif-item-1']").trigger("click");
    expect(store.markRead).toHaveBeenCalledWith(1);
    expect(mockPush).toHaveBeenCalledWith("/reimbursements?view=12");

    await wrapper.find("[data-testid='view-all-notifications']").trigger("click");
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/notification.test.js src/components/base/NotificationPanel.test.js` (in `apps/web`)
Expected: FAIL

- [ ] **Step 3: Implement `apps/web/src/stores/notification.js`, `apps/web/src/components/base/NotificationPanel.vue`, and update `apps/web/src/layouts/AppLayout.vue`**

Update `apps/web/src/stores/notification.js`:

```javascript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { apiFetch } from "@/utils/apiFetch";
import { useToast } from "@/composables/useToast";
import { formatDate } from "@/utils/formatters";

function inferSeverity(type = "") {
  const lower = String(type || "").toLowerCase();
  if (lower.includes("rejected") || lower.includes("overdue") || lower.includes("cancelled")) {
    return "danger";
  }
  if (lower.includes("revised") || lower.includes("due_soon") || lower.includes("flagged")) {
    return "warning";
  }
  if (
    lower.includes("approved") ||
    lower.includes("granted") ||
    lower.includes("disbursed") ||
    lower.includes("settled") ||
    lower.includes("acknowledged") ||
    lower.includes("processed")
  ) {
    return "success";
  }
  return "info";
}

function normalizeNotification(raw) {
  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? null,
    type: raw.type || "info",
    severity: raw.severity || inferSeverity(raw.type),
    module: raw.module || "General",
    title: raw.title || raw.module || "Notification",
    message: raw.message || "",
    recordType: raw.record_type ?? raw.recordType ?? null,
    recordId: raw.record_id ?? raw.recordId ?? null,
    recordLink: raw.record_link ?? raw.recordLink ?? null,
    read: Boolean(raw.is_read ?? raw.read ?? false),
    time: raw.time || (raw.created_at ? formatDate(raw.created_at) : "Just now"),
    createdAt: raw.created_at || raw.createdAt || null,
    metadata: raw.metadata || null,
  };
}

export const useNotificationStore = defineStore("notification", () => {
  const alerts = ref([]);
  const isLoading = ref(false);
  let pollTimer = null;

  const unreadCount = computed(() => alerts.value.filter((a) => !a.read).length);

  async function fetchNotifications(params = {}) {
    const { addToast } = useToast();
    const query = new URLSearchParams();
    if (params.module && params.module !== "All") {
      query.set("module", params.module);
    }
    if (params.unread) {
      query.set("unread", "1");
    }
    if (params.limit) {
      query.set("limit", String(params.limit));
    }

    const qs = query.toString();
    const url = `/api/serms/notifications${qs ? `?${qs}` : ""}`;

    isLoading.value = true;
    try {
      const res = await apiFetch(url);
      if (res.status === 403) {
        addToast({
          message: "Access denied. You are not allowed to view these notifications.",
          type: "error",
        });
        throw new Error("Forbidden (403)");
      }
      if (!res.ok) {
        return alerts.value;
      }
      const payload = await res.json();
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      alerts.value = rows.map(normalizeNotification);
      return alerts.value;
    } finally {
      isLoading.value = false;
    }
  }

  async function markRead(id) {
    const { addToast } = useToast();
    const target = alerts.value.find((a) => a.id === id);
    if (target) {
      target.read = true;
    }

    const res = await apiFetch(`/api/serms/notifications/${id}/read`, {
      method: "PATCH",
    });

    if (res.status === 403) {
      if (target) target.read = false;
      addToast({
        message: "Access denied. You cannot modify another user's notification.",
        type: "error",
      });
      throw new Error("Forbidden (403)");
    }

    if (res.ok) {
      const payload = await res.json();
      if (payload?.data && target) {
        Object.assign(target, normalizeNotification(payload.data));
      }
    }
  }

  async function markAllRead() {
    alerts.value.forEach((a) => {
      a.read = true;
    });
    try {
      await apiFetch("/api/serms/notifications/read-all", {
        method: "POST",
      });
    } catch {
      // Keep optimistic state
    }
  }

  function clearAll() {
    alerts.value = [];
  }

  function startPolling(intervalMs = 30000) {
    stopPolling();
    pollTimer = setInterval(() => {
      fetchNotifications().catch(() => {});
    }, intervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function push(notification) {
    alerts.value.unshift(
      normalizeNotification({
        id: Date.now(),
        is_read: false,
        time: "Just now",
        ...notification,
      }),
    );
  }

  function info(message) {
    push({ type: "info", severity: "info", message });
  }

  function success(message) {
    push({ type: "success", severity: "success", message });
  }

  function warning(message) {
    push({ type: "warning", severity: "warning", message });
  }

  function error(message) {
    push({ type: "danger", severity: "danger", message });
  }

  return {
    alerts,
    unreadCount,
    isLoading,
    fetchNotifications,
    markRead,
    markAllRead,
    clearAll,
    startPolling,
    stopPolling,
    push,
    info,
    success,
    warning,
    error,
  };
});
```

Update `apps/web/src/components/base/NotificationPanel.vue` into an anchored top-bar dropdown modal (`G2-066`) that lists the latest 8 notifications (icon, title, short text, time, unread highlight), marks clicked items read and navigates to `recordLink`, and provides the `"View all notifications"` link at the bottom:

```vue
<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Info,
  AlertCircle,
  X,
  Clock,
  ArrowRight,
} from "lucide-vue-next";
import { useNotificationStore } from "@/stores/notification";

defineProps({ open: Boolean });
const emit = defineEmits(["close"]);

const store = useNotificationStore();
const router = useRouter();

const unread = computed(() => store.unreadCount);
const latestAlerts = computed(() => store.alerts.slice(0, 8));

const iconMap = {
  warning: { icon: AlertTriangle, cls: "text-amber-600 border-amber-200 bg-amber-50" },
  success: { icon: CheckCircle, cls: "text-emerald-600 border-emerald-200 bg-emerald-50" },
  danger: { icon: AlertCircle, cls: "text-rose-600 border-rose-200 bg-rose-50" },
  info: { icon: Info, cls: "text-primary border-primary/20 bg-primary/5" },
};

async function handleSelectNotification(alert) {
  try {
    if (!alert.read) {
      await store.markRead(alert.id);
    }
  } catch {
    emit("close");
    return;
  }

  emit("close");
  if (alert.recordLink) {
    router.push(alert.recordLink);
  }
}

function handleViewAll() {
  emit("close");
  router.push("/notifications");
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-40"
      @click="$emit('close')"
    />
  </Transition>

  <Transition name="dropdown">
    <div
      v-if="open"
      role="dialog"
      aria-label="Notifications Dropdown"
      class="fixed top-[68px] right-4 lg:right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-xl border border-slate-200 font-sans overflow-hidden"
    >
      <!-- Dropdown Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
        <div class="flex items-center gap-2">
          <Bell class="w-4 h-4 text-primary" />
          <h2 class="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Notifications
          </h2>
          <span
            v-if="unread > 0"
            class="text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-full"
          >
            {{ unread }}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <button
            v-if="unread > 0"
            type="button"
            data-testid="mark-all-read-btn"
            class="text-[11px] font-semibold text-primary hover:underline"
            @click="store.markAllRead()"
          >
            Mark all as read
          </button>
          <button
            type="button"
            class="text-slate-400 hover:text-slate-700"
            @click="$emit('close')"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Notification List -->
      <div class="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
        <div
          v-if="latestAlerts.length === 0"
          class="py-12 px-4 flex flex-col items-center justify-center text-center"
        >
          <Clock class="w-6 h-6 text-slate-300 mb-2" />
          <p class="text-xs font-medium text-slate-400">No notifications yet</p>
        </div>

        <div
          v-for="alert in latestAlerts"
          :key="alert.id"
          :data-testid="`notif-item-${alert.id}`"
          :class="[
            'flex gap-3 px-4 py-3.5 cursor-pointer transition-colors border-l-2',
            alert.read
              ? 'bg-white border-transparent hover:bg-slate-50'
              : 'bg-primary/[0.04] border-primary hover:bg-primary/[0.07]',
          ]"
          @click="handleSelectNotification(alert)"
        >
          <div
            :class="[
              'w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5',
              (iconMap[alert.severity || alert.type] || iconMap.info).cls,
            ]"
          >
            <component
              :is="(iconMap[alert.severity || alert.type] || iconMap.info).icon"
              class="w-4 h-4"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-0.5">
              <p class="text-xs font-bold text-slate-800 truncate">
                {{ alert.title || alert.module }}
              </p>
              <span class="text-[10px] font-mono text-slate-400 flex-shrink-0">
                {{ alert.time }}
              </span>
            </div>
            <p class="text-xs text-slate-600 leading-snug line-clamp-2">
              {{ alert.message }}
            </p>
          </div>
        </div>
      </div>

      <!-- Footer Link -->
      <div class="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
        <button
          type="button"
          data-testid="view-all-notifications"
          class="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover py-1"
          @click="handleViewAll"
        >
          <span>View all notifications</span>
          <ArrowRight class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
```

Update `apps/web/src/layouts/AppLayout.vue`:
- Import `onUnmounted` alongside `ref, computed, onMounted` from `"vue"`.
- In `onMounted(() => { ... })`, call `notif.fetchNotifications()` and `notif.startPolling(30000)`.
- Add `onUnmounted(() => { notif.stopPolling(); });`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/notification.test.js src/components/base/NotificationPanel.test.js` (in `apps/web`)
Expected: PASS

---

### Task 5: Frontend Notifications Page (`/notifications`) & Record Deep-Linking with Access-Denied Protection (`G2-067`, `G2-070`, `G2-072`, `G2-073`)

**Files:**
- Create: `apps/web/src/composables/useNotificationDeepLink.js`
- Create: `apps/web/src/views/NotificationsView.vue`
- Modify: `apps/web/src/router/index.js`
- Modify: `apps/web/src/views/ReimbursementsView.vue`
- Modify: `apps/web/src/views/CashAdvancesView.vue`
- Modify: `apps/web/src/views/LiquidationsView.vue`
- Modify: `apps/web/src/views/MyExpenseView.vue`
- Modify: `apps/web/src/views/PayoutView.vue`
- Create: `apps/web/src/views/NotificationsView.test.js`
- Create: `apps/web/src/composables/useNotificationDeepLink.test.js`

**Interfaces:**
- Produces:
  - `useNotificationDeepLink({ verifyUrl, onOpenRecord, queryKey = 'view' })`: watches `route.query[queryKey]`, fetches `verifyUrl(id)` via `apiFetch`, invokes `onOpenRecord(data, id)` on `200 OK`, or shows `"Access denied. You do not have permission to view this record."` toast on `403 Forbidden` (and cleans up the query parameter).
  - `/notifications` route rendering `NotificationsView.vue` with filter tabs `["All", "Unread", "Reimbursements", "Cash Advances", "Liquidations", "My Expense"]`, `"Mark as read"` per row, `"Mark all as read"`, and record link navigation.

- [ ] **Step 1: Write failing unit tests in `apps/web/src/views/NotificationsView.test.js` and `apps/web/src/composables/useNotificationDeepLink.test.js`**

Create `apps/web/src/views/NotificationsView.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NotificationsView from "./NotificationsView.vue";
import { useNotificationStore } from "@/stores/notification";

const mockPush = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("NotificationsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("filters notifications by module and unread status, and supports Mark as read and Mark all as read", async () => {
    const store = useNotificationStore();
    vi.spyOn(store, "fetchNotifications").mockResolvedValue();
    vi.spyOn(store, "markRead").mockImplementation(async (id) => {
      const item = store.alerts.find((a) => a.id === id);
      if (item) item.read = true;
    });
    vi.spyOn(store, "markAllRead").mockImplementation(async () => {
      store.alerts.forEach((a) => {
        a.read = true;
      });
    });

    store.alerts = [
      {
        id: 1,
        module: "Reimbursement",
        title: "Reimbursement Approved",
        message: "Approved ₱1,200.00",
        recordLink: "/reimbursements?view=1",
        read: false,
        severity: "success",
        time: "Oct 22, 2026",
      },
      {
        id: 2,
        module: "Cash Advance",
        title: "Cash Advance Submitted",
        message: "Submitted ₱5,000.00",
        recordLink: "/cash-advances?view=2",
        read: true,
        severity: "info",
        time: "Oct 21, 2026",
      },
    ];

    const wrapper = mount(NotificationsView);

    expect(wrapper.text()).toContain("Reimbursement Approved");
    expect(wrapper.text()).toContain("Cash Advance Submitted");

    // Filter by Cash Advances
    await wrapper.find("[data-testid='filter-Cash Advances']").trigger("click");
    expect(wrapper.text()).not.toContain("Reimbursement Approved");
    expect(wrapper.text()).toContain("Cash Advance Submitted");

    // Filter by Unread
    await wrapper.find("[data-testid='filter-Unread']").trigger("click");
    expect(wrapper.text()).toContain("Reimbursement Approved");
    expect(wrapper.text()).not.toContain("Cash Advance Submitted");

    // Mark single as read
    await wrapper.find("[data-testid='mark-read-1']").trigger("click");
    expect(store.markRead).toHaveBeenCalledWith(1);
  });
});
```

Create `apps/web/src/composables/useNotificationDeepLink.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";
import { useNotificationDeepLink } from "./useNotificationDeepLink";

const mockApiFetch = vi.fn();
const mockAddToast = vi.fn();
const mockReplace = vi.fn();
const mockRoute = { query: {} };

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}));

describe("useNotificationDeepLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.query = {};
  });

  it("shows access-denied error toast and blocks opening when API returns 403", async () => {
    mockRoute.query = { view: "42" };
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "Forbidden." }),
    });

    const onOpenRecord = vi.fn();
    const { checkDeepLink } = useNotificationDeepLink({
      verifyUrl: (id) => `/api/serms/reimbursements/${id}`,
      onOpenRecord,
    });

    await checkDeepLink();
    await nextTick();

    expect(onOpenRecord).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: "Access denied. You do not have permission to view this record.",
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/NotificationsView.test.js src/composables/useNotificationDeepLink.test.js` (in `apps/web`)
Expected: FAIL

- [ ] **Step 3: Create `useNotificationDeepLink.js`, `NotificationsView.vue`, register `/notifications` route, and wire deep links into the 5 module views**

Create `apps/web/src/composables/useNotificationDeepLink.js`:

```javascript
import { watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiFetch } from "@/utils/apiFetch";
import { useToast } from "@/composables/useToast";

export function useNotificationDeepLink({
  verifyUrl,
  onOpenRecord,
  queryKey = "view",
}) {
  const route = useRoute();
  const router = useRouter();
  const { addToast } = useToast();

  function clearQueryParam() {
    if (!route?.query || !(queryKey in route.query)) return;
    const nextQuery = { ...route.query };
    delete nextQuery[queryKey];
    router.replace({ query: nextQuery });
  }

  async function checkDeepLink() {
    const rawId = route?.query?.[queryKey];
    if (!rawId) return;

    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    clearQueryParam();

    try {
      const res = await apiFetch(verifyUrl(id));
      if (res.status === 403) {
        addToast({
          message: "Access denied. You do not have permission to view this record.",
          type: "error",
        });
        return;
      }
      if (!res.ok) {
        addToast({
          message: "Unable to open the requested record.",
          type: "error",
        });
        return;
      }
      const payload = await res.json();
      const record = payload?.data ?? payload;
      await onOpenRecord(record, id);
    } catch {
      addToast({
        message: "Access denied. You do not have permission to view this record.",
        type: "error",
      });
    }
  }

  watch(
    () => route?.query?.[queryKey],
    (val) => {
      if (val) {
        checkDeepLink();
      }
    },
  );

  return { checkDeepLink };
}
```

Create `apps/web/src/views/NotificationsView.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useNotificationStore } from "@/stores/notification";
import BaseButton from "@/components/base/BaseButton.vue";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  CheckCircle,
  Info,
  AlertCircle,
  Clock,
} from "lucide-vue-next";

const store = useNotificationStore();
const router = useRouter();

const FILTERS = [
  { label: "All", value: "All" },
  { label: "Unread", value: "Unread" },
  { label: "Reimbursements", value: "Reimbursement" },
  { label: "Cash Advances", value: "Cash Advance" },
  { label: "Liquidations", value: "Liquidation" },
  { label: "My Expense", value: "My Expense" },
];

const activeFilter = ref("All");

const iconMap = {
  warning: { icon: AlertTriangle, cls: "text-amber-600 border-amber-200 bg-amber-50" },
  success: { icon: CheckCircle, cls: "text-emerald-600 border-emerald-200 bg-emerald-50" },
  danger: { icon: AlertCircle, cls: "text-rose-600 border-rose-200 bg-rose-50" },
  info: { icon: Info, cls: "text-primary border-primary/20 bg-primary/5" },
};

const filteredNotifications = computed(() => {
  return store.alerts.filter((item) => {
    if (activeFilter.value === "All") return true;
    if (activeFilter.value === "Unread") return !item.read;
    return String(item.module || "").toLowerCase() === activeFilter.value.toLowerCase();
  });
});

async function handleOpenNotification(alert) {
  try {
    if (!alert.read) {
      await store.markRead(alert.id);
    }
  } catch {
    return;
  }

  if (alert.recordLink) {
    router.push(alert.recordLink);
  }
}

async function handleMarkReadOnly(alert) {
  try {
    await store.markRead(alert.id);
  } catch {
    // Handled by store toast
  }
}

onMounted(() => {
  store.fetchNotifications();
});
</script>

<template>
  <div class="flex flex-col gap-6 max-w-5xl mx-auto font-sans">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-page-title">Notifications</h1>
        <p class="mt-1 text-sm text-slate-500">
          Review your full notification history across all modules.
        </p>
      </div>

      <BaseButton
        v-if="store.unreadCount > 0"
        data-testid="page-mark-all-read"
        variant="secondary"
        size="sm"
        @click="store.markAllRead()"
      >
        <CheckCheck class="w-4 h-4 mr-1.5" />
        Mark all as read
      </BaseButton>
    </div>

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
      <button
        v-for="tab in FILTERS"
        :key="tab.label"
        type="button"
        :data-testid="`filter-${tab.label}`"
        :class="[
          'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
          activeFilter === tab.value
            ? 'bg-primary text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100',
        ]"
        @click="activeFilter = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Notifications List Card -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
      <div
        v-if="filteredNotifications.length === 0"
        class="py-16 px-4 flex flex-col items-center justify-center text-center"
      >
        <Clock class="w-8 h-8 text-slate-300 mb-3" />
        <p class="text-sm font-semibold text-slate-600">No notifications found</p>
        <p class="text-xs text-slate-400 mt-1">
          There are no notifications matching the selected filter.
        </p>
      </div>

      <div
        v-for="alert in filteredNotifications"
        :key="alert.id"
        :data-testid="`page-notif-${alert.id}`"
        :class="[
          'flex items-start justify-between gap-4 px-5 py-4 cursor-pointer transition-colors border-l-2',
          alert.read
            ? 'bg-white border-transparent hover:bg-slate-50'
            : 'bg-primary/[0.03] border-primary hover:bg-primary/[0.06]',
        ]"
        @click="handleOpenNotification(alert)"
      >
        <div class="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            :class="[
              'w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5',
              (iconMap[alert.severity || alert.type] || iconMap.info).cls,
            ]"
          >
            <component
              :is="(iconMap[alert.severity || alert.type] || iconMap.info).icon"
              class="w-4 h-4"
            />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {{ alert.module }}
              </span>
              <h3 class="text-sm font-bold text-slate-800">
                {{ alert.title }}
              </h3>
              <span
                v-if="!alert.read"
                class="w-2 h-2 rounded-full bg-primary inline-block"
                title="Unread"
              />
            </div>
            <p class="text-sm text-slate-600 leading-relaxed">
              {{ alert.message }}
            </p>
            <span class="text-xs font-mono text-slate-400 mt-1.5 inline-block">
              {{ alert.time }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0" @click.stop>
          <button
            v-if="!alert.read"
            type="button"
            :data-testid="`mark-read-${alert.id}`"
            class="text-xs font-semibold text-primary hover:underline px-2 py-1"
            @click="handleMarkReadOnly(alert)"
          >
            Mark as read
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

Modify `apps/web/src/router/index.js`:
- Add inside the `/` `AppLayout.vue` children array:
  ```javascript
  {
    path: "notifications",
    name: "Notifications",
    component: () => import("@/views/NotificationsView.vue"),
    meta: { title: "Notifications" },
  },
  ```

Wire `useNotificationDeepLink` into the 5 module views:
- **`apps/web/src/views/ReimbursementsView.vue`**:
  ```javascript
  const { checkDeepLink } = useNotificationDeepLink({
    verifyUrl: (id) => `/api/serms/reimbursements/${id}`,
    onOpenRecord: (record) => openDetails(record),
  });
  ```
  Call `checkDeepLink()` inside `onMounted` after `store.fetchAll()`.
- **`apps/web/src/views/CashAdvancesView.vue`**:
  ```javascript
  const { checkDeepLink } = useNotificationDeepLink({
    verifyUrl: (id) => `/api/serms/cash-advances/${id}`,
    onOpenRecord: (record) => {
      const existing = store.items.find((r) => String(r.id) === String(record.id));
      openDetails(existing || record);
    },
  });
  ```
  Call `checkDeepLink()` inside `onMounted` after `store.fetchAll()`.
- **`apps/web/src/views/LiquidationsView.vue`**:
  ```javascript
  const { checkDeepLink: checkLiquidationDeepLink } = useNotificationDeepLink({
    verifyUrl: (id) => `/api/serms/liquidations/${id}`,
    onOpenRecord: (record) => {
      if (auth.isAdmin) {
        const row = liquidationRows.value.find(
          (r) => String(r.databaseId) === String(record.id),
        );
        if (row) openReview(row);
      } else {
        const adv = store.items.find(
          (a) => String(a.id) === String(record.cash_advance_id),
        );
        if (adv) openSettlementModal(adv, "view");
      }
    },
  });
  const { checkDeepLink: checkAdvanceDeepLink } = useNotificationDeepLink({
    queryKey: "advance",
    verifyUrl: (id) => `/api/serms/cash-advances/${id}`,
    onOpenRecord: (record) => {
      const adv = store.items.find((a) => String(a.id) === String(record.id)) || record;
      openSettlementModal(adv, "view");
    },
  });
  ```
  Call `checkLiquidationDeepLink()` and `checkAdvanceDeepLink()` in `onMounted` after `refreshAll()`.
- **`apps/web/src/views/MyExpenseView.vue`**:
  ```javascript
  const { checkDeepLink } = useNotificationDeepLink({
    verifyUrl: (id) => `/api/serms/reimbursements/receipts/${id}`,
    onOpenRecord: (record) => {
      const existing = receiptsStore.visibleReceipts.find(
        (r) => String(r.dbId ?? r.id) === String(record.id),
      );
      openViewModal(existing || record);
    },
  });
  ```
  Call `checkDeepLink()` inside `onMounted` after `fetchReceipts()`.
- **`apps/web/src/views/PayoutView.vue`**:
  ```javascript
  const { checkDeepLink } = useNotificationDeepLink({
    verifyUrl: (id) => `/api/serms/reimbursements/${id}`,
    onOpenRecord: (record) => {
      const row = tableRows.value.find((r) => String(r.id) === String(record.id));
      if (row) openDetails(row);
    },
  });
  ```
  Call `checkDeepLink()` inside `onMounted` after `store.fetchAll()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/views/NotificationsView.test.js src/composables/useNotificationDeepLink.test.js` (in `apps/web`)
Expected: PASS
