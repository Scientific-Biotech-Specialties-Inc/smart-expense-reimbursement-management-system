<?php

namespace Tests\Feature;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Shared\Services\PasswordVerificationService;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OwaspSecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $otherEmployee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('supabase');

        $this->employee = User::create([
            'name' => 'Alice Employee',
            'email' => 'alice.owasp@example.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Sales',
        ]);

        $this->otherEmployee = User::create([
            'name' => 'Bob Employee',
            'email' => 'bob.owasp@example.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Operations',
        ]);

        $this->admin = User::create([
            'name' => 'Carol Admin',
            'email' => 'carol.owasp@example.com',
            'role' => 'admin',
            'grade' => 'L5',
            'department' => 'accounting',
        ]);
    }

    public function test_liquidation_store_rejects_receipt_owned_by_another_user(): void
    {
        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Client site visit',
            'amount' => 1500.00,
            'outstanding_balance' => 1500.00,
            'status' => 'signed',
            'acknowledged_at' => Carbon::now()->subDay(),
            'expected_disbursement_date' => Carbon::now()->addDays(1),
            'expected_liquidation_date' => Carbon::now()->addDays(7),
        ]);

        $foreignReceipt = Receipt::create([
            'uploaded_by' => $this->otherEmployee->id,
            'file_path' => 'receipts/foreign_store.png',
            'file_hash' => str_repeat('a', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Foreign Vendor',
            'total_amount' => 1500.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => 'employee',
            'department' => 'Sales',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/liquidations', [
            'cash_advance_id' => $advance->id,
            'total_expense_amount' => 1500.00,
            'receipts' => [
                [
                    'id' => $foreignReceipt->id,
                    'total_amount' => 1500.00,
                ],
            ],
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseCount('liquidations', 0);
    }

    public function test_liquidation_update_rejects_receipt_owned_by_another_user(): void
    {
        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Regional audit travel',
            'amount' => 1500.00,
            'outstanding_balance' => 1500.00,
            'status' => 'under-review',
            'acknowledged_at' => Carbon::now()->subDay(),
            'expected_disbursement_date' => Carbon::now()->addDays(1),
            'expected_liquidation_date' => Carbon::now()->addDays(7),
        ]);

        $ownReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/own_update.png',
            'file_hash' => str_repeat('b', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Own Vendor',
            'total_amount' => 1500.00,
        ]);

        $foreignReceipt = Receipt::create([
            'uploaded_by' => $this->otherEmployee->id,
            'file_path' => 'receipts/foreign_update.png',
            'file_hash' => str_repeat('c', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Foreign Vendor',
            'total_amount' => 1500.00,
        ]);

        $liquidation = Liquidation::create([
            'cash_advance_id' => $advance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [$ownReceipt->id],
            'total_expense_amount' => 1500.00,
            'outstanding_balance' => 1500.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => 'employee',
            'department' => 'Sales',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->putJson("/api/liquidations/{$liquidation->id}", [
            'total_expense_amount' => 1500.00,
            'receipts' => [
                [
                    'id' => $foreignReceipt->id,
                    'total_amount' => 1500.00,
                ],
            ],
        ]);

        $response->assertStatus(403);
        $this->assertEquals([$ownReceipt->id], $liquidation->fresh()->reimbursement_ids);
    }

    public function test_liquidation_destroy_creates_audit_log(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Pending liquidation deletion test',
            'amount' => 1000.00,
            'outstanding_balance' => 1000.00,
            'status' => 'under-review',
            'acknowledged_at' => Carbon::now()->subDay(),
            'expected_disbursement_date' => Carbon::now()->addDays(1),
            'expected_liquidation_date' => Carbon::now()->addDays(7),
        ]);

        $liquidation = Liquidation::create([
            'cash_advance_id' => $advance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [],
            'total_expense_amount' => 1000.00,
            'outstanding_balance' => 1000.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => 'employee',
            'department' => 'Sales',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->deleteJson("/api/liquidations/{$liquidation->id}", [
            'password' => 'valid-password',
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseMissing('liquidations', ['id' => $liquidation->id]);

        $auditLog = AuditLog::where('action_type', 'LIQUIDATION_DELETED')
            ->where('entity_type', 'liquidation')
            ->where('entity_id', $liquidation->id)
            ->first();

        $this->assertNotNull($auditLog);
        $this->assertEquals($this->employee->id, $auditLog->actor_id);
        $this->assertNotNull($auditLog->before_state);
        $this->assertNull($auditLog->after_state);
        $this->assertArrayHasKey('LIQUIDATION_DELETED', AuditLogService::ACTION_META);
    }

    public function test_idempotency_key_is_scoped_per_user(): void
    {
        $tokenA = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => 'employee',
            'department' => 'Sales',
        ]);

        $tokenB = $this->generateMockToken([
            'email' => $this->otherEmployee->email,
            'role' => 'employee',
            'department' => 'Operations',
        ]);

        $payloadA = [
            'purpose' => 'Idempotency isolation test',
            'amount' => 500.00,
            'expected_disbursement_date' => Carbon::now()->addDays(2)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(7)->toDateString(),
            'documents' => [UploadedFile::fake()->create('memo_a.pdf', 100, 'application/pdf')],
        ];

        $payloadB = [
            'purpose' => 'Idempotency isolation test',
            'amount' => 500.00,
            'expected_disbursement_date' => Carbon::now()->addDays(2)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(7)->toDateString(),
            'documents' => [UploadedFile::fake()->create('memo_b.pdf', 100, 'application/pdf')],
        ];

        $resA = $this->withHeaders([
            'Authorization' => 'Bearer ' . $tokenA,
            'Accept' => 'application/json',
            'X-Idempotency-Key' => 'shared-key-001',
        ])->post('/api/cash-advances', $payloadA);

        $resA->assertStatus(201);

        $resB = $this->withHeaders([
            'Authorization' => 'Bearer ' . $tokenB,
            'Accept' => 'application/json',
            'X-Idempotency-Key' => 'shared-key-001',
        ])->post('/api/cash-advances', $payloadB);

        $resB->assertStatus(201);
        $this->assertNull($resB->headers->get('X-Idempotent-Replay'));
        $this->assertNotEquals($resA->json('data.id'), $resB->json('data.id'));
    }

    public function test_jwt_missing_jti_is_rejected_with_401(): void
    {
        $token = $this->generateMockToken([
            'jti' => '',
            'email' => $this->employee->email,
            'role' => 'employee',
            'department' => 'Sales',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->getJson('/api/reimbursements');

        $response->assertStatus(401);
    }

    public function test_production_envelope_enforcement_rejects_plaintext_password(): void
    {
        config(['services.crypto.require_envelope' => true]);

        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => 'admin',
            'department' => 'accounting',
        ]);

        $request = Request::create('/api/reimbursements/1/approve', 'POST', [
            'password' => 'plaintext-secret',
        ]);
        $request->headers->set('Authorization', 'Bearer ' . $token);

        $this->assertFalse(PasswordVerificationService::verify($request, 'plaintext-secret'));
    }

    public function test_password_protected_route_enforces_rate_limiting_429(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => false], 200),
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Rate limit test claim',
            'category' => 'Travel',
            'amount' => 500.00,
            'date' => '2026-06-01',
            'status' => 'submitted',
            'submitted_by_name' => $this->employee->name,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => 'admin',
            'department' => 'accounting',
        ]);

        RateLimiter::clear(md5('serms-password' . $this->admin->id));
        RateLimiter::clear(md5('serms-password127.0.0.1'));

        for ($i = 0; $i < 10; $i++) {
            $res = $this->withHeaders([
                'Authorization' => 'Bearer ' . $token,
            ])->postJson("/api/reimbursements/{$reimbursement->id}/approve", [
                'password' => 'wrong-password',
            ]);
            $this->assertNotEquals(429, $res->status(), "Request #{$i} was unexpectedly rate-limited.");
        }

        $blocked = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$reimbursement->id}/approve", [
            'password' => 'wrong-password',
        ]);

        if ($blocked->status() !== 429) {
            $blocked = $this->withHeaders([
                'Authorization' => 'Bearer ' . $token,
            ])->postJson("/api/reimbursements/{$reimbursement->id}/approve", [
                'password' => 'wrong-password',
            ]);
        }

        $blocked->assertStatus(429);
    }
}
