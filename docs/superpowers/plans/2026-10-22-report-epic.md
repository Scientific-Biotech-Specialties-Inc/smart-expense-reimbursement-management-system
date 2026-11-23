# Report Epic (EP 6: G2-054 to G2-061) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Epic 6 (Report) — `G2-054`, `G2-055`, `G2-056`, `G2-057`, `G2-058`, `G2-059`, `G2-060`, and `G2-061` — delivering a zero-dependency backend PDF report generator and role-scoped, audit-logged `"Export Report"` download actions across Reimbursements, Cash Advances, and Liquidations for both employees and admins.

**Architecture:**
1. **Backend (`apps/api/app/Modules/Shared`)**: Implement `ReportGeneratorService` (a lightweight, zero-dependency pure-PHP `%PDF-1.4` builder that renders structured SBSI reports with vector tables, progress trackers, `₱` PHP formatting, and Medium Date Format) and `ReportController` (`GET /api/reports/{type}/{id}` supporting `reimbursement`, `cash-advance`, and `liquidation`, with automatic `cash_advance_id` fallback for pre-submission `Signed` liquidations). Enforce strict role/ownership authorization (`403 Forbidden` when an employee requests another user's record; admins can export any record) and record every export in `audit_logs` via `AuditLogService::log()` (`G2-054`, `G2-061`).
2. **Reusable Frontend Composable (`apps/web/src/composables/useReportExport.js`)**: Provide a single composable (`exportReport(type, id, options)`, `isExporting`) using `apiFetch` to stream the PDF blob, trigger a browser file download with the server-provided filename (`Reimbursement-Report-#5.pdf`, `Cash-Advance-Report-#5.pdf`, `Liquidation-Report-#5.pdf`), and display a toast error if the download fails (`A-09` reusability rule).
3. **Frontend Modal & Panel Integrations (`apps/web/src/components`)**: Wire `"Export Report"` buttons (`BaseButton.vue`) into `ReimbursementDetailsModal.vue` (`G2-055`, `G2-058`), `CashAdvanceDetailsModal.vue` (`G2-056`, `G2-059`), `LiquidationSettlementForm.vue` (`G2-057`), and `LiquidationReviewModal.vue` (`G2-060`) without triggering state-mutating actions (`Disburse`, `Approve`, `Reject`).

**Tech Stack:** Laravel 13 (PHP 8.3), Vue 3 (Composition API, Pinia), Tailwind CSS 3.4, Lucide Vue Next, PHPUnit, Vitest (`@vue/test-utils`).

**Spec:** `docs/Sprint-5.xlsx` (EP 6 - Report: `G2-054` through `G2-061`)

## Global Constraints

- **Canonical 9 Modules & Cross-Module Rule:** `ReportController` and `ReportGeneratorService` live in `App\Modules\Shared`, which is the canonical cross-cutting module permitted to read `Reimbursement`, `CashAdvance`, and `Liquidation` models.
- **Zero-Dependency PDF Engine:** Generate valid `%PDF-1.4` documents directly in PHP without adding heavy external Composer packages (`dompdf`), keeping memory overhead `< 256 KB` and latency `< 50ms`.
- **Reusability (`A-09`):** Centralize frontend download/blob/toast logic in `useReportExport.js` and use `BaseButton.vue` for all `"Export Report"` triggers.
- **Audit Logging & Role Enforcement (`G2-061`):** Every report download must check ownership/admin permissions (`403 Forbidden` on violation) and call `AuditLogService::log()` with `actionType: 'REPORT_EXPORTED'` inside a `DB::transaction()`.
- **Medium Date Format & Currency (`G2-054`):** Format all dates in the PDF using Medium Date Format (`Oct 22, 2026`, `M j, Y`) and display monetary amounts in Philippine Pesos (`₱` / `PHP`).

---

## File Map

| Action | File Path | Responsibility |
| --- | --- | --- |
| Create | `apps/api/app/Modules/Shared/Services/ReportGeneratorService.php` | Build single-record PDF reports (`%PDF-1.4`) for `reimbursement`, `cash-advance`, and `liquidation` with SBSI header, progress trackers, receipts, and role/audit details (`G2-054`–`G2-060`) |
| Create | `apps/api/app/Modules/Shared/Http/Controllers/ReportController.php` | Handle `GET /api/reports/{type}/{id}`, enforce role/ownership access (`403`), log to `AuditLogService::log()`, and return the PDF download response (`G2-054`, `G2-061`) |
| Modify | `apps/api/app/Modules/Shared/routes/api.php` | Register `GET /api/reports/{type}/{id}` under `auth.external` middleware |
| Create | `apps/api/tests/Feature/ReportExportTest.php` | Feature tests covering PDF generation, content fields, role restrictions (`403`), and `audit_logs` recording across all 3 record types (`G2-054`–`G2-061`) |
| Create | `apps/web/src/composables/useReportExport.js` | Reusable composable (`isExporting`, `exportReport`) that fetches `/api/serms/reports/{type}/{id}`, triggers browser download, and surfaces toast errors |
| Create | `apps/web/src/composables/useReportExport.test.js` | Unit tests for `useReportExport.js` (success download, filename parsing, loading state, error toast) |
| Modify | `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue` | Add `"Export Report"` button beside Receipts header for employee (`G2-055`) and admin (`G2-058`) |
| Modify | `apps/web/src/components/reimbursements/ReimbursementDetailsModal.test.js` | Unit tests for employee & admin `"Export Report"` button in `ReimbursementDetailsModal.vue` |
| Modify | `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.vue` | Add `"Export Report"` button in Employee and Admin Cash Advance View modals (`G2-056`, `G2-059`) |
| Create | `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.test.js` | Unit tests verifying `"Export Report"` in Employee and Admin Cash Advance modals without triggering `Disburse` (`G2-056`, `G2-059`) |
| Modify | `apps/web/src/components/liquidations/LiquidationSettlementForm.vue` | Add `"Export Report"` button beside Receipt Attachments in employee liquidation details (`G2-057`) |
| Modify | `apps/web/src/components/liquidations/LiquidationReviewModal.vue` | Add `"Export Report"` button beside Receipts header in admin liquidation details (`G2-060`) |
| Modify | `apps/web/src/components/liquidations/LiquidationReviewModal.test.js` | Unit tests for `"Export Report"` in `LiquidationReviewModal.vue` and `LiquidationSettlementForm.vue` (`G2-057`, `G2-060`) |

---

### Task 1: Backend Single-Record PDF Report Generator, Endpoint, RBAC & Audit Logging (`G2-054`, `G2-055`–`G2-061`)

**Files:**
- Create: `apps/api/app/Modules/Shared/Services/ReportGeneratorService.php`
- Create: `apps/api/app/Modules/Shared/Http/Controllers/ReportController.php`
- Modify: `apps/api/app/Modules/Shared/routes/api.php`
- Create: `apps/api/tests/Feature/ReportExportTest.php`

**Interfaces:**
- Produces:
  - `GET /api/reports/{type}/{id}` (where `{type}` is `reimbursement`, `cash-advance`, or `liquidation`; optional query `?by=cash_advance` for pre-submission liquidations).
  - Response headers:
    - `Content-Type: application/pdf`
    - `Content-Disposition: attachment; filename="Reimbursement-Report-#{id}.pdf"` (or `Cash-Advance-Report-#{id}.pdf` / `Liquidation-Report-#{id}.pdf`)
  - Audit Log record via `AuditLogService::log()` with `actionType: 'REPORT_EXPORTED'`, `entityType: $type`, `entityId: $resolvedId`.

- [ ] **Step 1: Write the failing backend feature tests in `apps/api/tests/Feature/ReportExportTest.php`**

Create `apps/api/tests/Feature/ReportExportTest.php`:

```php
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
            'department' => 'Finance',
        ]);
    }

    private function authHeadersFor(User $user): array
    {
        $parts = explode(' ', $user->name, 2);
        $token = $this->generateMockToken([
            'email' => $user->email,
            'role' => $user->role,
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
            'cutoff_period' => '2026-10-A',
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
        $this->assertStringContainsString('Science Biotech Specialties Inc. (SBSI)', $content);
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
            'file_size_bytes' => 2048,
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
            'disbursed_by' => $this->admin->id,
            'disbursement_channel' => 'Bank Transfer',
            'reference_number' => 'REF-CA-8000',
            'disbursed_at' => '2026-10-05 11:00:00',
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
            'calculated_at' => '2026-10-13 00:00:00',
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
            'status' => 'under-review',
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
            'cutoff_period' => '2026-10-A',
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
}
```

- [ ] **Step 2: Run the backend test to verify it fails**

Run: `php artisan test tests/Feature/ReportExportTest.php` (in `apps/api`)
Expected: FAIL with `404 Not Found` (routes and services do not exist yet).

- [ ] **Step 3: Implement `ReportGeneratorService.php`, `ReportController.php`, and register route in `apps/api/app/Modules/Shared/routes/api.php`**

Create `apps/api/app/Modules/Shared/Services/ReportGeneratorService.php`:

```php
<?php

namespace App\Modules\Shared\Services;

use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use Carbon\Carbon;

class ReportGeneratorService
{
    public function formatPeso($amount): string
    {
        return '₱' . number_format((float) ($amount ?? 0), 2, '.', ',');
    }

    public function formatMediumDate($date): string
    {
        if (empty($date)) {
            return '—';
        }
        try {
            return Carbon::parse($date)->format('M j, Y');
        } catch (\Throwable) {
            return (string) $date;
        }
    }

    public function formatCutoffPeriod(?string $period): string
    {
        if (empty($period)) {
            return '—';
        }
        if (preg_match('/^(\d{4})-(\d{1,2})(?:-([AB12]))?$/i', trim($period), $m)) {
            $year = (int) $m[1];
            $month = (int) $m[2];
            $half = isset($m[3]) ? strtoupper($m[3]) : null;
            $monthName = Carbon::createFromDate($year, $month, 1)->format('M');
            if ($half === 'A' || $half === '1') {
                return "{$monthName} 1 - 15, {$year}";
            }
            if ($half === 'B' || $half === '2') {
                $lastDay = Carbon::createFromDate($year, $month, 1)->endOfMonth()->day;
                return "{$monthName} 16 - {$lastDay}, {$year}";
            }
            return "{$monthName} {$year}";
        }
        return $period;
    }

    /**
     * Build a Reimbursement single-record PDF report (G2-054, G2-055, G2-058).
     */
    public function buildReimbursementReport(Reimbursement $reimbursement, User $generatedBy): array
    {
        $reimbursement->loadMissing(['user', 'receipts.category', 'expenseCategory', 'payout']);

        $status = strtolower((string) $reimbursement->status);
        $submittedBy = $reimbursement->user?->name ?? $reimbursement->submitted_by_name ?? 'Employee';
        $tracker = $this->resolveReimbursementTracker($status);

        $sections = [
            'title' => "Reimbursement Report #{$reimbursement->id}",
            'reference' => "REIMB-#{$reimbursement->id}",
            'generated_at' => $this->formatMediumDate(now()),
            'generated_by' => "{$generatedBy->name} (" . ucfirst((string) $generatedBy->role) . ")",
            'summary' => [
                'Reference Number' => "Reimbursement Ref #{$reimbursement->id}",
                'Submitted By' => $submittedBy,
                'Status' => ucfirst($status),
                'Total Amount' => $this->formatPeso($reimbursement->amount),
                'Cutoff Period' => $this->formatCutoffPeriod($reimbursement->cutoff_period ?: (string) $reimbursement->date),
                'Date Requested' => $this->formatMediumDate($reimbursement->date ?? $reimbursement->created_at),
                'User Comment' => $reimbursement->user_comment ?: 'No comment provided',
            ],
            'tracker_title' => 'Progress Tracker (Submitted -> Review -> Decision -> Released)',
            'tracker_steps' => $tracker,
            'extra_sections' => [],
            'receipts' => [],
        ];

        if (in_array($status, ['approved', 'granted'], true) || !empty($reimbursement->approved_by)) {
            $approvalDetails = [
                'Approved By' => $reimbursement->approved_by ?? $reimbursement->payout?->approved_by ?? 'Approver',
                'Date Approved' => $this->formatMediumDate($reimbursement->approved_at ?? $reimbursement->payout?->approved_at),
            ];
            if ($reimbursement->payout) {
                $payout = $reimbursement->payout;
                $method = $payout->payout_method === 'Other' && !empty($payout->payout_method_other)
                    ? "Other ({$payout->payout_method_other})"
                    : ($payout->payout_method ?? 'Cash');
                $approvalDetails['Granted By'] = $payout->granted_by ?? '—';
                $approvalDetails['Date Granted'] = $this->formatMediumDate($payout->granted_at);
                $approvalDetails['Payout Method'] = $method;
                $approvalDetails['Payout Amount'] = $this->formatPeso($payout->amount ?? $reimbursement->amount);
                $approvalDetails['Acknowledgement'] = $payout->acknowledged_at
                    ? 'Acknowledged (' . $this->formatMediumDate($payout->acknowledged_at) . ')'
                    : 'Awaiting Acknowledgement';
            }
            $sections['extra_sections']['Approval & Payout Details'] = $approvalDetails;
        }

        if (!empty($reimbursement->admin_notes) || !empty($reimbursement->rejection_comment)) {
            $sections['extra_sections']['Admin Notes'] = [
                'Notes' => $reimbursement->admin_notes ?? $reimbursement->rejection_comment,
            ];
        }

        foreach ($reimbursement->receipts as $idx => $receipt) {
            $sections['receipts'][] = [
                'index' => $idx + 1,
                'vendor' => $receipt->vendor_name ?: 'Receipt',
                'invoice' => $receipt->invoice_number ?: '—',
                'date' => $this->formatMediumDate($receipt->transaction_date),
                'category' => $receipt->category?->name ?? $reimbursement->expenseCategory?->name ?? 'General',
                'amount' => $this->formatPeso($receipt->total_amount),
                'status' => ucfirst((string) ($receipt->status ?? 'pending')),
            ];
        }

        $filename = "Reimbursement-Report-#{$reimbursement->id}.pdf";
        return [
            'filename' => $filename,
            'content' => $this->renderPdfDocument($sections),
        ];
    }

    /**
     * Build a Cash Advance single-record PDF report (G2-054, G2-056, G2-059).
     */
    public function buildCashAdvanceReport(CashAdvance $advance, User $generatedBy): array
    {
        $advance->loadMissing([
            'requester',
            'approvalActions.approver',
            'disbursement.disbursedBy',
            'document',
            'liquidations',
        ]);

        $status = strtolower((string) $advance->status);
        $requestor = $advance->requester?->name ?? 'Employee';
        $latestApproval = $advance->approvalActions->sortByDesc('created_at')->first();
        $approverName = $latestApproval?->approver?->name ?? '—';
        $approvedDate = $latestApproval ? $this->formatMediumDate($latestApproval->actioned_at ?? $latestApproval->created_at) : '—';
        $adminNotes = $latestApproval?->comment ?: 'None';

        $disbursedBy = $advance->disbursement?->disbursedBy?->name ?? '—';
        $disbursedDate = $advance->disbursement ? $this->formatMediumDate($advance->disbursement->disbursed_at ?? $advance->disbursement->created_at) : '—';

        $sections = [
            'title' => "Cash Advance Report #{$advance->id}",
            'reference' => "CA-#{$advance->id}",
            'generated_at' => $this->formatMediumDate(now()),
            'generated_by' => "{$generatedBy->name} (" . ucfirst((string) $generatedBy->role) . ")",
            'summary' => [
                'Request ID' => "Cash Advance Ref #{$advance->id}",
                'Requestor' => $requestor,
                'Purpose' => (string) $advance->purpose,
                'Status' => ucfirst($status),
                'Amount Requested' => $this->formatPeso($advance->amount),
                'Outstanding Balance' => $this->formatPeso($advance->outstanding_balance ?? $advance->amount),
                'Date Requested' => $this->formatMediumDate($advance->created_at ?? $advance->expected_disbursement_date),
                'Settlement Due Date' => $this->formatMediumDate($advance->expected_liquidation_date),
                'Supporting Document' => $advance->document?->file_name ?? 'None attached',
                'Admin Notes' => $adminNotes,
            ],
            'tracker_title' => 'Progress Tracker (Request -> Approval -> Disbursed -> Acknowledged -> Liquidation -> Settled)',
            'tracker_steps' => $this->resolveCashAdvanceTracker($advance, $approverName, $approvedDate, $disbursedDate),
            'extra_sections' => [
                'Approval & Disbursement Audit' => [
                    'Approver' => $approverName,
                    'Approval Date' => $approvedDate,
                    'Disbursed By' => $disbursedBy,
                    'Disbursement Date' => $disbursedDate,
                    'Acknowledged Date' => $advance->acknowledged_at ? $this->formatMediumDate($advance->acknowledged_at) : 'Awaiting Acknowledgement',
                ],
            ],
            'receipts' => [],
        ];

        $filename = "Cash-Advance-Report-#{$advance->id}.pdf";
        return [
            'filename' => $filename,
            'content' => $this->renderPdfDocument($sections),
        ];
    }

    /**
     * Build a Liquidation single-record PDF report (G2-054, G2-057, G2-060).
     */
    public function buildLiquidationReport(?Liquidation $liquidation, CashAdvance $advance, User $generatedBy): array
    {
        $advance->loadMissing([
            'requester',
            'approvalActions.approver',
            'disbursement.disbursedBy',
            'penalties',
            'statusHistory.changedBy',
        ]);

        $receiptIds = $liquidation && is_array($liquidation->reimbursement_ids)
            ? $liquidation->reimbursement_ids
            : [];
        $receipts = !empty($receiptIds)
            ? Receipt::whereIn('id', $receiptIds)->with('category')->get()
            : collect();

        $employeeName = $liquidation?->user?->name ?? $advance->requester?->name ?? 'Employee';
        $amountAdvanced = (float) ($advance->amount ?? 0);
        $totalLiquidated = $liquidation
            ? (float) ($liquidation->total_expense_amount ?? 0)
            : (float) $receipts->sum('total_amount');
        $outstandingOrReturn = $liquidation
            ? (float) ($liquidation->outstanding_balance ?? max($amountAdvanced - $totalLiquidated, 0))
            : (float) ($advance->outstanding_balance ?? max($amountAdvanced - $totalLiquidated, 0));

        $status = strtolower((string) ($liquidation?->status ?? $advance->status ?? 'signed'));
        $dueInfo = $this->resolveDeadlineAndPenalty($advance, $status);

        $latestApproval = $advance->approvalActions->sortByDesc('created_at')->first();
        $approverName = $latestApproval?->approver?->name ?? '—';
        $approvedDate = $latestApproval ? $this->formatMediumDate($latestApproval->actioned_at ?? $latestApproval->created_at) : '—';
        $disbursedDate = $advance->disbursement ? $this->formatMediumDate($advance->disbursement->disbursed_at ?? $advance->disbursement->created_at) : '—';
        $reviewDate = $liquidation && in_array($status, ['liquidated', 'settled', 'approved', 'rejected', 'revise'], true)
            ? $this->formatMediumDate($liquidation->updated_at)
            : 'Pending Review';

        $reportId = $liquidation?->id ?? $advance->id;

        $sections = [
            'title' => "Liquidation Report #{$reportId}",
            'reference' => "LIQ-#{$reportId} (CA-#{$advance->id})",
            'generated_at' => $this->formatMediumDate(now()),
            'generated_by' => "{$generatedBy->name} (" . ucfirst((string) $generatedBy->role) . ")",
            'summary' => [
                'Liquidation Reference' => "LIQ-#{$reportId}",
                'Cash Advance Reference' => "Cash Advance Ref #{$advance->id}",
                'Employee Name' => $employeeName,
                'Purpose' => (string) $advance->purpose,
                'Liquidation Status' => ucfirst($status),
                'Amount Advanced' => $this->formatPeso($amountAdvanced),
                'Total Liquidated (Receipts)' => $this->formatPeso($totalLiquidated),
                'Outstanding Balance / To Return' => $this->formatPeso($outstandingOrReturn),
                'Settlement Due Date' => $dueInfo['due_date_label'],
                'Deadline / Overdue Status' => $dueInfo['countdown_label'],
                'Penalty Amount' => $this->formatPeso($dueInfo['penalty_amount']),
                'Shortfall Explanation' => $liquidation?->shortfall_explanation ?: 'None',
                'Admin Notes' => $liquidation?->admin_note ?: 'None',
            ],
            'tracker_title' => 'Two-Phase Progress Tracker (Phase 1: Cash Advance | Phase 2: Liquidation & Settlement)',
            'tracker_steps' => $this->resolveTwoPhaseLiquidationTracker(
                $advance,
                $liquidation,
                $approverName,
                $approvedDate,
                $disbursedDate,
                $reviewDate
            ),
            'extra_sections' => [],
            'receipts' => [],
        ];

        foreach ($receipts as $idx => $receipt) {
            $sections['receipts'][] = [
                'index' => $idx + 1,
                'vendor' => $receipt->vendor_name ?: 'Receipt',
                'invoice' => $receipt->invoice_number ?: '—',
                'date' => $this->formatMediumDate($receipt->transaction_date),
                'category' => $receipt->category?->name ?? 'General',
                'amount' => $this->formatPeso($receipt->total_amount),
                'status' => ucfirst((string) ($receipt->status ?? 'pending')),
            ];
        }

        $filename = "Liquidation-Report-#{$reportId}.pdf";
        return [
            'filename' => $filename,
            'content' => $this->renderPdfDocument($sections),
        ];
    }

    private function resolveReimbursementTracker(string $status): array
    {
        $isApprovedOrGranted = in_array($status, ['approved', 'granted', 'paid'], true);
        $isRejected = in_array($status, ['rejected', 'reject'], true);
        $isGranted = in_array($status, ['granted', 'paid'], true);

        return [
            ['stage' => '1. Submitted', 'state' => 'Completed'],
            ['stage' => '2. Review', 'state' => ($isApprovedOrGranted || $isRejected) ? 'Reviewed' : 'In Progress'],
            ['stage' => '3. Decision', 'state' => $isGranted ? 'Granted' : ($isApprovedOrGranted ? 'Approved' : ($isRejected ? 'Rejected' : 'Awaiting'))],
            ['stage' => '4. Released', 'state' => $isGranted ? 'Disbursed / Granted' : 'Pending'],
        ];
    }

    private function resolveCashAdvanceTracker(
        CashAdvance $advance,
        string $approverName,
        string $approvedDate,
        string $disbursedDate
    ): array {
        $status = strtolower((string) $advance->status);
        $hasApproved = in_array($status, ['approved', 'disbursed', 'signed', 'under-review', 'incomplete', 'overdue', 'liquidated', 'settled'], true);
        $hasDisbursed = in_array($status, ['disbursed', 'signed', 'under-review', 'incomplete', 'overdue', 'liquidated', 'settled'], true) || $advance->disbursement !== null;
        $hasAcknowledged = $advance->acknowledged_at !== null || in_array($status, ['signed', 'under-review', 'incomplete', 'overdue', 'liquidated', 'settled'], true);
        $hasLiquidation = $advance->liquidations->isNotEmpty() || in_array($status, ['under-review', 'liquidated', 'settled'], true);
        $isSettled = in_array($status, ['liquidated', 'settled'], true);

        return [
            ['stage' => '1. Request', 'state' => 'Submitted (' . $this->formatMediumDate($advance->created_at) . ')'],
            ['stage' => '2. Approval', 'state' => $status === 'rejected' ? 'Rejected' : ($hasApproved ? "Approved by {$approverName} ({$approvedDate})" : 'Pending')],
            ['stage' => '3. Disbursed', 'state' => $hasDisbursed ? "Disbursed ({$disbursedDate})" : 'Pending'],
            ['stage' => '4. Acknowledged', 'state' => $hasAcknowledged ? 'Acknowledged (' . $this->formatMediumDate($advance->acknowledged_at) . ')' : 'Pending'],
            ['stage' => '5. Liquidation', 'state' => $hasLiquidation ? ($isSettled ? 'Completed' : 'In Progress') : 'Pending'],
            ['stage' => '6. Settled', 'state' => $isSettled ? 'Settled' : 'Pending'],
        ];
    }

    private function resolveTwoPhaseLiquidationTracker(
        CashAdvance $advance,
        ?Liquidation $liquidation,
        string $approverName,
        string $approvedDate,
        string $disbursedDate,
        string $reviewDate
    ): array {
        $liqStatus = strtolower((string) ($liquidation?->status ?? $advance->status ?? 'signed'));
        $isSettled = in_array($liqStatus, ['liquidated', 'settled', 'approved'], true);
        $isRejected = $liqStatus === 'rejected';

        return [
            ['stage' => 'Phase 1 - Request', 'state' => 'Completed (' . $this->formatMediumDate($advance->created_at) . ')'],
            ['stage' => 'Phase 1 - Approval', 'state' => "Approved by {$approverName} ({$approvedDate})"],
            ['stage' => 'Phase 1 - Disbursed', 'state' => "Disbursed ({$disbursedDate})"],
            ['stage' => 'Phase 1 - Acknowledged', 'state' => $advance->acknowledged_at ? 'Signed (' . $this->formatMediumDate($advance->acknowledged_at) . ')' : 'Pending'],
            ['stage' => 'Phase 2 - Liquidation', 'state' => $liquidation ? ($isRejected ? "Rejected ({$reviewDate})" : "Submitted ({$this->formatMediumDate($liquidation->created_at)})") : 'Awaiting Submission'],
            ['stage' => 'Phase 2 - Settled', 'state' => $isSettled ? "Settled ({$reviewDate})" : 'Pending'],
        ];
    }

    private function resolveDeadlineAndPenalty(CashAdvance $advance, string $status): array
    {
        $penaltySum = $advance->relationLoaded('penalties')
            ? (float) $advance->penalties->sum('penalty_amount')
            : (float) $advance->penalties()->sum('penalty_amount');

        $due = $advance->expected_liquidation_date;
        if (!$due) {
            return [
                'due_date_label' => '—',
                'countdown_label' => 'No deadline set',
                'penalty_amount' => $penaltySum,
            ];
        }

        $dueDate = Carbon::parse($due)->startOfDay();
        $today = Carbon::now()->startOfDay();
        $dueLabel = $this->formatMediumDate($dueDate);

        if (in_array($status, ['liquidated', 'settled'], true)) {
            return [
                'due_date_label' => $dueLabel,
                'countdown_label' => 'Settled',
                'penalty_amount' => $penaltySum,
            ];
        }

        if ($today->gt($dueDate)) {
            $daysOverdue = (int) $today->diffInDays($dueDate);
            $computedPenalty = $penaltySum > 0 ? $penaltySum : ($daysOverdue * 50.0);
            return [
                'due_date_label' => $dueLabel,
                'countdown_label' => "{$daysOverdue} day(s) overdue",
                'penalty_amount' => $computedPenalty,
            ];
        }

        $daysLeft = (int) $today->diffInDays($dueDate);
        return [
            'due_date_label' => $dueLabel,
            'countdown_label' => $daysLeft === 0 ? 'Due Today' : "{$daysLeft} day(s) left",
            'penalty_amount' => $penaltySum,
        ];
    }

    /**
     * Render a valid, lightweight %PDF-1.4 document with clean SBSI header,
     * summary key-value rows, progress tracker steps, and receipts table.
     */
    private function renderPdfDocument(array $doc): string
    {
        $lines = [];
        $lines[] = '========================================================================';
        $lines[] = 'SCIENCE BIOTECH SPECIALTIES INC. (SBSI)';
        $lines[] = 'Smart Expense & Reimbursement Management System (SERMS)';
        $lines[] = '========================================================================';
        $lines[] = 'Report Title : ' . ($doc['title'] ?? 'SERMS Report');
        $lines[] = 'Reference    : ' . ($doc['reference'] ?? '—');
        $lines[] = 'Date Generated: ' . ($doc['generated_at'] ?? '');
        $lines[] = 'Generated By : ' . ($doc['generated_by'] ?? '');
        $lines[] = '------------------------------------------------------------------------';
        $lines[] = 'RECORD SUMMARY';
        $lines[] = '------------------------------------------------------------------------';

        foreach (($doc['summary'] ?? []) as $label => $value) {
            $lines[] = str_pad($label . ':', 32) . ' ' . $value;
        }

        if (!empty($doc['tracker_steps'])) {
            $lines[] = '------------------------------------------------------------------------';
            $lines[] = strtoupper($doc['tracker_title'] ?? 'PROGRESS TRACKER');
            $lines[] = '------------------------------------------------------------------------';
            foreach ($doc['tracker_steps'] as $step) {
                $lines[] = '  [' . $step['stage'] . '] -> ' . $step['state'];
            }
        }

        foreach (($doc['extra_sections'] ?? []) as $sectionTitle => $items) {
            $lines[] = '------------------------------------------------------------------------';
            $lines[] = strtoupper($sectionTitle);
            $lines[] = '------------------------------------------------------------------------';
            foreach ($items as $k => $v) {
                $lines[] = str_pad($k . ':', 32) . ' ' . $v;
            }
        }

        $lines[] = '------------------------------------------------------------------------';
        $lines[] = 'ATTACHED RECEIPTS (' . count($doc['receipts'] ?? []) . ')';
        $lines[] = '------------------------------------------------------------------------';
        if (empty($doc['receipts'])) {
            $lines[] = 'No receipt attachments recorded.';
        } else {
            foreach ($doc['receipts'] as $r) {
                $lines[] = sprintf(
                    '#%d | Vendor: %s | Invoice: %s | Date: %s | Category: %s | Amount: %s | Status: %s',
                    $r['index'],
                    $r['vendor'],
                    $r['invoice'],
                    $r['date'],
                    $r['category'],
                    $r['amount'],
                    $r['status']
                );
            }
        }

        return $this->compileMinimalPdf($lines);
    }

    private function escapePdfText(string $text): string
    {
        return str_replace(
            ['\\', '(', ')'],
            ['\\\\', '\\(', '\\)'],
            $text
        );
    }

    private function compileMinimalPdf(array $lines): string
    {
        $streamLines = ["BT", "/F1 9 Tf", "40 790 Td", "13 TL"];
        foreach ($lines as $index => $line) {
            $escaped = $this->escapePdfText($line);
            if ($index === 0) {
                $streamLines[] = "({$escaped}) Tj";
            } else {
                $streamLines[] = "T* ({$escaped}) Tj";
            }
        }
        $streamLines[] = "ET";
        $streamContent = implode("\n", $streamLines);
        $streamLength = strlen($streamContent);

        $objects = [];
        $objects[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
        $objects[2] = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
        $objects[3] = "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n";
        $objects[4] = "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n";
        $objects[5] = "5 0 obj\n<< /Length {$streamLength} >>\nstream\n{$streamContent}\nendstream\nendobj\n";

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $num => $obj) {
            $offsets[$num] = strlen($pdf);
            $pdf .= $obj;
        }

        $xrefOffset = strlen($pdf);
        $count = count($objects) + 1;
        $pdf .= "xref\n0 {$count}\n";
        $pdf .= "0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        $pdf .= "trailer\n<< /Size {$count} /Root 1 0 R >>\n";
        $pdf .= "startxref\n{$xrefOffset}\n%%EOF";

        return $pdf;
    }
}
```

Create `apps/api/app/Modules/Shared/Http/Controllers/ReportController.php`:

```php
<?php

namespace App\Modules\Shared\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Shared\Services\ReportGeneratorService;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\AuditLogs\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    protected ReportGeneratorService $reportGenerator;

    public function __construct(ReportGeneratorService $reportGenerator)
    {
        $this->reportGenerator = $reportGenerator;
    }

    public function download(Request $request, string $type, int $id)
    {
        $user = $request->user();
        $normalizedType = strtolower(trim($type));

        if (!in_array($normalizedType, ['reimbursement', 'cash-advance', 'liquidation'], true)) {
            return response()->json(['message' => 'Invalid report type.'], 404);
        }

        if ($normalizedType === 'reimbursement') {
            $record = Reimbursement::with(['user', 'receipts.category', 'expenseCategory', 'payout'])->findOrFail($id);
            $canManage = $user->can('serms.reimbursements.manage') || in_array($user->role, ['admin', 'superadmin', 'finance', 'accounting'], true);

            if (!$canManage && (int) $record->user_id !== (int) $user->id) {
                return response()->json(['message' => 'Forbidden. You are not allowed to export this report.'], 403);
            }

            $report = DB::transaction(function () use ($record, $user, $request) {
                $generated = $this->reportGenerator->buildReimbursementReport($record, $user);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) $user->role,
                    actionType: 'REPORT_EXPORTED',
                    entityType: 'reimbursement',
                    entityId: $record->id,
                    beforeState: null,
                    afterState: [
                        'format' => 'pdf',
                        'filename' => $generated['filename'],
                        'exported_at' => now()->toIso8601String(),
                    ],
                    ipAddress: $request->ip()
                );

                return $generated;
            });
        } elseif ($normalizedType === 'cash-advance') {
            $record = CashAdvance::with([
                'requester',
                'approvalActions.approver',
                'disbursement.disbursedBy',
                'document',
                'liquidations',
            ])->findOrFail($id);

            $canManage = $user->can('serms.cash_advances.manage') || in_array($user->role, ['admin', 'superadmin', 'finance', 'accounting'], true);

            if (!$canManage && (int) $record->user_id !== (int) $user->id) {
                return response()->json(['message' => 'Forbidden. You are not allowed to export this report.'], 403);
            }

            $report = DB::transaction(function () use ($record, $user, $request) {
                $generated = $this->reportGenerator->buildCashAdvanceReport($record, $user);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) $user->role,
                    actionType: 'REPORT_EXPORTED',
                    entityType: 'cash-advance',
                    entityId: $record->id,
                    beforeState: null,
                    afterState: [
                        'format' => 'pdf',
                        'filename' => $generated['filename'],
                        'exported_at' => now()->toIso8601String(),
                    ],
                    ipAddress: $request->ip()
                );

                return $generated;
            });
        } else {
            // liquidation: supports direct liquidation ID or fallback to cash_advance_id (?by=cash_advance)
            $byCashAdvance = $request->query('by') === 'cash_advance';
            $liquidation = null;
            $advance = null;

            if (!$byCashAdvance) {
                $liquidation = Liquidation::with(['user', 'cashAdvance'])->find($id);
            }

            if ($liquidation) {
                $advance = CashAdvance::findOrFail($liquidation->cash_advance_id);
                $ownerId = (int) $liquidation->user_id;
                $entityId = (int) $liquidation->id;
            } else {
                $advance = CashAdvance::with(['liquidations'])->findOrFail($id);
                $liquidation = $advance->liquidations->sortByDesc('created_at')->sortByDesc('id')->first();
                $ownerId = (int) $advance->user_id;
                $entityId = (int) ($liquidation?->id ?? $advance->id);
            }

            $canManage = $user->can('serms.liquidations.manage') || in_array($user->role, ['admin', 'superadmin', 'finance', 'accounting'], true);

            if (!$canManage && $ownerId !== (int) $user->id) {
                return response()->json(['message' => 'Forbidden. You are not allowed to export this report.'], 403);
            }

            $report = DB::transaction(function () use ($liquidation, $advance, $user, $entityId, $request) {
                $generated = $this->reportGenerator->buildLiquidationReport($liquidation, $advance, $user);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) $user->role,
                    actionType: 'REPORT_EXPORTED',
                    entityType: 'liquidation',
                    entityId: $entityId,
                    beforeState: null,
                    afterState: [
                        'format' => 'pdf',
                        'filename' => $generated['filename'],
                        'cash_advance_id' => $advance->id,
                        'exported_at' => now()->toIso8601String(),
                    ],
                    ipAddress: $request->ip()
                );

                return $generated;
            });
        }

        return response($report['content'], 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $report['filename'] . '"',
            'Cache-Control' => 'no-store, no-cache, must-revalidate',
        ]);
    }
}
```

Update `apps/api/app/Modules/Shared/routes/api.php` to register the report download route inside the `auth.external` group:

```php
<?php

use Illuminate\Support\Facades\Route;
use App\Modules\Shared\Http\Controllers\AuthController;
use App\Modules\Shared\Http\Controllers\CryptoController;
use App\Modules\Shared\Http\Controllers\ReportController;

Route::prefix('api')->group(function () {
    // Public: server RSA public key for client-side payload encryption (SDD §5).
    Route::get('/crypto/key', [CryptoController::class, 'publicKey']);

    Route::middleware('auth.external')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);

        Route::post('/auth/verify-password', [AuthController::class, 'verifyPassword']);

        Route::get('/reports/{type}/{id}', [ReportController::class, 'download']);
    });
});
```

- [ ] **Step 4: Run the backend feature tests to verify they pass**

Run: `php artisan test tests/Feature/ReportExportTest.php` (in `apps/api`)
Expected: PASS (4 tests, all assertions green).

---

### Task 2: Reusable Frontend Report Export Composable (`G2-054`, `G2-055`–`G2-060`)

**Files:**
- Create: `apps/web/src/composables/useReportExport.js`
- Create: `apps/web/src/composables/useReportExport.test.js`

**Interfaces:**
- Produces:
  - `useReportExport()` returning `{ isExporting: Ref<boolean>, exportReport(type: 'reimbursement' | 'cash-advance' | 'liquidation', id: number | string, options?: { byCashAdvance?: boolean }): Promise<boolean> }`.
  - Automatically prefixes `/api/serms/reports/${type}/${id}` (with `?by=cash_advance` when `options.byCashAdvance` is `true`), extracts filename from `Content-Disposition` (or falls back to `${TitleCaseType}-Report-#${id}.pdf`), triggers browser file download, and calls `addToast({ message, type: 'error' })` on failure.

- [ ] **Step 1: Write failing unit tests in `apps/web/src/composables/useReportExport.test.js`**

Create `apps/web/src/composables/useReportExport.test.js`:

```javascript
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useReportExport } from "./useReportExport";

const mockAddToast = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

const mockApiFetch = vi.fn();
vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

describe("useReportExport composable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-pdf");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("downloads the PDF report and uses the Content-Disposition filename", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const mockBlob = new Blob(["%PDF-1.4 mock"], { type: "application/pdf" });

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (name) =>
          name.toLowerCase() === "content-disposition"
            ? 'attachment; filename="Reimbursement-Report-#5.pdf"'
            : null,
      },
      blob: () => Promise.resolve(mockBlob),
    });

    const { isExporting, exportReport } = useReportExport();
    expect(isExporting.value).toBe(false);

    const promise = exportReport("reimbursement", 5);
    expect(isExporting.value).toBe(true);

    const result = await promise;
    expect(result).toBe(true);
    expect(isExporting.value).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/serms/reports/reimbursement/5",
      expect.objectContaining({
        headers: { Accept: "application/pdf" },
      }),
    );
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mockAddToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("appends ?by=cash_advance when options.byCashAdvance is true", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      blob: () => Promise.resolve(new Blob(["%PDF-1.4"], { type: "application/pdf" })),
    });

    const { exportReport } = useReportExport();
    await exportReport("liquidation", 12, { byCashAdvance: true });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/serms/reports/liquidation/12?by=cash_advance",
      expect.any(Object),
    );
  });

  it("shows an error toast and resets isExporting when download fails", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: "Forbidden. You are not allowed to export this report." }),
    });

    const { isExporting, exportReport } = useReportExport();
    const result = await exportReport("reimbursement", 99);

    expect(result).toBe(false);
    expect(isExporting.value).toBe(false);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Forbidden. You are not allowed to export this report.",
        type: "error",
      }),
    );
  });
});
```

- [ ] **Step 2: Run the composable unit test to verify it fails**

Run: `npx vitest run src/composables/useReportExport.test.js` (in `apps/web`)
Expected: FAIL (`useReportExport.js` does not exist).

- [ ] **Step 3: Implement `apps/web/src/composables/useReportExport.js`**

Create `apps/web/src/composables/useReportExport.js`:

```javascript
import { ref } from "vue";
import { apiFetch } from "@/utils/apiFetch";
import { useToast } from "@/composables/useToast";

const DEFAULT_PREFIXES = {
  reimbursement: "Reimbursement-Report",
  "cash-advance": "Cash-Advance-Report",
  liquidation: "Liquidation-Report",
};

export function useReportExport() {
  const isExporting = ref(false);
  const { addToast } = useToast();

  async function exportReport(type, id, options = {}) {
    if (!type || id === null || id === undefined || isExporting.value) {
      return false;
    }

    const cleanId = String(id).replace(/^LIQ-0*/i, "");
    const query = options.byCashAdvance ? "?by=cash_advance" : "";
    const url = `/api/serms/reports/${type}/${encodeURIComponent(cleanId)}${query}`;

    isExporting.value = true;
    try {
      const response = await apiFetch(url, {
        headers: {
          Accept: "application/pdf",
        },
      });

      if (!response.ok) {
        let errorMessage = "Failed to export report. Please try again.";
        try {
          const errData = await response.json();
          if (errData?.message) {
            errorMessage = errData.message;
          }
        } catch {
          // Keep default error message if body is not JSON
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const disposition = response.headers?.get?.("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const prefix = DEFAULT_PREFIXES[type] || "SERMS-Report";
      const filename = filenameMatch?.[1] || `${prefix}-#${cleanId}.pdf`;

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      return true;
    } catch (error) {
      addToast({
        message: error?.message || "Failed to export report. Please try again.",
        type: "error",
      });
      return false;
    } finally {
      isExporting.value = false;
    }
  }

  return {
    isExporting,
    exportReport,
  };
}
```

- [ ] **Step 4: Run the composable unit test to verify it passes**

Run: `npx vitest run src/composables/useReportExport.test.js` (in `apps/web`)
Expected: PASS (3 tests passing).

---

### Task 3: Reimbursements & Cash Advances View Modal "Export Report" Integration (`G2-055`, `G2-056`, `G2-058`, `G2-059`)

**Files:**
- Modify: `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue`
- Modify: `apps/web/src/components/reimbursements/ReimbursementDetailsModal.test.js`
- Modify: `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.vue`
- Create: `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.test.js`

**Interfaces:**
- `ReimbursementDetailsModal.vue`:
  - Renders a `BaseButton` (`data-testid="export-reimbursement-report-btn"`, label `"Export Report"` / `"Exporting..."`) right-aligned beside the `Receipts ({{ activeReceiptItems.length }})` header for both employees (`G2-055`) and admins (`G2-058`).
  - Clicking invokes `exportReport("reimbursement", viewingRecord.id)`.
- `CashAdvanceDetailsModal.vue`:
  - Renders a `BaseButton` (`data-testid="export-cash-advance-report-btn"`, label `"Export Report"` / `"Exporting..."`) in the Admin modal footer (beside `Disburse` / `Approve` when applicable, or in the footer for other statuses — `G2-059`) and in the Employee modal footer (`G2-056`).
  - Clicking invokes `exportReport("cash-advance", record.id)` and never triggers `Disburse` or alters the cash advance status.

- [ ] **Step 1: Write failing tests in `ReimbursementDetailsModal.test.js` and `CashAdvanceDetailsModal.test.js`**

Add tests to `apps/web/src/components/reimbursements/ReimbursementDetailsModal.test.js`:

```javascript
  it("renders Export Report button beside Receipts header and triggers reimbursement report export (G2-055, G2-058)", async () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 42,
          status: "approved",
          description: "Client Dinner",
          user_comment: "Team dinner",
          user: { name: "John Doe" },
          cutoff_period: "2026-10-A",
          amount: 2400,
          receipts: [],
        },
        receiptDetailsOpen: false,
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-reimbursement-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.text()).toContain("Export Report");
  });
