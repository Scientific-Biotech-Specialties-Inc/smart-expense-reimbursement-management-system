<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Carbon\Carbon;

class PenaltyLogicTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;
    private CashAdvance $cashAdvance;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'Test Employee',
            'email' => 'test.employee@example.com',
            'role' => 'employee',
        ]);

        $this->admin = User::create([
            'name' => 'Test Admin',
            'email' => 'test.admin@example.com',
            'role' => 'admin',
        ]);

        // Create a cash advance signed and past due
        $this->cashAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Business travel',
            'amount' => 200.00,
            'outstanding_balance' => 200.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(10),
            'expected_liquidation_date' => Carbon::now()->subDays(2), // 2 days past due
            'acknowledged_at' => Carbon::now()->subDays(9),
        ]);
    }

    public function test_calculate_penalties_applies_penalties_and_updates_balance_and_status(): void
    {
        $this->artisan('penalties:calculate')
            ->assertSuccessful();

        $this->cashAdvance->refresh();

        // Should be 2 days overdue -> 2 * 50 = 100 PHP penalty -> total balance 300.00
        $this->assertEquals(300.00, (float)$this->cashAdvance->outstanding_balance);
        $this->assertEquals('overdue', $this->cashAdvance->status);

        // Should have 2 penalty records
        $this->assertDatabaseCount('penalties', 2);
        $this->assertDatabaseHas('penalties', [
            'cash_advance_id' => $this->cashAdvance->id,
            'days_overdue' => 1,
            'penalty_amount' => 50.00,
        ]);
        $this->assertDatabaseHas('penalties', [
            'cash_advance_id' => $this->cashAdvance->id,
            'days_overdue' => 2,
            'penalty_amount' => 50.00,
        ]);
    }

    public function test_calculate_penalties_is_idempotent(): void
    {
        // Run first time
        $this->artisan('penalties:calculate')->assertSuccessful();

        // Run second time
        $this->artisan('penalties:calculate')->assertSuccessful();

        $this->cashAdvance->refresh();

        // Balances and records should remain the same (no duplicates)
        $this->assertEquals(300.00, (float)$this->cashAdvance->outstanding_balance);
        $this->assertDatabaseCount('penalties', 2);
    }

    public function test_calculate_penalties_applies_to_incomplete_status_without_changing_status(): void
    {
        // Set cash advance to incomplete
        $this->cashAdvance->update(['status' => 'incomplete']);

        $this->artisan('penalties:calculate')->assertSuccessful();

        $this->cashAdvance->refresh();

        // Should apply penalties to outstanding balance
        $this->assertEquals(300.00, (float)$this->cashAdvance->outstanding_balance);
        // Status should remain incomplete
        $this->assertEquals('incomplete', $this->cashAdvance->status);
        $this->assertDatabaseCount('penalties', 2);
    }

    public function test_outstanding_balance_update_propagates_to_associated_liquidation(): void
    {
        // Create associated liquidation
        $liquidation = Liquidation::create([
            'cash_advance_id' => $this->cashAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [1],
            'total_expense_amount' => 100.00,
            'outstanding_balance' => 200.00,
        ]);

        // Run penalties command
        $this->artisan('penalties:calculate')->assertSuccessful();

        // Liquidation outstanding balance should automatically update to match cash advance balance
        $liquidation->refresh();
        $this->cashAdvance->refresh();

        $this->assertEquals(300.00, (float)$this->cashAdvance->outstanding_balance);
        $this->assertEquals(300.00, (float)$liquidation->outstanding_balance);
    }
}
