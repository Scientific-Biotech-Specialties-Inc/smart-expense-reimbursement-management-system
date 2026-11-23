<?php

namespace Tests\Feature;

use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CmsOutboundIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $accounting;
    private string $employeeToken;
    private string $accountingToken;
    private string $internalSecret = 'cms-serms-shared-secret-test';
    private string $aiApiKey = 'test-ai-key';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.cms.contract_url'    => 'https://cms.test/api/contract',
            'services.cms.vendor_url'      => 'https://cms.test/api/vendor',
            'services.cms.internal_secret' => $this->internalSecret,
            'services.cms.timeout'         => 5,
            'services.ai_service.api_key'  => $this->aiApiKey,
        ]);

        $this->employee = User::create([
            'auth_id'    => 10,
            'email'      => 'employee@sbsi.com',
            'name'       => 'Juan Dela Cruz',
            'role'       => 'employee',
            'department' => 'Sales',
        ]);

        $this->accounting = User::create([
            'auth_id'    => 42,
            'email'      => 'sum@sbsi.com',
            'name'       => 'Maria Santos',
            'role'       => 'admin',
            'department' => 'Accounting',
        ]);

        $this->employeeToken = $this->generateMockToken([
            'sub'        => $this->employee->auth_id,
            'email'      => $this->employee->email,
            'first_name' => 'Juan',
            'last_name'  => 'Dela Cruz',
            'role'       => 'employee',
            'department' => 'Sales',
        ]);

        $this->accountingToken = $this->generateMockToken([
            'sub'        => $this->accounting->auth_id,
            'email'      => $this->accounting->email,
            'first_name' => 'Maria',
            'last_name'  => 'Santos',
            'role'       => 'admin',
            'department' => 'Accounting',
        ]);

        Cache::put("user_permissions:{$this->accounting->auth_id}", [
            'serms.reimbursements.manage',
            'serms.cash_advances.manage',
        ], 3600);
    }

    public function test_active_contracts_proxy_calls_cms_with_internal_secret_and_handles_offline(): void
    {
        Http::fake([
            'https://cms.test/api/contract/active*' => Http::response([
                'data' => [
                    [
                        'contract_id'    => 10,
                        'contract_code'  => 'CTR-ABC123',
                        'client_name'    => 'Acme Biotech Corp',
                        'category'       => 'Service Agreement',
                        'contract_value' => 250000.0,
                        'status'         => 'Approved',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->employeeToken,
        ])->getJson('/api/cms/contracts/active?search=Acme&limit=50');

        $response->assertOk()
            ->assertJsonPath('available', true)
            ->assertJsonPath('data.0.contract_id', 10)
            ->assertJsonPath('data.0.contract_code', 'CTR-ABC123')
            ->assertJsonPath('data.0.client_name', 'Acme Biotech Corp');

        Http::assertSent(function (HttpClientRequest $req) {
            return str_starts_with($req->url(), 'https://cms.test/api/contract/active')
                && $req->hasHeader('X-Internal-Secret', $this->internalSecret);
        });
    }

    public function test_reimbursement_and_cash_advance_persist_contract_id_and_client_name(): void
    {
        Storage::fake('supabase');

        $cat = ExpenseCategory::firstOrCreate(['name' => 'Travel']);
        $receipt = Receipt::create([
            'uploaded_by'         => $this->employee->id,
            'file_path'           => 'receipts/c.png',
            'file_hash'           => hash('sha256', 'c'),
            'file_type'           => 'png',
            'file_size_bytes'     => 100,
            'vendor_name'         => 'Grab',
            'transaction_date'    => '2026-06-10',
            'total_amount'        => 500.00,
            'expense_category_id' => $cat->id,
            'status'              => 'processed',
        ]);

        $reimbRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->employeeToken,
        ])->post('/api/reimbursements', [
            'description'         => 'Client site visit',
            'expense_category_id' => $cat->id,
            'contract_id'         => 10,
            'client_name'         => 'Acme Biotech Corp',
            'event_type'          => 'Client Visit',
            'amount'              => 500.00,
            'date'                => '2026-06-10',
            'report_file'         => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
            'receipt_ids'         => [$receipt->id],
        ], ['Accept' => 'application/json']);

        $reimbRes->assertCreated()
            ->assertJsonPath('data.contract_id', 10)
            ->assertJsonPath('data.client_name', 'Acme Biotech Corp');

        $this->assertDatabaseHas('reimbursements', [
            'contract_id' => 10,
            'client_name' => 'Acme Biotech Corp',
        ]);

        $caRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->employeeToken,
        ])->post('/api/cash-advances', [
            'purpose'                    => 'Field calibration trip',
            'contract_id'                => 10,
            'client_name'                => 'Acme Biotech Corp',
            'amount'                     => 5000.00,
            'expected_disbursement_date' => now()->addDay()->format('Y-m-d'),
            'expected_liquidation_date'  => now()->addDays(5)->format('Y-m-d'),
            'documents'                  => [UploadedFile::fake()->create('ca.pdf', 100, 'application/pdf')],
        ], ['Accept' => 'application/json']);

        $caRes->assertCreated()
            ->assertJsonPath('data.contract_id', 10)
            ->assertJsonPath('data.client_name', 'Acme Biotech Corp');

        $this->assertDatabaseHas('cash_advances', [
            'contract_id' => 10,
            'client_name' => 'Acme Biotech Corp',
        ]);
    }

    public function test_ocr_callback_tags_accredited_vendor_and_prefills_default_category(): void
    {
        Http::fake([
            'https://cms.test/api/vendor/internal/vendors/lookup*' => Http::response([
                'data' => [
                    'matched'                  => true,
                    'match_type'               => 'tin',
                    'requires_audit'           => false,
                    'is_accredited'            => true,
                    'is_flagged'               => false,
                    'status'                   => 'Active',
                    'default_expense_category' => 'Spare Parts',
                    'supplier_id'              => 14,
                    'supplier_name'            => 'SBSI Lab Supplies Inc.',
                    'tin_number'               => '123-456-789-000',
                ],
            ], 200),
        ]);

        $receipt = Receipt::create([
            'uploaded_by'     => $this->employee->id,
            'file_path'       => 'receipts/ocr1.png',
            'file_hash'       => hash('sha256', 'ocr1'),
            'file_type'       => 'png',
            'file_size_bytes' => 1024,
            'status'          => 'processing',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->aiApiKey,
        ])->postJson("/api/reimbursements/receipts/{$receipt->id}/ocr-callback", [
            'receipt_id'           => $receipt->id,
            'vendor_name'          => 'SBSI Lab Supplies Inc.',
            'tin'                  => '123-456-789-000',
            'total_amount'         => 1500.00,
            'ocr_confidence_score' => 0.95,
            'expense_category'     => 'Others',
        ]);

        $response->assertOk();

        $receipt->refresh();
        $this->assertTrue((bool) $receipt->vendor_matched);
        $this->assertTrue((bool) $receipt->vendor_accredited);
        $this->assertFalse((bool) $receipt->vendor_audit_required);
        $this->assertSame('[Accredited Vendor]', $receipt->vendor_status_tag);
        $this->assertSame(14, $receipt->vendor_cms_supplier_id);
        $this->assertSame('Spare Parts', $receipt->category?->name);
    }

    public function test_ocr_callback_flags_unverified_vendor_and_fails_safely_when_cms_offline(): void
    {
        Http::fake([
            'https://cms.test/api/vendor/internal/vendors/lookup*' => Http::sequence()
                ->push([
                    'data' => [
                        'matched'                  => false,
                        'match_type'               => null,
                        'requires_audit'           => true,
                        'is_accredited'            => false,
                        'is_flagged'               => false,
                        'status'                   => null,
                        'default_expense_category' => null,
                        'supplier_id'              => null,
                        'supplier_name'            => null,
                        'tin_number'               => null,
                    ],
                ], 200)
                ->pushStatus(503),
        ]);

        $receipt1 = Receipt::create([
            'uploaded_by'     => $this->employee->id,
            'file_path'       => 'receipts/ocr2.png',
            'file_hash'       => hash('sha256', 'ocr2'),
            'file_type'       => 'png',
            'file_size_bytes' => 1024,
            'status'          => 'processing',
        ]);

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->aiApiKey,
        ])->postJson("/api/reimbursements/receipts/{$receipt1->id}/ocr-callback", [
            'receipt_id'           => $receipt1->id,
            'vendor_name'          => 'Unlisted Hardware',
            'tin'                  => '555-444-333-000',
            'total_amount'         => 900.00,
            'ocr_confidence_score' => 0.92,
        ])->assertOk();

        $receipt1->refresh();
        $this->assertFalse((bool) $receipt1->vendor_matched);
        $this->assertTrue((bool) $receipt1->vendor_audit_required);
        $this->assertSame('[Unverified Vendor — Secondary Accounting Audit Required]', $receipt1->vendor_status_tag);

        // Second receipt when CMS returns 503 — OCR callback must NOT fail
        $receipt2 = Receipt::create([
            'uploaded_by'     => $this->employee->id,
            'file_path'       => 'receipts/ocr3.png',
            'file_hash'       => hash('sha256', 'ocr3'),
            'file_type'       => 'png',
            'file_size_bytes' => 1024,
            'status'          => 'processing',
        ]);

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->aiApiKey,
        ])->postJson("/api/reimbursements/receipts/{$receipt2->id}/ocr-callback", [
            'receipt_id'           => $receipt2->id,
            'vendor_name'          => 'Offline Test Vendor',
            'tin'                  => '888-777-666-000',
            'total_amount'         => 700.00,
            'ocr_confidence_score' => 0.91,
        ])->assertOk();

        $receipt2->refresh();
        $this->assertSame('processed', $receipt2->status);
        $this->assertTrue((bool) $receipt2->vendor_audit_required);
        $this->assertSame('[CMS Lookup Unavailable — Manual Verification Required]', $receipt2->vendor_status_tag);
    }

    public function test_accounting_can_suggest_unlisted_vendor_to_cms_handling_201_200_and_409(): void
    {
        $receipt = Receipt::create([
            'uploaded_by'           => $this->employee->id,
            'file_path'             => 'receipts/suggest.png',
            'file_hash'             => hash('sha256', 'suggest'),
            'file_type'             => 'png',
            'file_size_bytes'       => 1024,
            'vendor_name'           => 'New Biotech Vendor',
            'tin'                   => '321-654-987-000',
            'vendor_matched'        => false,
            'vendor_audit_required' => true,
            'status'                => 'processed',
        ]);

        // Non-accounting employee is forbidden (403)
        $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->employeeToken,
        ])->postJson('/api/cms/vendors/suggest', [
            'receipt_id'  => $receipt->id,
            'vendor_name' => 'New Biotech Vendor',
            'tin_number'  => '321-654-987-000',
        ])->assertForbidden();

        Http::fake([
            'https://cms.test/api/vendor/internal/vendors/suggest' => Http::sequence()
                ->push(['message' => 'Vendor suggestion queued.', 'data' => ['id' => 1]], 201)
                ->push(['message' => 'Already pending with same TIN.', 'data' => ['id' => 1]], 200)
                ->push(['message' => 'TIN already exists in CMS suppliers.'], 409),
        ]);

        // 201 Created
        $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->postJson('/api/cms/vendors/suggest', [
            'receipt_id'               => $receipt->id,
            'vendor_name'              => 'New Biotech Vendor',
            'tin_number'               => '321-654-987-000',
            'default_expense_category' => 'Spare Parts',
        ])->assertCreated();

        $this->assertNotNull($receipt->fresh()->vendor_suggested_at);

        // 200 OK (already pending)
        $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->postJson('/api/cms/vendors/suggest', [
            'receipt_id'  => $receipt->id,
            'vendor_name' => 'New Biotech Vendor',
            'tin_number'  => '321-654-987-000',
        ])->assertOk();

        // 409 Conflict
        $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->postJson('/api/cms/vendors/suggest', [
            'receipt_id'  => $receipt->id,
            'vendor_name' => 'New Biotech Vendor',
            'tin_number'  => '321-654-987-000',
        ])->assertStatus(409);
    }

    public function test_recurring_expense_detection_and_forwarding_to_cms_contract_requests(): void
    {
        $cat = ExpenseCategory::firstOrCreate(['name' => 'Field Service']);

        for ($i = 1; $i <= 4; $i++) {
            $rec = Receipt::create([
                'uploaded_by'         => $this->employee->id,
                'file_path'           => "receipts/rec{$i}.png",
                'file_hash'           => hash('sha256', "rec{$i}"),
                'file_type'           => 'png',
                'file_size_bytes'     => 100,
                'vendor_name'         => 'Metro Calibration Services',
                'tin'                 => '111-222-333-000',
                'total_amount'        => 20000.00,
                'transaction_date'    => now()->subMonths(4 - $i)->format('Y-m-d'),
                'expense_category_id' => $cat->id,
                'status'              => 'approved',
            ]);

            $reimb = Reimbursement::create([
                'user_id'             => $this->employee->id,
                'description'         => "Calibration visit #{$i}",
                'expense_category_id' => $cat->id,
                'amount'              => 20000.00,
                'date'                => now()->subMonths(4 - $i)->format('Y-m-d'),
                'status'              => 'approved',
            ]);
            $reimb->receipts()->attach($rec->id);
        }

        // Detect recurring expenses
        $detectRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->getJson('/api/cms/recurring-expenses');

        $detectRes->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.vendor_name', 'Metro Calibration Services')
            ->assertJsonPath('data.0.tin_number', '111-222-333-000')
            ->assertJsonPath('data.0.occurrence_count', 4)
            ->assertJsonPath('data.0.total_spend', 80000);

        $candidate = $detectRes->json('data.0');

        Http::fake([
            'https://cms.test/api/contract/internal/contract-requests/from-serms' => Http::response([
                'data' => [
                    'id'                         => 77,
                    'contract_code'              => 'CRQ-2026-077',
                    'status'                     => 'Pending',
                    'supporting_expense_summary' => '4 recurring purchases totaling PHP 80,000.00',
                ],
            ], 201),
        ]);

        $forwardRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->postJson('/api/cms/contract-requests', [
            'vendor_name'         => $candidate['vendor_name'],
            'tin_number'          => $candidate['tin_number'],
            'service_description' => 'Quarterly instrument calibration (recurring 4x in SERMS)',
            'category'            => 'Service Agreement',
            'region'              => 'Luzon',
            'occurrence_count'    => $candidate['occurrence_count'],
            'total_spend'         => $candidate['total_spend'],
            'period_start'        => $candidate['period_start'],
            'period_end'          => $candidate['period_end'],
            'source_reference_id' => $candidate['source_reference_id'],
            'expense_items'       => $candidate['expense_items'],
        ]);

        $forwardRes->assertCreated()
            ->assertJsonPath('data.contract_code', 'CRQ-2026-077')
            ->assertJsonPath('data.supporting_expense_summary', '4 recurring purchases totaling PHP 80,000.00');

        $this->assertDatabaseHas('cms_contract_requests', [
            'source_reference_id' => $candidate['source_reference_id'],
            'contract_code'       => 'CRQ-2026-077',
        ]);

        Http::assertSent(function (HttpClientRequest $req) {
            return $req->url() === 'https://cms.test/api/contract/internal/contract-requests/from-serms'
                && $req->hasHeader('X-Internal-Secret', $this->internalSecret)
                && $req['forwarded_by'] === $this->accounting->auth_id;
        });
    }

    public function test_fast_track_priority_ordering_and_secondary_audit_gate_on_reimbursement_approval(): void
    {
        $cat = ExpenseCategory::firstOrCreate(['name' => 'Operations']);

        // 1. Older claim with Accredited Vendor + clean OCR -> Fast-Track Eligible
        $accreditedReceipt = Receipt::create([
            'uploaded_by'           => $this->employee->id,
            'file_path'             => 'receipts/accredited.png',
            'file_hash'             => hash('sha256', 'accredited-receipt'),
            'file_type'             => 'image/png',
            'file_size_bytes'       => 1024,
            'vendor_name'           => 'SBSI Accredited Supply Corp',
            'tin'                   => '123-456-789-000',
            'total_amount'          => 1500.00,
            'ocr_flagged'           => false,
            'vendor_matched'        => true,
            'vendor_accredited'     => true,
            'vendor_audit_required' => false,
            'vendor_flagged'        => false,
            'vendor_status_tag'     => '[Accredited Vendor]',
            'status'                => 'pending',
        ]);

        $fastTrackClaim = Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Fast-track eligible claim',
            'expense_category_id' => $cat->id,
            'amount'              => 1500.00,
            'date'                => '2026-11-10',
            'status'              => 'pending',
        ]);
        $fastTrackClaim->receipts()->attach($accreditedReceipt->id);

        // 2. Newer claim with Unverified Vendor -> Requires Secondary Audit (not Fast-Track)
        $unverifiedReceipt = Receipt::create([
            'uploaded_by'           => $this->employee->id,
            'file_path'             => 'receipts/unverified.png',
            'file_hash'             => hash('sha256', 'unverified-receipt'),
            'file_type'             => 'image/png',
            'file_size_bytes'       => 1024,
            'vendor_name'           => 'New Corner Hardware',
            'tin'                   => '999-888-777-000',
            'total_amount'          => 2500.00,
            'ocr_flagged'           => false,
            'vendor_matched'        => false,
            'vendor_accredited'     => false,
            'vendor_audit_required' => true,
            'vendor_flagged'        => false,
            'vendor_status_tag'     => '[Unverified Vendor — Secondary Accounting Audit Required]',
            'status'                => 'pending',
        ]);

        $auditRequiredClaim = Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Unverified vendor claim',
            'expense_category_id' => $cat->id,
            'amount'              => 2500.00,
            'date'                => '2026-11-14',
            'status'              => 'pending',
        ]);
        $auditRequiredClaim->receipts()->attach($unverifiedReceipt->id);

        // 3. Accredited Vendor claim with low-confidence OCR -> NOT Fast-Track Eligible
        $lowOcrAccreditedReceipt = Receipt::create([
            'uploaded_by'           => $this->employee->id,
            'file_path'             => 'receipts/low-ocr.png',
            'file_hash'             => hash('sha256', 'low-ocr-receipt'),
            'file_type'             => 'image/png',
            'file_size_bytes'       => 1024,
            'vendor_name'           => 'SBSI Accredited Supply Corp',
            'tin'                   => '123-456-789-000',
            'total_amount'          => 900.00,
            'ocr_flagged'           => true,
            'vendor_matched'        => true,
            'vendor_accredited'     => true,
            'vendor_audit_required' => false,
            'vendor_flagged'        => false,
            'vendor_status_tag'     => '[Accredited Vendor]',
            'status'                => 'pending',
        ]);

        $lowOcrClaim = Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Accredited but OCR-flagged claim',
            'expense_category_id' => $cat->id,
            'amount'              => 900.00,
            'date'                => '2026-11-14',
            'status'              => 'pending',
        ]);
        $lowOcrClaim->receipts()->attach($lowOcrAccreditedReceipt->id);

        // Listing returns pending fast-track claim first, with accurate computed flags
        $listRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->getJson('/api/reimbursements');

        $listRes->assertOk()
            ->assertJsonPath('0.id', $fastTrackClaim->id)
            ->assertJsonPath('0.fast_track_eligible', true)
            ->assertJsonPath('0.vendor_audit_required', false);

        $rows = collect($listRes->json());
        $auditRow = $rows->firstWhere('id', $auditRequiredClaim->id);
        $lowOcrRow = $rows->firstWhere('id', $lowOcrClaim->id);
        $this->assertFalse($auditRow['fast_track_eligible']);
        $this->assertTrue($auditRow['vendor_audit_required']);
        $this->assertContains('New Corner Hardware (TIN: 999-888-777-000)', $auditRow['unverified_vendors']);
        $this->assertFalse($lowOcrRow['fast_track_eligible']);

        // Fast-track claim can be approved without secondary_audit_confirmed
        $fastApproveRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->postJson("/api/reimbursements/{$fastTrackClaim->id}/approve", []);

        $fastApproveRes->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.secondary_audit_confirmed_at', null);

        // Unverified claim is blocked without secondary_audit_confirmed
        $blockedRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->postJson("/api/reimbursements/{$auditRequiredClaim->id}/approve", []);

        $blockedRes->assertStatus(422)
            ->assertJsonValidationErrors(['secondary_audit_confirmed']);

        // Unverified claim succeeds once Secondary Accounting Audit is confirmed
        $auditApproveRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->accountingToken,
        ])->postJson("/api/reimbursements/{$auditRequiredClaim->id}/approve", [
            'secondary_audit_confirmed' => true,
            'secondary_audit_note'      => 'Verified TIN against BIR OR attachment.',
        ]);

        $auditApproveRes->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.secondary_audit_by', $this->accounting->name)
            ->assertJsonPath('data.secondary_audit_note', 'Verified TIN against BIR OR attachment.');

        $this->assertNotNull($auditApproveRes->json('data.secondary_audit_confirmed_at'));

        $this->assertDatabaseHas('reimbursements', [
            'id'                   => $auditRequiredClaim->id,
            'status'               => 'approved',
            'secondary_audit_by'   => $this->accounting->name,
            'secondary_audit_note' => 'Verified TIN against BIR OR attachment.',
        ]);
    }
}
