<?php

namespace Tests\Feature;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestAuditTrailTest extends TestCase
{
    use RefreshDatabase;

    public function test_audit_log_service_builds_sanitized_reimbursement_trail_and_masks_ip_for_employee(): void
    {
        $employee = User::create([
            'email' => 'employee@serms.com',
            'name' => 'Juan Dela Cruz',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'OPERATIONS',
        ]);
        $admin = User::create([
            'email' => 'admin@serms.com',
            'name' => 'Alex Reyes',
            'role' => 'admin',
            'grade' => 'EXEC',
            'department' => 'FINANCE',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $employee->id,
            'description' => 'Field Client Lunch',
            'amount' => 1200.00,
            'date' => '2026-10-20',
            'status' => 'revise',
            'revision_count' => 1,
            'admin_notes' => 'Please attach itemized OR.',
            'submitted_by_name' => $employee->name,
        ]);

        AuditLogService::log(
            actorId: $employee->id,
            actorRole: 'employee',
            actionType: 'CLAIM_SUBMITTED',
            entityType: 'reimbursement',
            entityId: $reimbursement->id,
            beforeState: null,
            afterState: ['amount' => '1200.00', 'description' => 'Field Client Lunch'],
            ipAddress: '10.0.0.15'
        );

        AuditLogService::log(
            actorId: $admin->id,
            actorRole: 'admin',
            actionType: 'CLAIM_REVISED',
            entityType: 'reimbursement',
            entityId: $reimbursement->id,
            beforeState: ['status' => 'pending', 'amount' => '1200.00'],
            afterState: ['status' => 'revise', 'amount' => '1500.00', 'admin_notes' => 'Please attach itemized OR.'],
            ipAddress: '192.168.1.10'
        );

        $forAdmin = AuditLogService::enrichReimbursement($reimbursement->fresh(['user', 'payout']), true);
        $trailAdmin = $forAdmin->getAttribute('audit_trail');

        $this->assertCount(2, $trailAdmin);
        $this->assertSame('CLAIM_SUBMITTED', $trailAdmin[0]['action_type']);
        $this->assertSame('Juan Dela Cruz', $trailAdmin[0]['actor_name']);
        $this->assertSame('10.0.0.15', $trailAdmin[0]['ip_address']);

        $this->assertSame('CLAIM_REVISED', $trailAdmin[1]['action_type']);
        $this->assertSame('Alex Reyes', $trailAdmin[1]['actor_name']);
        $this->assertSame('Please attach itemized OR.', $trailAdmin[1]['comment']);
        $this->assertSame('192.168.1.10', $trailAdmin[1]['ip_address']);
        $this->assertNotEmpty($trailAdmin[1]['changes']);
        $this->assertSame('Amount', $trailAdmin[1]['changes'][0]['field']);

        $forEmployee = AuditLogService::enrichReimbursement($reimbursement->fresh(['user', 'payout']), false);
        $trailEmployee = $forEmployee->getAttribute('audit_trail');
        $this->assertNull($trailEmployee[0]['ip_address']);
        $this->assertNull($trailEmployee[1]['ip_address']);
    }

    public function test_reimbursement_endpoints_return_enriched_audit_trail(): void
    {
        $employee = User::create([
            'email' => 'employee2@serms.com',
            'name' => 'Maria Santos',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'SALES',
        ]);
        $admin = User::create([
            'email' => 'admin2@serms.com',
            'name' => 'Finance Admin',
            'role' => 'admin',
            'grade' => 'EXEC',
            'department' => 'accounting',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $employee->id,
            'description' => 'Client Transportation',
            'amount' => 850.00,
            'date' => '2026-10-21',
            'status' => 'pending',
            'submitted_by_name' => $employee->name,
        ]);

        $employeeToken = $this->generateMockToken([
            'email' => $employee->email,
            'role' => 'employee',
            'department' => 'SALES',
        ]);
        $adminToken = $this->generateMockToken([
            'email' => $admin->email,
            'role' => 'admin',
            'department' => 'accounting',
        ]);

        $resEmployee = $this->withHeaders(['Authorization' => 'Bearer ' . $employeeToken])
            ->getJson('/api/reimbursements');
        $resEmployee->assertOk();
        $resEmployee->assertJsonStructure([
            '*' => ['id', 'audit_trail'],
        ]);
        $this->assertNotEmpty($resEmployee->json('0.audit_trail'));
        $this->assertNull($resEmployee->json('0.audit_trail.0.ip_address'));

        $resAdmin = $this->withHeaders(['Authorization' => 'Bearer ' . $adminToken])
            ->getJson("/api/reimbursements/{$reimbursement->id}");
        $resAdmin->assertOk();
        $this->assertNotEmpty($resAdmin->json('audit_trail'));
    }