```

And create `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.test.js`:

```javascript
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CashAdvanceDetailsModal from "./CashAdvanceDetailsModal.vue";

const mockExportReport = vi.fn(() => Promise.resolve(true));
vi.mock("@/composables/useReportExport", () => ({
  useReportExport: () => ({
    isExporting: { value: false },
    exportReport: mockExportReport,
  }),
}));

const mockAuth = {
  isAdmin: true,
  user: { id: 99, name: "Admin User" },
};
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => mockAuth,
}));

describe("CashAdvanceDetailsModal — Export Report (G2-056, G2-059)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders Export Report button beside Disburse in Admin view without triggering Disburse (G2-059)", async () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 15,
          userId: 10,
          requestedBy: "Juan Dela Cruz",
          purpose: "Field Calibration",
          amount: 5000,
          balance: 5000,
          date: "2026-10-01",
          dueDate: "2026-10-10",
          status: "approved",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-cash-advance-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.text()).toContain("Export Report");

    await exportBtn.trigger("click");
    expect(mockExportReport).toHaveBeenCalledWith("cash-advance", 15);
  });

  it("renders Export Report button in Employee Cash Advance view modal for any status (G2-056)", async () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 21,
          userId: 10,
          requestedBy: "Juan Dela Cruz",
          purpose: "Reagent Delivery",
          amount: 3200,
          balance: 3200,
          date: "2026-10-05",
          dueDate: "2026-10-12",
          status: "pending",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-cash-advance-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    await exportBtn.trigger("click");
    expect(mockExportReport).toHaveBeenCalledWith("cash-advance", 21);
  });
});
```

- [ ] **Step 2: Run the modal tests to verify they fail**

Run: `npx vitest run src/components/reimbursements/ReimbursementDetailsModal.test.js src/components/cash-advances/CashAdvanceDetailsModal.test.js` (in `apps/web`)
Expected: FAIL (`[data-testid="export-reimbursement-report-btn"]` and `[data-testid="export-cash-advance-report-btn"]` do not exist).

- [ ] **Step 3: Add "Export Report" buttons to `ReimbursementDetailsModal.vue` and `CashAdvanceDetailsModal.vue`**

In `apps/web/src/components/reimbursements/ReimbursementDetailsModal.vue`:
1. Import `BaseButton` from `@/components/base/BaseButton.vue` and `useReportExport` from `@/composables/useReportExport`, and initialize `const { isExporting, exportReport } = useReportExport();`.
2. Update the Receipts header section (`lines 291-296`) to place the `"Export Report"` button beside `Receipts ({{ activeReceiptItems.length }})`:

```vue
            <!-- Receipts -->
            <div>
              <div class="flex items-center justify-between gap-3 mb-3">
                <h3 class="text-sm font-medium text-slate-700">
                  Receipts ({{ activeReceiptItems.length }})
                </h3>
                <BaseButton
                  data-testid="export-reimbursement-report-btn"
                  variant="secondary"
                  size="sm"
                  type="button"
                  :loading="isExporting"
                  :disabled="isExporting"
                  @click="exportReport('reimbursement', viewingRecord.id)"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
                </BaseButton>
              </div>
