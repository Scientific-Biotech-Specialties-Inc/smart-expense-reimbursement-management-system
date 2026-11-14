<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Notifications\Models\EmailLog;
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

        config(['queue.default' => 'sync']);
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

        // EmailLog was created and marked 'sent' after synchronous queue job execution in test environment
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
