<?php

namespace Tests\Feature;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Database\Seeders\LiquidationCountdownTestSeeder;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LiquidationCountdownTestSeederTest extends TestCase
{
    use RefreshDatabase;

    private function createTargetUser(): User
    {
        ExpenseCategory::ensureDefaults();

        return User::create([
            'name' => 'summer love',
            'email' => LiquidationCountdownTestSeeder::TARGET_EMAIL,
            'role' => 'admin',
            'department' => 'Accounting',
        ]);
    }

    public function test_it_seeds_liquidation_instances_with_10_days_and_1_month_due_dates(): void
    {
        $user = $this->createTargetUser();

        $this->seed(LiquidationCountdownTestSeeder::class);

        $advances = CashAdvance::with(['liquidations', 'disbursement'])
            ->where('user_id', $user->id)
            ->whereIn('purpose', [
                LiquidationCountdownTestSeeder::PURPOSE_10_DAYS,
                LiquidationCountdownTestSeeder::PURPOSE_1_MONTH,
            ])
            ->orderBy('id')
            ->get();

        $this->assertCount(2, $advances);

        $advance10D = $advances->firstWhere('purpose', LiquidationCountdownTestSeeder::PURPOSE_10_DAYS);
        $advance1M = $advances->firstWhere('purpose', LiquidationCountdownTestSeeder::PURPOSE_1_MONTH);

        $this->assertNotNull($advance10D);
        $this->assertNotNull($advance1M);

        // Verify 10 days due date
        $this->assertSame(
            Carbon::today()->addDays(10)->toDateString(),
            $advance10D->expected_liquidation_date->toDateString()
        );
        $this->assertSame('under-review', $advance10D->status);
        $this->assertNotNull($advance10D->disbursement);
        $this->assertSame('SEED-COUNTDOWN-10D', $advance10D->disbursement->reference_number);

        // Verify 1 month due date
        $this->assertSame(
            Carbon::today()->addMonth()->toDateString(),
            $advance1M->expected_liquidation_date->toDateString()
        );
        $this->assertSame('under-review', $advance1M->status);
        $this->assertNotNull($advance1M->disbursement);
        $this->assertSame('SEED-COUNTDOWN-1M', $advance1M->disbursement->reference_number);

        // Verify liquidations
        $liq10D = $advance10D->liquidations->first();
        $this->assertNotNull($liq10D);
        $this->assertSame('pending', $liq10D->status);
        $this->assertSame((float) $advance10D->amount, (float) $liq10D->total_expense_amount);
        $this->assertNotEmpty($liq10D->reimbursement_ids);

        $receipt10D = Receipt::find($liq10D->reimbursement_ids[0]);
        $this->assertNotNull($receipt10D);
        $this->assertSame('INV-SEED-CD-10D', $receipt10D->invoice_number);

        $liq1M = $advance1M->liquidations->first();
        $this->assertNotNull($liq1M);
        $this->assertSame('pending', $liq1M->status);
        $this->assertSame((float) $advance1M->amount, (float) $liq1M->total_expense_amount);
        $this->assertNotEmpty($liq1M->reimbursement_ids);

        $receipt1M = Receipt::find($liq1M->reimbursement_ids[0]);
        $this->assertNotNull($receipt1M);
        $this->assertSame('INV-SEED-CD-1M', $receipt1M->invoice_number);

        // Verify audit logs
        $auditLogs = AuditLog::where('action_type', 'SEED_LIQUIDATION_COUNTDOWN')->get();
        $this->assertCount(2, $auditLogs);
    }

    public function test_running_seeder_twice_is_idempotent(): void
    {
        $user = $this->createTargetUser();

        $this->seed(LiquidationCountdownTestSeeder::class);
        $this->seed(LiquidationCountdownTestSeeder::class);

        $advancesCount = CashAdvance::where('user_id', $user->id)
            ->whereIn('purpose', [
                LiquidationCountdownTestSeeder::PURPOSE_10_DAYS,
                LiquidationCountdownTestSeeder::PURPOSE_1_MONTH,
            ])
            ->count();

        $this->assertSame(2, $advancesCount);

        $liquidationsCount = Liquidation::where('user_id', $user->id)
            ->whereHas('cashAdvance', function ($query) {
                $query->whereIn('purpose', [
                    LiquidationCountdownTestSeeder::PURPOSE_10_DAYS,
                    LiquidationCountdownTestSeeder::PURPOSE_1_MONTH,
                ]);
            })
            ->count();

        $this->assertSame(2, $liquidationsCount);
    }

    public function test_it_provisions_target_user_if_missing(): void
    {
        $this->assertDatabaseMissing('users', ['email' => LiquidationCountdownTestSeeder::TARGET_EMAIL]);

        $this->seed(LiquidationCountdownTestSeeder::class);

        $this->assertDatabaseHas('users', [
            'name' => 'summer love',
            'email' => LiquidationCountdownTestSeeder::TARGET_EMAIL,
            'role' => 'admin',
        ]);

        $advancesCount = CashAdvance::whereHas('requester', function ($query) {
            $query->where('email', LiquidationCountdownTestSeeder::TARGET_EMAIL);
        })->count();

        $this->assertSame(2, $advancesCount);
    }
}
