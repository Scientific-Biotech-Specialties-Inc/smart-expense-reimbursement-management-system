<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Http;
use Carbon\Carbon;

class LiquidationLogicTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;
    private CashAdvance $cashAdvance;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'John Employee',
            'email' => 'john.employee@example.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Sales',
        ]);

        $this->admin = User::create([
            'name' => 'Jane Admin',
            'email' => 'jane.admin@example.com',
            'role' => 'admin',
            'grade' => 'L5',
            'department' => 'accounting',
        ]);

        $this->cashAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Business travel to Cebu',
            'amount' => 5000.00,
            'outstanding_balance' => 5000.00,
            'status' => 'signed',
            'acknowledged_at' => Carbon::now()->subDay(),
            'expected_disbursement_date' => Carbon::now()->addDays(2),
            'expected_liquidation_date' => Carbon::now()->addDays(7),
        ]);

        Storage::fake('supabase');
    }

    public function test_submit_liquidation_transitions_cash_advance_status(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/test_ocr.png',
            'file_hash' => str_repeat('d', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Original Vendor',
            'total_amount' => 5000.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Employee',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/liquidations', [
            'cash_advance_id' => $this->cashAdvance->id,
            'receipts' => [
                [
                    'id' => $receipt->id,
                    'vendor_name' => 'Edited Vendor',
                    'transaction_date' => '2026-06-12',
                    'total_amount' => 5000.00,
                    'vat_amount' => 600.00,
                    'tin' => '123-456-789-000',
                    'invoice_number' => 'INV-9999',
                ]
            ],
            'total_expense_amount' => 5000.00,
        ]);

        $response->assertStatus(210);

        // Verify cash advance is locked/under-review
        $this->cashAdvance->refresh();
        $this->assertEquals('under-review', $this->cashAdvance->status);

        // Verify receipt is updated
        $receipt->refresh();
        $this->assertEquals('Edited Vendor', $receipt->vendor_name);
        $this->assertEquals('pending', $receipt->status);

        // Verify liquidation is stored
        $this->assertDatabaseHas('liquidations', [
            'cash_advance_id' => $this->cashAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'total_expense_amount' => 5000.00,
            'outstanding_balance' => 5000.00,
        ]);
    }

    public function test_submit_liquidation_requires_shortfall_explanation(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/test_ocr.png',
            'file_hash' => str_repeat('d', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Original Vendor',
            'total_amount' => 3000.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Employee',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/liquidations', [
            'cash_advance_id' => $this->cashAdvance->id,
            'receipts' => [
                [
                    'id' => $receipt->id,
                    'vendor_name' => 'Original Vendor',
                    'transaction_date' => '2026-06-12',
                    'total_amount' => 3000.00,
                ]
            ],
            'total_expense_amount' => 3000.00,
            // shortfall_explanation is intentionally missing when variance is 2000
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['shortfall_explanation']);
    }

    public function test_audit_liquidation_approval_on_full_payment_sets_advance_to_liquidated(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $liquidation = Liquidation::create([
            'cash_advance_id' => $this->cashAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [99],
            'total_expense_amount' => 5000.00,
            'outstanding_balance' => 5000.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Jane',
            'last_name' => 'Admin',
            'department' => 'accounting',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/liquidations/{$liquidation->id}/audit", [
            'status' => 'approved',
            'password' => 'supersecret',
        ]);

        $response->assertStatus(200);

        $liquidation->refresh();
        $this->assertEquals('liquidated', $liquidation->status);

        // Full payment → advance must be liquidated, not settled
        $this->cashAdvance->refresh();
        $this->assertEquals('liquidated', $this->cashAdvance->status);
    }

    public function test_audit_liquidation_rejection_requires_admin_note(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $liquidation = Liquidation::create([
            'cash_advance_id' => $this->cashAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [99],
            'total_expense_amount' => 5000.00,
            'outstanding_balance' => 5000.00,

        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Jane',
            'last_name' => 'Admin',
            'department' => 'accounting',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/liquidations/{$liquidation->id}/audit", [
            'status' => 'rejected',
            'password' => 'supersecret',
            // admin_note missing
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['admin_note']);

        // Send short admin note
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/liquidations/{$liquidation->id}/audit", [
            'status' => 'rejected',
            'password' => 'supersecret',
            'admin_note' => 'no', // < 5 chars
        ]);

        $response->assertStatus(422);
    }

    public function test_audit_liquidation_approval_on_shortfall_sets_advance_to_incomplete(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        // Advance: PHP 5,000 | Submitted: PHP 3,000 → shortfall of PHP 2,000
        $liquidation = Liquidation::create([
            'cash_advance_id' => $this->cashAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [99],
            'total_expense_amount' => 3000.00,
            'outstanding_balance' => 5000.00,            'shortfall_explanation' => 'Unused funds returned to petty cash.',
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Jane',
            'last_name' => 'Admin',
            'department' => 'accounting',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/liquidations/{$liquidation->id}/audit", [
            'status' => 'approved',
            'password' => 'supersecret',
        ]);

        $response->assertStatus(200);

        // Shortfall → advance must be incomplete, not liquidated
        $this->cashAdvance->refresh();
        $this->assertEquals('incomplete', $this->cashAdvance->status);
    }

    public function test_resubmission_is_allowed_on_incomplete_advance(): void
    {
        // Set cash advance to incomplete (post-first-round approval with shortfall)
        $this->cashAdvance->update(['status' => 'incomplete', 'acknowledged_at' => now()]);

        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/test_ocr2.png',
            'file_hash' => str_repeat('e', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Second Round Vendor',
            'total_amount' => 2000.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Employee',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/liquidations', [
            'cash_advance_id' => $this->cashAdvance->id,
            'receipts' => [
                [
                    'id' => $receipt->id,
                    'vendor_name' => 'Second Round Vendor',
                    'transaction_date' => '2026-06-14',
                    'total_amount' => 2000.00,
                ]
            ],
            'total_expense_amount' => 2000.00,
            'shortfall_explanation' => 'Partial payment toward remaining balance after first round.',
        ]);

        // Must succeed — incomplete is a reconcilable state
        $response->assertStatus(210);

        $this->cashAdvance->refresh();
        $this->assertEquals('under-review', $this->cashAdvance->status);

        // Two liquidation instances must be linked to the same cash advance
        $this->assertDatabaseCount('liquidations', 1); // only this one created in this test
        $this->assertDatabaseHas('liquidations', [
            'cash_advance_id' => $this->cashAdvance->id,
            'total_expense_amount' => 2000.00,
        ]);
    }

    public function test_audit_rejection_on_incomplete_advance_returns_to_incomplete(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        // Advance is already incomplete (partial liquidation from a previous round)
        $this->cashAdvance->update(['status' => 'incomplete']);

        $liquidation = Liquidation::create([
            'cash_advance_id' => $this->cashAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [99],
            'total_expense_amount' => 1000.00,
            'outstanding_balance' => 2000.00, // Simulating a second partial liquidation
            'shortfall_explanation' => 'Still cannot cover full amount.',
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Jane',
            'last_name' => 'Admin',
            'department' => 'accounting',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/liquidations/{$liquidation->id}/audit", [
            'status' => 'rejected',
            'password' => 'supersecret',
            'admin_note' => 'Receipts are not valid for the claimed amounts.',
        ]);

        $response->assertStatus(200);

        // Rejected on incomplete → must stay incomplete, not revert to signed/disbursed
        $this->cashAdvance->refresh();
        $this->assertEquals('incomplete', $this->cashAdvance->status);
    }
}