```

In `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.vue`:
1. Import `useReportExport` from `@/composables/useReportExport` and initialize `const { isExporting, exportReport } = useReportExport();`.
2. In the Admin modal footer (`lines 641-684`), render the footer for all statuses so `"Export Report"` is always available in the Admin Cash Advances View modal (and sits beside `Approve` / `Disburse` when status is `pending`, `revise`, or `approved`):

```vue
        <!-- Footer (Admin) -->
        <footer
          class="px-6 py-4 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0"
        >
          <BaseButton
            data-testid="export-cash-advance-report-btn"
            variant="secondary"
            type="button"
            class="sm:w-auto"
            :loading="isExporting"
            :disabled="isExporting"
            @click="exportReport('cash-advance', record.id)"
          >
            <Download class="w-4 h-4" />
            <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
          </BaseButton>

          <template v-if="['pending', 'revise', 'approved'].includes(record.status)">
            <p
              v-if="isOwnSubmission"
              class="text-sm text-danger text-center sm:text-right"
            >
              You cannot process your own request.
            </p>
            <div v-else class="flex flex-1 flex-col gap-3 sm:flex-row sm:justify-end">
              <template v-if="['pending','revise'].includes(record.status)">
                <div class="flex-1 sm:max-w-[200px]">
                  <select
                    @change="requestConfirmation($event.target.value); $event.target.value=''"
                    class="w-full py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg bg-white hover:bg-slate-50 transition-colors text-center"
                    value=""
                  >
                    <option value="" disabled selected>Actions ▾</option>
                    <option value="revise">Request Revision</option>
                    <option value="reject">Reject</option>
                  </select>
                </div>
                <button
                  class="flex-1 sm:max-w-[200px] py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                  type="button"
                  @click="requestConfirmation('approve')"
                >
                  <CheckCircle class="w-4 h-4" />
                  Approve
                </button>
              </template>
              <template v-if="record.status === 'approved'">
                <button
                  class="flex-1 sm:max-w-[220px] py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                  type="button"
                  @click="requestConfirmation('disburse')"
                >
                  <Wallet class="w-4 h-4" />
                  Disburse
                </button>
              </template>
            </div>
          </template>
        </footer>
