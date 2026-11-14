<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Notifications\Models\EmailLog;
use App\Modules\Notifications\Models\Notification;
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

        config(['queue.default' => 'sync']);
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
