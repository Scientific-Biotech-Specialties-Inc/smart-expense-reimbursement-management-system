<?php

namespace Tests\Feature;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceApprovalAction;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CashAdvancePayoutDisbursementTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $approver;

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $this->employee = User::create([
            'name' => 'John Employee',
            'email' => 'john.employee@example.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Sales',
        ]);

        $this->approver = User::create([
            'name' => 'Approver Admin',
            'email' => 'approver@example.com',
            'role' => 'admin',
            'grade' => 'L4',
            'department' => 'Accounting',
        ]);
    }

    private function approverToken(array $overrides = []): string
    {
        return $this->generateMockToken(array_merge([
            'email' => $this->approver->email,
            'role' => $this->approver->role,
            'department' => 'Accounting',
            'first_name' => 'Approver',
            'last_name' => 'Admin',
        ], $overrides));
    }

    private function employeeToken(array $overrides = []): string
    {
        return $this->generateMockToken(array_merge([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'department' => 'Sales',
            'first_name' => 'John',
            'last_name' => 'Employee',
        ], $overrides));
    }

    private function makeCashAdvance(array $overrides = []): CashAdvance
    {
        return CashAdvance::create(array_merge([
            'user_id' => $this->employee->id,
            'purpose' => 'Field equipment travel advance',
            'amount' => 5000.00,
            'status' => 'pending',
            'revision_count' => 0,
            'expected_disbursement_date' => Carbon::now()->addDays(2)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(7)->toDateString(),
        ], $overrides));
    }

    public function test_disburse_with_grant_payout_modal_payload_persists_fields_and_returns_enriched_payout(): void
    {
        $advance = $this->makeCashAdvance();

        // Approve first so CashAdvanceApprovalAction exists
        $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/approve", [
                'comment' => 'Approved for field work.',
                'password' => 'password',
            ])
            ->assertOk();

        $signature = 'data:image/png;base64,granterSigBase64Payload';

        $response = $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/disburse", [
                'granted_by' => 'Cashier Jane',
                'payout_method' => 'Other',
                'payout_method_other' => 'GCash Corporate',
                'granter_signature' => $signature,
                'password' => 'password',
            ]);

        $response->assertOk();
        $response->assertJsonPath('data.status', 'disbursed');
        $response->assertJsonPath('data.approved_by', 'Approver Admin');
        $this->assertNotNull($response->json('data.approved_at'));

        $response->assertJsonStructure([
            'data' => [
                'payout' => [
                    'id',
                    'cash_advance_id',
                    'request_date',
                    'approved_at',
                    'granted_at',
                    'approved_by',
                    'granted_by',
                    'payout_method',
                    'payout_method_other',
                    'reference_number',
                    'amount',
                    'granter_signature',
                    'employee_signature',
                    'acknowledged_at',
                ],
            ],
        ]);

        $response->assertJsonPath('data.payout.cash_advance_id', $advance->id);
        $response->assertJsonPath('data.payout.approved_by', 'Approver Admin');
        $response->assertJsonPath('data.payout.granted_by', 'Cashier Jane');
        $response->assertJsonPath('data.payout.payout_method', 'Other');
        $response->assertJsonPath('data.payout.payout_method_other', 'GCash Corporate');
        $response->assertJsonPath('data.payout.amount', '5000.00');
        $response->assertJsonPath('data.payout.granter_signature', $signature);
        $response->assertJsonPath('data.payout.employee_signature', null);
        $response->assertJsonPath('data.payout.acknowledged_at', null);

        $referenceNumber = $response->json('data.payout.reference_number');
        $this->assertNotEmpty($referenceNumber);
        $this->assertStringStartsWith("CA-{$advance->id}-", $referenceNumber);

        $this->assertDatabaseHas('cash_advance_disbursements', [
            'cash_advance_id' => $advance->id,
            'disbursed_by_id' => $this->approver->id,
            'granted_by' => 'Cashier Jane',
            'channel' => 'GCash Corporate',
            'payout_method' => 'Other',
            'payout_method_other' => 'GCash Corporate',
            'reference_number' => $referenceNumber,
            'granter_signature' => $signature,
        ]);

        $auditLog = AuditLog::where('entity_type', 'cash_advance')
            ->where('entity_id', $advance->id)
            ->where('action_type', 'CASH_ADVANCE_DISBURSED')
            ->first();

        $this->assertNotNull($auditLog);
        $this->assertSame('Other', $auditLog->after_state['payout_method'] ?? null);
        $this->assertSame('GCash Corporate', $auditLog->after_state['payout_method_other'] ?? null);
        $this->assertSame('Cashier Jane', $auditLog->after_state['granted_by'] ?? null);

        // Verify GET /api/cash-advances returns synthesized payout + audit trail
        $listResponse = $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken()])
            ->getJson('/api/cash-advances');

        $listResponse->assertOk();
        $listResponse->assertJsonPath('0.id', $advance->id);
        $listResponse->assertJsonPath('0.payout.granted_by', 'Cashier Jane');
        $listResponse->assertJsonPath('0.payout.payout_method', 'Other');
        $listResponse->assertJsonPath('0.payout.payout_method_other', 'GCash Corporate');
        $listResponse->assertJsonPath('0.payout.granter_signature', $signature);

        $detailResponse = $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->getJson("/api/cash-advances/{$advance->id}");

        $detailResponse->assertOk();
        $disbursedEntry = collect($detailResponse->json('audit_trail'))
            ->firstWhere('action_type', 'CASH_ADVANCE_DISBURSED');
        $this->assertNotNull($disbursedEntry);
        $this->assertSame("Method: Other (GCash Corporate) (Ref: {$referenceNumber})", $disbursedEntry['comment']);
        $diffFields = collect($disbursedEntry['changes'])->pluck('key')->all();
        $this->assertContains('payout_method', $diffFields);
        $this->assertContains('payout_method_other', $diffFields);
        $this->assertContains('granted_by', $diffFields);
        $this->assertContains('reference', $diffFields);
    }

    public function test_disburse_with_legacy_channel_and_reference_payload_remains_backwards_compatible(): void
    {
        $advance = $this->makeCashAdvance(['status' => 'approved']);

        $response = $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/disburse", [
                'channel' => 'bank_transfer',
                'reference' => 'REF-LEGACY-001',
                'password' => 'password',
            ]);

        $response->assertOk();
        $response->assertJsonPath('data.status', 'disbursed');
        $response->assertJsonPath('data.payout.payout_method', 'bank_transfer');
        $response->assertJsonPath('data.payout.reference_number', 'REF-LEGACY-001');
        $response->assertJsonPath('data.payout.granted_by', $this->approver->name);
        $response->assertJsonPath('data.payout.approved_by', 'Approver');

        $this->assertDatabaseHas('cash_advance_disbursements', [
            'cash_advance_id' => $advance->id,
            'channel' => 'bank_transfer',
            'payout_method' => 'bank_transfer',
            'reference_number' => 'REF-LEGACY-001',
            'granted_by' => $this->approver->name,
        ]);
    }

    public function test_disburse_validation_rejects_other_without_specification_and_missing_signature(): void
    {
        $advance = $this->makeCashAdvance(['status' => 'approved']);

        // Other without payout_method_other
        $missingOther = $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/disburse", [
                'granted_by' => 'Cashier Jane',
                'payout_method' => 'Other',
                'granter_signature' => 'data:image/png;base64,granterSig',
                'password' => 'password',
            ]);
        $missingOther->assertStatus(422)->assertJsonValidationErrors(['payout_method_other']);

        // payout_method sent without granter_signature
        $missingSig = $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/disburse", [
                'granted_by' => 'Cashier Jane',
                'payout_method' => 'Cash',
                'password' => 'password',
            ]);
        $missingSig->assertStatus(422)->assertJsonValidationErrors(['granter_signature']);

        // Unsupported payout_method
        $badMethod = $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/disburse", [
                'granted_by' => 'Cashier Jane',
                'payout_method' => 'Crypto',
                'granter_signature' => 'data:image/png;base64,granterSig',
                'password' => 'password',
            ]);
        $badMethod->assertStatus(422)->assertJsonValidationErrors(['payout_method']);

        // Neither channel nor payout_method
        $missingBoth = $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/disburse", [
                'password' => 'password',
            ]);
        $missingBoth->assertStatus(422)->assertJsonValidationErrors(['channel', 'payout_method']);
    }

    public function test_acknowledge_disbursed_cash_advance_populates_payout_employee_signature_and_transitions_to_signed(): void
    {
        $advance = $this->makeCashAdvance(['status' => 'approved']);
        $granterSig = 'data:image/png;base64,granterSig';
        $empSig = 'data:image/png;base64,employeeSig';

        $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/disburse", [
                'granted_by' => 'Cashier Jane',
                'payout_method' => 'E-wallet',
                'granter_signature' => $granterSig,
                'password' => 'password',
            ])
            ->assertOk();

        $ackResponse = $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken()])
            ->postJson("/api/cash-advances/{$advance->id}/acknowledge", [
                'signature' => $empSig,
            ]);

        $ackResponse->assertOk();
        $ackResponse->assertJsonPath('data.status', 'signed');
        $ackResponse->assertJsonPath('data.signature', $empSig);
        $ackResponse->assertJsonPath('data.payout.granter_signature', $granterSig);
        $ackResponse->assertJsonPath('data.payout.employee_signature', $empSig);
        $this->assertNotNull($ackResponse->json('data.acknowledged_at'));
        $this->assertNotNull($ackResponse->json('data.payout.acknowledged_at'));

        // Verify GET /api/cash-advances reflects acknowledged payout state
        $listResponse = $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken()])
            ->getJson('/api/cash-advances');

        $listResponse->assertOk();
        $listResponse->assertJsonPath('0.status', 'signed');
        $listResponse->assertJsonPath('0.payout.employee_signature', $empSig);
        $this->assertNotNull($listResponse->json('0.payout.acknowledged_at'));
    }

    public function test_disburse_blocks_self_disbursement_non_admin_and_duplicate_disbursement(): void
    {
        $ownAdvance = $this->makeCashAdvance([
            'user_id' => $this->approver->id,
            'status' => 'approved',
        ]);

        // Admin cannot disburse own cash advance
        $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$ownAdvance->id}/disburse", [
                'payout_method' => 'Cash',
                'granter_signature' => 'data:image/png;base64,sig',
                'password' => 'password',
            ])
            ->assertStatus(403);

        $empAdvance = $this->makeCashAdvance(['status' => 'approved']);

        // Regular employee cannot disburse
        $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken()])
            ->postJson("/api/cash-advances/{$empAdvance->id}/disburse", [
                'payout_method' => 'Cash',
                'granter_signature' => 'data:image/png;base64,sig',
                'password' => 'password',
            ])
            ->assertStatus(403);

        // First disburse succeeds, second returns 409 Conflict
        $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$empAdvance->id}/disburse", [
                'payout_method' => 'Cash',
                'granter_signature' => 'data:image/png;base64,sig',
                'password' => 'password',
            ])
            ->assertOk();

        $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$empAdvance->id}/disburse", [
                'payout_method' => 'Cash',
                'granter_signature' => 'data:image/png;base64,sig',
                'password' => 'password',
            ])
            ->assertStatus(409);
    }

    public function test_enrichment_uses_latest_approved_action_after_revision_cycle(): void
    {
        $firstAdmin = User::create([
            'name' => 'First Reviewer',
            'email' => 'reviewer1@example.com',
            'role' => 'admin',
            'grade' => 'L4',
            'department' => 'Accounting',
        ]);

        $advance = $this->makeCashAdvance(['status' => 'approved']);

        CashAdvanceApprovalAction::create([
            'cash_advance_id' => $advance->id,
            'approver_id' => $firstAdmin->id,
            'action' => 'revised',
            'comment' => 'Fix dates.',
            'actioned_at' => Carbon::now()->subHours(5),
        ]);

        $approvedAt = Carbon::now()->subHours(2);
        CashAdvanceApprovalAction::create([
            'cash_advance_id' => $advance->id,
            'approver_id' => $this->approver->id,
            'action' => 'approved',
            'comment' => 'All good now.',
            'actioned_at' => $approvedAt,
        ]);

        $this->withHeaders(['Authorization' => 'Bearer ' . $this->approverToken()])
            ->postJson("/api/cash-advances/{$advance->id}/disburse", [
                'payout_method' => 'Card',
                'granter_signature' => 'data:image/png;base64,cardSig',
                'password' => 'password',
            ])
            ->assertOk()
            ->assertJsonPath('data.approved_by', 'Approver Admin')
            ->assertJsonPath('data.payout.approved_by', 'Approver Admin')
            ->assertJsonPath('data.payout.payout_method', 'Card');
    }

    public function test_enrichment_omits_payout_for_pending_and_approved_and_synthesizes_fallback_for_disbursed_without_row(): void
    {
        $pending = $this->makeCashAdvance(['status' => 'pending']);
        $approved = $this->makeCashAdvance(['status' => 'approved']);
        $disbursedLegacy = $this->makeCashAdvance(['status' => 'disbursed']);

        $pendingResp = $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken()])
            ->getJson("/api/cash-advances/{$pending->id}")
            ->assertOk();
        $this->assertNull($pendingResp->json('payout'));
        $this->assertNull($pendingResp->json('approved_by'));

        $approvedResp = $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken()])
            ->getJson("/api/cash-advances/{$approved->id}")
            ->assertOk();
        $this->assertNull($approvedResp->json('payout'));
        $this->assertSame('Approver', $approvedResp->json('approved_by'));
        $this->assertNotNull($approvedResp->json('approved_at'));

        $disbursedResp = $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken()])
            ->getJson("/api/cash-advances/{$disbursedLegacy->id}")
            ->assertOk();
        $this->assertSame('Finance / Admin', $disbursedResp->json('payout.granted_by'));
        $this->assertSame('Cash', $disbursedResp->json('payout.payout_method'));
        $this->assertSame('Approver', $disbursedResp->json('payout.approved_by'));
    }

    public function test_disbursement_payout_columns_migration_down_and_up_cleanly(): void
    {
        $columns = ['granted_by', 'payout_method', 'payout_method_other', 'granter_signature'];
        $this->assertTrue(Schema::hasColumns('cash_advance_disbursements', $columns));

        $migration = require base_path('app/Modules/CashAdvances/Database/Migrations/2026_11_21_000001_add_payout_fields_to_cash_advance_disbursements_table.php');
        $migration->down();

        foreach ($columns as $column) {
            $this->assertFalse(Schema::hasColumn('cash_advance_disbursements', $column));
        }

        $migration->up();
        $this->assertTrue(Schema::hasColumns('cash_advance_disbursements', $columns));
    }
}