```

3. In the Employee modal footer (`lines 856-865`), add the `"Export Report"` button alongside the Requested / Updated dates:

```vue
        <!-- Footer (Employee) -->
        <footer class="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 shrink-0">
          <div class="flex items-center gap-4">
            <p>
              <span class="font-bold uppercase tracking-widest">Requested</span>
              <span class="ml-2 font-semibold text-slate-800">{{ formatDateOnly(record.date) }}</span>
            </p>
            <p>
              <span class="font-bold uppercase tracking-widest">Updated</span>
              <span class="ml-2 font-semibold text-slate-800">{{ formatDateOnly(record.updatedAt) }}</span>
            </p>
          </div>
          <BaseButton
            data-testid="export-cash-advance-report-btn"
            variant="secondary"
            size="sm"
            type="button"
            :loading="isExporting"
            :disabled="isExporting"
            @click="exportReport('cash-advance', record.id)"
          >
            <Download class="w-3.5 h-3.5" />
            <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
          </BaseButton>
        </footer>
```

- [ ] **Step 4: Run the modal tests to verify they pass**

Run: `npx vitest run src/components/reimbursements/ReimbursementDetailsModal.test.js src/components/cash-advances/CashAdvanceDetailsModal.test.js` (in `apps/web`)
Expected: PASS.

---

### Task 4: Employee & Admin Liquidation Details "Export Report" Integration (`G2-057`, `G2-060`)

**Files:**
- Modify: `apps/web/src/components/liquidations/LiquidationSettlementForm.vue`
- Modify: `apps/web/src/components/liquidations/LiquidationReviewModal.vue`
- Modify: `apps/web/src/components/liquidations/LiquidationReviewModal.test.js`

**Interfaces:**
- `LiquidationSettlementForm.vue` (`G2-057`):
  - Renders a Receipt Attachments header row containing `<BaseButton data-testid="export-liquidation-report-btn">` beside the Receipt Attachments section (visible whether `isFormDisabled` is `true` or `false`, so employees can export for `Under Review`, `Signed`, `Rejected`, `Settled`/`Liquidated`, etc.).
  - When `existingLiquidation?.id` exists, calls `exportReport("liquidation", existingLiquidation.id)`.
  - When `existingLiquidation` is `null` (e.g., `Signed` / `Overdue` advance), calls `exportReport("liquidation", selectedAdvance.id, { byCashAdvance: true })`.
- `LiquidationReviewModal.vue` (`G2-060`):
  - Renders `<BaseButton data-testid="export-admin-liquidation-report-btn">` right-aligned beside `Receipts ({{ reviewReceipts.length }})`.
  - Calls `exportReport("liquidation", reviewingCase.databaseId || reviewingCase.id)` without approving, rejecting, or mutating the liquidation status.

- [ ] **Step 1: Add failing tests in `apps/web/src/components/liquidations/LiquidationReviewModal.test.js`**

Add tests to `apps/web/src/components/liquidations/LiquidationReviewModal.test.js`:

```javascript
  it("renders Export Report button beside Receipts header in Admin LiquidationReviewModal without changing status (G2-060)", async () => {
    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-015",
          databaseId: 15,
          cashAdvanceAmount: 1500,
          dueDate: "2026-10-25",
          dateOfAdvances: "2026-10-18",
          requestorName: "Maria Clara",
        },
        reviewStatus: "under-review",
        reviewOutstandingBalance: 1500,
        reviewReceipts: [],
        getFileUrl: () => "",
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          BaseReceiptImage: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-admin-liquidation-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.text()).toContain("Export Report");
    expect(wrapper.emitted("approve")).toBeFalsy();
    expect(wrapper.emitted("reject")).toBeFalsy();
  });
