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

    public function test_admins_cannot_access_other_users_my_expense_receipts_and_are_not_notified_on_receipt_upload(): void
    {
        $receiptService = app(\App\Modules\Reimbursements\Services\ReceiptService::class);

        // Employee uploads a mock receipt
        $receipt = $receiptService->storeReceipt($this->employee, [
            'vendor_name' => 'National Book Store',
            'transaction_date' => '2026-10-22',
            'total_amount' => 1250.50,
            'vat_amount' => 134.00,
            'is_mock' => true,
        ], null);

        // Employee receives notification
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'receipt_processed',
            'module' => 'My Expense',
        ]);

        // Admins MUST NOT receive any notification for My Expense uploads
        $this->assertDatabaseMissing('notifications', [
            'user_id' => $this->admin->id,
            'module' => 'My Expense',
        ]);

        // Admin attempting to view employee's receipt gets 403 Forbidden
        $adminView = $this->actingAs($this->admin)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->getJson("/api/reimbursements/receipts/{$receipt->id}");

        $adminView->assertStatus(403)
            ->assertJsonPath('message', 'Access denied. You do not have permission to view this record.');

        // Owner viewing own receipt gets 200 OK
        $ownerView = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->getJson("/api/reimbursements/receipts/{$receipt->id}");

        $ownerView->assertOk()
            ->assertJsonPath('data.id', $receipt->id);
    }
}