    public function test_cash_advance_mutations_write_audit_logs_and_endpoint_returns_unified_audit_trail(): void
    {
        $employee = User::create([
            'email' => 'employee3@serms.com',
            'name' => 'Carlo Gomez',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'OPERATIONS',
        ]);
        $admin = User::create([
            'email' => 'admin3@serms.com',
            'name' => 'Approver Admin',
            'role' => 'admin',
            'grade' => 'EXEC',
            'department' => 'accounting',
        ]);

        $adminToken = $this->generateMockToken([
            'email' => $admin->email,
            'role' => 'admin',
            'department' => 'accounting',
        ]);

        $service = app(\App\Modules\CashAdvances\Services\CashAdvanceService::class);

        $advance = $service->createAdvance($employee, [
            'purpose' => 'Regional Tech Summit',
            'amount' => 5000.00,
            'expected_disbursement_date' => '2026-10-25',
            'expected_liquidation_date' => '2026-11-05',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => 'cash_advance',
            'entity_id' => $advance->id,
            'action_type' => 'CASH_ADVANCE_SUBMITTED',
        ]);

        $res = $this->withHeaders(['Authorization' => 'Bearer ' . $adminToken])
            ->getJson("/api/cash-advances/{$advance->id}");
        $res->assertOk();
        $trail = $res->json('audit_trail');
        $this->assertNotEmpty($trail);
        $this->assertSame('CASH_ADVANCE_SUBMITTED', $trail[0]['action_type']);
    }

    public function test_liquidation_mutations_and_unified_lifecycle_audit_trail(): void
    {
        $employee = User::create([
            'email' => 'employee4@serms.com',
            'name' => 'Elena Cruz',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'SALES',
        ]);
        $admin = User::create([
            'email' => 'admin4@serms.com',
            'name' => 'Accounting Auditor',
            'role' => 'admin',
            'grade' => 'EXEC',
            'department' => 'accounting',
        ]);

        $adminToken = $this->generateMockToken([
            'email' => $admin->email,
            'role' => 'admin',
            'department' => 'accounting',
        ]);
        $employeeToken = $this->generateMockToken([
            'email' => $employee->email,
            'role' => 'employee',
            'department' => 'SALES',
        ]);

        $caService = app(\App\Modules\CashAdvances\Services\CashAdvanceService::class);
        $advance = $caService->createAdvance($employee, [
            'purpose' => 'Supplier Visit',
            'amount' => 3000.00,
            'expected_disbursement_date' => '2026-10-25',
            'expected_liquidation_date' => '2026-11-05',
        ]);

        // Acknowledge advance so it enters signed state
        $advance->update(['status' => 'signed', 'acknowledged_at' => now(), 'signature' => 'mock_sig']);

        $receipt = \App\Modules\Reimbursements\Models\Receipt::create([
            'uploaded_by' => $employee->id,
            'file_path' => ['receipts/rcpt_liq_test.png'],
            'file_hash' => [str_repeat('b', 64)],
            'file_type' => ['image/png'],
            'file_size_bytes' => [2048],
            'vendor_name' => 'Fuel Depot',
            'total_amount' => 2800.00,
            'transaction_date' => '2026-10-26',
            'status' => 'pending',
        ]);

        $resLiq = $this->withHeaders(['Authorization' => 'Bearer ' . $employeeToken])
            ->postJson('/api/liquidations', [
                'cash_advance_id' => $advance->id,
                'receipts' => json_encode([['id' => $receipt->id]]),
                'total_expense_amount' => 2800.00,
                'shortfall_explanation' => 'Remaining 200 returned.',
            ]);
        $resLiq->assertStatus(210);
        $liqId = $resLiq->json('data.id');

        $this->assertDatabaseHas('audit_logs', [
            'entity_type' => 'liquidation',
            'entity_id' => $liqId,
            'action_type' => 'LIQUIDATION_SUBMITTED',
        ]);

        // Fetch as admin
        $resAdmin = $this->withHeaders(['Authorization' => 'Bearer ' . $adminToken])
            ->getJson("/api/liquidations/{$liqId}");
        $resAdmin->assertOk();
        $adminTrail = $resAdmin->json('audit_trail');
        $this->assertNotEmpty($adminTrail);

        // Fetch as employee
        $resEmp = $this->withHeaders(['Authorization' => 'Bearer ' . $employeeToken])
            ->getJson("/api/liquidations/{$liqId}");
        $resEmp->assertOk();
        $empTrail = $resEmp->json('audit_trail');
        $this->assertNotEmpty($empTrail);
        foreach ($empTrail as $entry) {
            $this->assertNull($entry['ip_address'], 'IP should be masked for employee');
        }
    }
}