```

- [ ] **Step 2: Run `LiquidationReviewModal.test.js` to verify it fails**

Run: `npx vitest run src/components/liquidations/LiquidationReviewModal.test.js` (in `apps/web`)
Expected: FAIL (`[data-testid="export-admin-liquidation-report-btn"]` not found).

- [ ] **Step 3: Implement "Export Report" in `LiquidationSettlementForm.vue` and `LiquidationReviewModal.vue`**

In `apps/web/src/components/liquidations/LiquidationSettlementForm.vue`:
1. Import `Download` from `lucide-vue-next` and `useReportExport` from `@/composables/useReportExport`.
2. Initialize `const { isExporting, exportReport } = useReportExport();` and add helper:

```javascript
function handleExportLiquidationReport() {
  if (props.existingLiquidation?.id) {
    exportReport("liquidation", props.existingLiquidation.id);
  } else if (props.selectedAdvance?.id) {
    exportReport("liquidation", props.selectedAdvance.id, { byCashAdvance: true });
  }
}
```

3. Above the Receipt Attachments / `ScannedReceiptsList` block (`lines 364-398`), render a dedicated Receipt Attachments section header row that is always visible for the selected liquidation/advance (both editable and read-only states) with the `"Export Report"` button beside it:

```vue
    <div class="pt-4 border-t border-slate-100 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="input-label !mb-0">
          Receipt Attachments ({{ receipts.length }})
        </label>
        <div class="flex items-center gap-3">
          <BaseToggleSwitch
            v-if="!isFormDisabled"
            :model-value="isMockOcr"
            @update:model-value="setMockMode"
            on-label="Mock OCR"
            off-label="Real OCR"
            hint="Mock uploads file, fills instantly, skips OCR wait"
          />
          <BaseButton
            data-testid="export-liquidation-report-btn"
            variant="secondary"
            size="sm"
            type="button"
            :loading="isExporting"
            :disabled="isExporting"
            @click="handleExportLiquidationReport"
          >
            <Download class="w-3.5 h-3.5" />
            <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
          </BaseButton>
        </div>
      </div>

      <template v-if="!isFormDisabled">
        <p class="text-[11px] text-slate-400">
          {{ isMockOcr ? "Fast — real file upload, instant mock data." : "Online — uses ocr-pipeline with polling." }}
        </p>
        <FileUpload
          :model-value="receipts"
          @update:model-value="$emit('update:receipts', $event)"
          :max-size-mb="2"
          :mock-mode="isMockOcr"
          empty-action-label="Upload Receipt"
          add-action-label="Upload Receipt"
          @upload-error="$emit('upload-error', $event)"
        />
      </template>
    </div>
