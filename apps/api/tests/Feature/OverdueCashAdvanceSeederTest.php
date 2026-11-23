<?php

namespace Tests\Feature;

use App\Modules\CashAdvances\Database\Seeders\OverdueCashAdvanceSeeder;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OverdueCashAdvanceSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_provisions_overdue_advances_with_overpayment(): void
    {
        $this->seed(OverdueCashAdvanceSeeder::class);

        $employee = User::where('email', OverdueCashAdvanceSeeder::EMPLOYEE_EMAIL)->first();
        $this->assertNotNull($employee);

        $admin = User::where('email', OverdueCashAdvanceSeeder::ADMIN_EMAIL)->first();
        $this->assertNotNull($admin);

        // Employee overdue with overpayment
        $empAdvance = CashAdvance::where('user_id', $employee->id)
            ->where('purpose', 'Regional Client Onsite & Setup — Overdue with Overpayment')
            ->first();

        $this->assertNotNull($empAdvance);
        $this->assertEquals('overdue', $empAdvance->status);
        $this->assertEquals(10000.00, (float) $empAdvance->amount);
        $this->assertEquals(10250.00, (float) $empAdvance->outstanding_balance);
        $this->assertSame(5, $empAdvance->penalties()->count());
        $this->assertEquals(250.00, (float) $empAdvance->penalties()->sum('penalty_amount'));

        $liq = $empAdvance->liquidations()->first();
        $this->assertNotNull($liq);
        $this->assertEquals(12500.00, (float) $liq->total_expense_amount);
        $this->assertEquals(10250.00, (float) $liq->outstanding_balance);
        $this->assertGreaterThan((float) $empAdvance->outstanding_balance, (float) $liq->total_expense_amount);

        // Admin overdue with overpayment
        $admAdvance = CashAdvance::where('user_id', $admin->id)
            ->where('purpose', 'Accounting Summit Travel & Venue — Overdue with Overpayment')
            ->first();

        $this->assertNotNull($admAdvance);
        $this->assertEquals('overdue', $admAdvance->status);
        $this->assertEquals(15000.00, (float) $admAdvance->amount);
        $this->assertEquals(15200.00, (float) $admAdvance->outstanding_balance);
        $this->assertSame(4, $admAdvance->penalties()->count());

        $admLiq = $admAdvance->liquidations()->first();
        $this->assertNotNull($admLiq);
        $this->assertEquals(15200.00, (float) $admLiq->outstanding_balance);

        // Employee standard overdue without liquidation
        $stdAdvance = CashAdvance::where('user_id', $employee->id)
            ->where('purpose', 'Equipment Calibration & Maintenance — Overdue Pending Liquidation')
            ->first();
        $this->assertNotNull($stdAdvance);
        $this->assertEquals(5150.00, (float) $stdAdvance->outstanding_balance);
        $this->assertSame(3, $stdAdvance->penalties()->count());

        // Idempotency check: running again shouldn't fail or duplicate
        $this->seed(OverdueCashAdvanceSeeder::class);
        $this->assertEquals(
            1,
            CashAdvance::where('user_id', $employee->id)
                ->where('purpose', 'Regional Client Onsite & Setup — Overdue with Overpayment')
                ->count()
        );
    }
}
