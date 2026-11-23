<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Payout;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceApprovalAction;
use App\Modules\CashAdvances\Models\CashAdvanceDisbursement;
use App\Modules\CashAdvances\Models\CashAdvanceDocument;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Liquidations\Models\PenaltyRecord;
use App\Modules\AuditLogs\Models\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ReportExportTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $otherEmployee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@sbsi.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Operations',
        ]);

        $this->otherEmployee = User::create([
            'name' => 'Maria Santos',
            'email' => 'maria@sbsi.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Sales',
        ]);

        $this->admin = User::create([
            'name' => 'Finance Admin',
            'email' => 'admin@sbsi.com',
            'role' => 'admin',
            'grade' => 'L5',
            'department' => 'Accounting',
        ]);
    }

    private function authHeadersFor(User $user): array
    {
        $parts = explode(' ', $user->name, 2);
        $token = $this->generateMockToken([
            'email' => $user->email,
            'role' => $user->role,
            'department' => $user->department ?? 'Operations',
            'first_name' => $parts[0] ?? 'User',
            'last_name' => $parts[1] ?? 'Test',
        ]);

        return [
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/pdf',
        ];
    }

    public function test_employee_can_export_own_reimbursement_report_as_pdf_with_required_details(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/r1.jpg'],
            'file_hash' => [str_repeat('a', 64)],
            'file_type' => ['jpeg'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Mercury Drug',
            'transaction_date' => '2026-10-10',
            'total_amount' => 1250.50,
            'invoice_number' => 'INV-1001',
            'status' => 'approved',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Field Medical Supplies',
            'user_comment' => 'Urgent reagent transport supplies',
            'amount' => 1250.50,
            'date' => '2026-10-10',
            'status' => 'granted',
            'submitted_by_name' => $this->employee->name,
            'approved_by' => 'Finance Admin',
            'approved_at' => '2026-10-12 09:30:00',
        ]);
        $reimbursement->receipts()->attach([$receipt->id]);

        Payout::create([
            'reimbursement_id' => $reimbursement->id,
            'request_date' => '2026-10-10',
            'approved_at' => '2026-10-12 09:30:00',
            'granted_at' => '2026-10-14 15:00:00',
            'approved_by' => 'Finance Admin',
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Cash',
            'amount' => 1250.50,
            'granter_signature' => 'data:image/png;base64,sig',
        ]);

        $response = $this->withHeaders($this->authHeadersFor($this->employee))
            ->get("/api/reports/reimbursement/{$reimbursement->id}");

        $response->assertStatus(200);
        $this->assertStringContainsString('application/pdf', $response->headers->get('Content-Type'));
        $this->assertStringContainsString(
            "Reimbursement-Report-#{$reimbursement->id}.pdf",
            $response->headers->get('Content-Disposition')
        );

        $content = $response->getContent();
        $this->assertStringStartsWith('%PDF-1.4', $content);
        $this->assertStringContainsString('SCIENCE BIOTECH SPECIALTIES INC. \(SBSI\)', $content);
        $this->assertStringContainsString("Reimbursement Report #{$reimbursement->id}", $content);
        $this->assertStringContainsString('Juan Dela Cruz', $content);
        $this->assertStringContainsString('1,250.50', $content);
        $this->assertStringContainsString('Urgent reagent transport supplies', $content);
        $this->assertStringContainsString('Mercury Drug', $content);
        $this->assertStringContainsString('Finance Admin', $content);
        $this->assertStringContainsString('Cashier Jane', $content);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'action_type' => 'REPORT_EXPORTED',
            'entity_type' => 'reimbursement',
            'entity_id' => $reimbursement->id,
        ]);
    }

    public function test_employee_can_export_own_cash_advance_and_admin_can_export_any_cash_advance(): void
    {
        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Davao Hospital Diagnostic Calibration',
            'amount' => 8000.00,
            'outstanding_balance' => 8000.00,
            'expected_disbursement_date' => '2026-10-05',
            'expected_liquidation_date' => '2026-10-15',
            'status' => 'disbursed',
        ]);

        CashAdvanceDocument::create([
            'cash_advance_id' => $advance->id,
            'file_name' => 'calibration-order.pdf',
            'file_path' => 'documents/calibration-order.pdf',
            'file_type' => 'pdf',
        ]);

        CashAdvanceApprovalAction::create([
            'cash_advance_id' => $advance->id,
            'approver_id' => $this->admin->id,
            'action' => 'approved',
            'comment' => 'Approved for regional field trip',
            'actioned_at' => '2026-10-04 10:00:00',
        ]);

        CashAdvanceDisbursement::create([
            'cash_advance_id' => $advance->id,
            'disbursed_by_id' => $this->admin->id,
            'channel' => 'Bank Transfer',
            'reference_number' => 'REF-CA-8000',
            'disbursement_date' => '2026-10-05',
        ]);

        $response = $this->withHeaders($this->authHeadersFor($this->admin))
            ->get("/api/reports/cash-advance/{$advance->id}");

        $response->assertStatus(200);
        $this->assertStringContainsString(
            "Cash-Advance-Report-#{$advance->id}.pdf",
            $response->headers->get('Content-Disposition')
        );

        $content = $response->getContent();
        $this->assertStringStartsWith('%PDF-1.4', $content);
        $this->assertStringContainsString('Davao Hospital Diagnostic Calibration', $content);
        $this->assertStringContainsString('8,000.00', $content);
        $this->assertStringContainsString('calibration-order.pdf', $content);
        $this->assertStringContainsString('Approved for regional field trip', $content);
        $this->assertStringContainsString('Finance Admin', $content);

        // Ensure exporting does NOT mutate cash advance status
        $this->assertEquals('disbursed', $advance->fresh()->status);
    }

    public function test_liquidation_report_exports_both_submitted_liquidation_and_signed_cash_advance_fallback(): void
    {
        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Cebu Lab Installation',
            'amount' => 5000.00,
            'outstanding_balance' => 1500.00,
            'expected_disbursement_date' => '2026-10-01',
            'expected_liquidation_date' => '2026-10-10',
            'status' => 'incomplete',
            'acknowledged_at' => '2026-10-02 09:00:00',
        ]);

        PenaltyRecord::create([
            'cash_advance_id' => $advance->id,
            'days_overdue' => 3,
            'penalty_amount' => 150.00,
        ]);

        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/liq1.jpg'],
            'file_hash' => [str_repeat('b', 64)],
            'file_type' => ['jpeg'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Cebu Pacific',
            'transaction_date' => '2026-10-03',
            'total_amount' => 3500.00,
            'status' => 'approved',
        ]);

        $liquidation = Liquidation::create([
            'cash_advance_id' => $advance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [$receipt->id],
            'total_expense_amount' => 3500.00,
            'outstanding_balance' => 1500.00,
            'shortfall_explanation' => 'Remaining cash to be returned to cashier',
            'admin_note' => 'Verified flight receipt',
        ]);

        // 1. Export by liquidation ID (Admin)
        $response = $this->withHeaders($this->authHeadersFor($this->admin))
            ->get("/api/reports/liquidation/{$liquidation->id}");

        $response->assertStatus(200);
        $this->assertStringContainsString(
            "Liquidation-Report-#{$liquidation->id}.pdf",
            $response->headers->get('Content-Disposition')
        );
        $content = $response->getContent();
        $this->assertStringContainsString('Cebu Lab Installation', $content);
        $this->assertStringContainsString('5,000.00', $content);
        $this->assertStringContainsString('3,500.00', $content);
        $this->assertStringContainsString('1,500.00', $content);
        $this->assertStringContainsString('150.00', $content);
        $this->assertStringContainsString('Cebu Pacific', $content);
        $this->assertStringContainsString('Verified flight receipt', $content);

        // 2. Export pre-submission Signed cash advance fallback (?by=cash_advance)
        $signedAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Iloilo Field Service',
            'amount' => 3000.00,
            'outstanding_balance' => 3000.00,
            'expected_disbursement_date' => '2026-10-18',
            'expected_liquidation_date' => '2026-10-28',
            'status' => 'signed',
            'acknowledged_at' => '2026-10-18 14:00:00',
        ]);

        $fallbackResponse = $this->withHeaders($this->authHeadersFor($this->employee))
            ->get("/api/reports/liquidation/{$signedAdvance->id}?by=cash_advance");

        $fallbackResponse->assertStatus(200);
        $this->assertStringContainsString('Iloilo Field Service', $fallbackResponse->getContent());
    }

    public function test_employee_cannot_export_another_employees_record_returns_403(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Private Claim',
            'amount' => 900.00,
            'date' => '2026-10-10',
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Private Advance',
            'amount' => 2000.00,
            'outstanding_balance' => 2000.00,
            'expected_disbursement_date' => '2026-10-10',
            'expected_liquidation_date' => '2026-10-17',
            'status' => 'pending',
        ]);

        $reimbResponse = $this->withHeaders($this->authHeadersFor($this->otherEmployee))
            ->get("/api/reports/reimbursement/{$reimbursement->id}");
        $reimbResponse->assertStatus(403);

        $caResponse = $this->withHeaders($this->authHeadersFor($this->otherEmployee))
            ->get("/api/reports/cash-advance/{$advance->id}");
        $caResponse->assertStatus(403);

        $this->assertEquals(0, AuditLog::where('action_type', 'REPORT_EXPORTED')->count());
    }

    public function test_liquidation_report_purpose_does_not_overlap_record_summary_fields(): void
    {
        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'pang rebond',
            'amount' => 10000.00,
            'outstanding_balance' => 10000.00,
            'expected_disbursement_date' => '2026-10-21',
            'expected_liquidation_date' => '2026-10-22',
            'status' => 'signed',
            'acknowledged_at' => '2026-10-21 10:00:00',
        ]);

        $response = $this->withHeaders($this->authHeadersFor($this->employee))
            ->get("/api/reports/liquidation/{$advance->id}?by=cash_advance");

        $response->assertStatus(200);
        $content = $response->getContent();

        $this->assertStringContainsString('PURPOSE / BUSINESS RATIONALE', $content);
        $this->assertStringContainsString('pang rebond', $content);
        $this->assertStringContainsString('PHP 10,000.00', $content);

        // Extract the Y coordinate of AMOUNT ADVANCED value (PHP 10,000.00) in RECORD SUMMARY
        // Look for AMOUNT ADVANCED label followed by value Td
        preg_match('/\(AMOUNT ADVANCED\)\s+Tj\s+ET\s+BT\s+\/F2\s+8\.5\s+Tf\s+[\d\.]+\s+[\d\.]+\s+[\d\.]+\s+rg\s+[\d\.]+\s+([\d\.]+)\s+Td\s+\(PHP 10,000\.00\) Tj/', $content, $amountMatch);
        $this->assertNotEmpty($amountMatch, 'Amount Advanced value coordinate in Record Summary not found');
        $amountY = (float) $amountMatch[1];

        // Extract the callout rectangle lower-left Y and height
        // Format: 50.00 <boxY> 512.00 <boxH> re f
        preg_match('/50(?:\.0)?\s+([\d\.]+)\s+512(?:\.0)?\s+([\d\.]+)\s+re f/', $content, $rectMatch);
        $this->assertNotEmpty($rectMatch, 'Purpose callout box rectangle not found');
        $boxBottomY = (float) $rectMatch[1];
        $boxHeight = (float) $rectMatch[2];
        $boxTopY = $boxBottomY + $boxHeight;

        // The top of the Purpose box MUST be strictly lower than the Amount Advanced text baseline
        $this->assertLessThan(
            $amountY - 5.0,
            $boxTopY,
            "Purpose box top ({$boxTopY}) overlaps Amount Advanced text ({$amountY})"
        );
    }
}