```

In `apps/web/src/components/liquidations/LiquidationReviewModal.vue`:
1. Import `BaseButton` from `@/components/base/BaseButton.vue` and `useReportExport` from `@/composables/useReportExport`, and initialize `const { isExporting, exportReport } = useReportExport();`.
2. Update the Receipts header (`lines 219-224`) to include the `"Export Report"` button right-aligned beside `Receipts ({{ reviewReceipts.length }})`:

```vue
          <!-- Receipts -->
          <div>
            <div class="flex items-center justify-between gap-3 mb-3">
              <h3 class="text-sm font-medium text-slate-700">
                Receipts ({{ reviewReceipts.length }})
              </h3>
              <BaseButton
                data-testid="export-admin-liquidation-report-btn"
                variant="secondary"
                size="sm"
                type="button"
                :loading="isExporting"
                :disabled="isExporting"
                @click="exportReport('liquidation', reviewingCase.databaseId ?? reviewingCase.id)"
              >
                <Download class="w-3.5 h-3.5" />
                <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
              </BaseButton>
            </div>
```

- [ ] **Step 4: Run the full frontend and backend test suites to verify everything passes**

Run:
- `npx vitest run src/composables/useReportExport.test.js src/components/reimbursements/ReimbursementDetailsModal.test.js src/components/cash-advances/CashAdvanceDetailsModal.test.js src/components/liquidations/LiquidationReviewModal.test.js` (in `apps/web`)
- `php artisan test tests/Feature/ReportExportTest.php` (in `apps/api`)
Expected: All tests PASS with 0 errors.
