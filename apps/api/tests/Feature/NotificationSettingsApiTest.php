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
        $response = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->getJson('/api/notifications/settings');

        $response->assertOk()
            ->assertJsonPath('role_scope', 'employee')
            ->assertJsonPath('data.email_enabled', true)
            ->assertJsonPath('data.request_submissions', true)
            ->assertJsonPath('data.status_updates', true)
            ->assertJsonPath('data.admin_comments', true)
            ->assertJsonPath('data.near_deadline_reminders', true)
            ->assertJsonPath('data.overdue_alerts', true);

        $adminResponse = $this->actingAs($this->admin)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->getJson('/api/notifications/settings');

        $adminResponse->assertOk()
            ->assertJsonPath('role_scope', 'admin')
            ->assertJsonPath('data.email_enabled', true)
            ->assertJsonPath('data.admin_new_requests', true)
            ->assertJsonPath('data.admin_employee_updates', true)
            ->assertJsonPath('data.admin_overdue_liquidations', true);
    }

    public function test_user_can_update_individual_toggles_and_master_switch_with_audit_log(): void
    {
        $updateResponse = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->putJson('/api/notifications/settings', [
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
        $fetchAgain = $this->actingAs($this->employee)
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->getJson('/api/notifications/settings');
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
