<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
            'department' => 'accounting',
        ]);

        // 7-day grace period + 2 days overdue = 9 days past expected_liquidation_date
        $this->cashAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Business travel',
            'amount' => 200.00,
            'outstanding_balance' => 200.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(16),
            'expected_liquidation_date' => Carbon::now()->subDays(9),
            'acknowledged_at' => Carbon::now()->subDays(15),
        ]);
    }

    public function test_calculate_penalties_enforces_7_day_grace_period(): void
    {
        $withinGrace = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Grace period travel',
            'amount' => 500.00,
            'outstanding_balance' => 500.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(12),
            'expected_liquidation_date' => Carbon::now()->subDays(7),
            'acknowledged_at' => Carbon::now()->subDays(11),
        ]);

        $this->artisan('penalties:calculate')->assertSuccessful();

        $withinGrace->refresh();
        $this->assertEquals(500.00, (float) $withinGrace->outstanding_balance);
        $this->assertEquals('signed', $withinGrace->status);
        $this->assertSame(0, $withinGrace->penalties()->count());
    }

    public function test_calculate_penalties_applies_penalties_and_updates_balance_and_status(): void
    {
        $this->artisan('penalties:calculate')
            ->assertSuccessful();

        $this->cashAdvance->refresh();

        // 9 days past due - 7-day grace = 2 days overdue -> 2 * 50 = 100 PHP penalty -> total balance 300.00
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

        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'OVERDUE_PENALTY',
            'entity_type' => 'cash_advance',
            'entity_id' => $this->cashAdvance->id,
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

    public function test_outstanding_balance_update_propagates_to_associated_revise_liquidation(): void
    {
        // Liquidation returned for revision resumes accruing overdue penalties
        $liquidation = Liquidation::create([
            'cash_advance_id' => $this->cashAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'revise',
            'reimbursement_ids' => [1],
            'total_expense_amount' => 100.00,
            'outstanding_balance' => 200.00,
        ]);

        $this->artisan('penalties:calculate')->assertSuccessful();

        $liquidation->refresh();
        $this->cashAdvance->refresh();

        $this->assertEquals(300.00, (float)$this->cashAdvance->outstanding_balance);
        $this->assertEquals(300.00, (float)$liquidation->outstanding_balance);
    }

    public function test_pending_liquidation_pauses_daily_penalty_accrual(): void
    {
        $liquidation = Liquidation::create([
            'cash_advance_id' => $this->cashAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [1],
            'total_expense_amount' => 200.00,
            'outstanding_balance' => 200.00,
        ]);

        $this->artisan('penalties:calculate')->assertSuccessful();

        $this->cashAdvance->refresh();
        $liquidation->refresh();

        $this->assertEquals(200.00, (float) $this->cashAdvance->outstanding_balance);
        $this->assertEquals(200.00, (float) $liquidation->outstanding_balance);
        $this->assertDatabaseCount('penalties', 0);
    }

    public function test_api_read_and_liquidation_submission_sync_overdue_penalties_into_balance(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Overdue API sync test',
            'amount' => 5000.00,
            'outstanding_balance' => 5000.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(17),
            'expected_liquidation_date' => Carbon::now()->subDays(10), // 7-day grace + 3 penalty days = 150
            'acknowledged_at' => Carbon::now()->subDays(16),
        ]);

        $employeeToken = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'Test',
            'last_name' => 'Employee',
        ]);

        // Reading cash advances reconciles overdue penalty into balance automatically
        $listResponse = $this->withHeaders([
            'Authorization' => 'Bearer ' . $employeeToken,
        ])->getJson('/api/cash-advances');

        $listResponse->assertStatus(200);
        $fetched = collect($listResponse->json())->firstWhere('id', $advance->id);
        $this->assertNotNull($fetched);
        $this->assertEquals('overdue', $fetched['status']);
        $this->assertEquals(5150.0, (float) $fetched['outstanding_balance']);
        $this->assertEquals(5150.0, (float) $fetched['balance']);
        $this->assertEquals(150.0, (float) $fetched['penalties_total']);

        // Submitting receipts equal only to requested amount (5000 < 5150) requires shortfall explanation
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/test_overdue_sync.png',
            'file_hash' => str_repeat('f', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Test Vendor',
            'total_amount' => 5000.00,
        ]);

        $shortfallFail = $this->withHeaders([
            'Authorization' => 'Bearer ' . $employeeToken,
        ])->postJson('/api/liquidations', [
            'cash_advance_id' => $advance->id,
            'receipts' => [[
                'id' => $receipt->id,
                'vendor_name' => 'Test Vendor',
                'transaction_date' => Carbon::now()->toDateString(),
                'total_amount' => 5000.00,
            ]],
            'total_expense_amount' => 5000.00,
        ]);
        $shortfallFail->assertStatus(422);
        $shortfallFail->assertJsonValidationErrors(['shortfall_explanation']);

        // Submitting overpayment (6000 > 5150) succeeds with balance=5150 and overpayment=850
        $receipt->update(['total_amount' => 6000.00]);
        $submitOk = $this->withHeaders([
            'Authorization' => 'Bearer ' . $employeeToken,
        ])->postJson('/api/liquidations', [
            'cash_advance_id' => $advance->id,
            'receipts' => [[
                'id' => $receipt->id,
                'vendor_name' => 'Test Vendor',
                'transaction_date' => Carbon::now()->toDateString(),
                'total_amount' => 6000.00,
            ]],
            'total_expense_amount' => 6000.00,
        ]);
        $submitOk->assertStatus(210);
        $liqId = $submitOk->json('data.id');
        $this->assertEquals(5150.0, (float) $submitOk->json('data.outstanding_balance'));

        $adminToken = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Test',
            'last_name' => 'Admin',
            'department' => 'accounting',
        ]);

        $liqList = $this->withHeaders([
            'Authorization' => 'Bearer ' . $adminToken,
        ])->getJson('/api/liquidations');
        $liqList->assertStatus(200);
        $liqRow = collect($liqList->json())->firstWhere('id', $liqId);
        $this->assertEquals(5150.0, (float) $liqRow['outstanding_balance']);
        $this->assertEquals(850.0, (float) $liqRow['overpayment_amount']);

        // Approval clears remaining balance to 0
        $auditRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $adminToken,
        ])->postJson("/api/liquidations/{$liqId}/audit", [
            'status' => 'approved',
            'password' => 'secret',
        ]);
        $auditRes->assertStatus(200);
        $this->assertEquals(0.0, (float) $advance->fresh()->outstanding_balance);
        $this->assertEquals('liquidated', $advance->fresh()->status);
    }
}
