<?php

namespace Tests\Feature;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AttachmentReportTemplateTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    private array $template = [
        'subject' => 'REIMBURSEMENT REQUEST FOR FIELD EXPENSES',
        'systemRefId' => 'SYS-REIMB-2026-0001',
        'breakdownItems' => [
            ['description' => 'Taxi', 'amount' => 250.5],
            ['description' => 'Meals', 'amount' => 749.5],
        ],
        'signatoryName' => 'John Doe',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'John Doe',
            'email' => 'john.doe@example.com',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'IT',
        ]);

        Storage::fake('supabase');
    }

    private function auth(): array
    {
        return [
            'Authorization' => 'Bearer ' . $this->generateMockToken([
                'email' => $this->employee->email,
                'role' => $this->employee->role,
                'first_name' => 'John',
                'last_name' => 'Doe',
            ]),
            'Accept' => 'application/json',
        ];
    }

    private function makeReceipt(string $hash = 'a'): Receipt
    {
        return Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/' . $hash . '.png',
            'file_hash' => str_repeat($hash, 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Vendor',
            'total_amount' => 1000.00,
        ]);
    }

    private function reimbursementPayload(Receipt $receipt, array $extra = []): array
    {
        $category = ExpenseCategory::firstOrCreate(['name' => 'Meals']);

        return array_merge([
            'description' => 'Client Lunch',
            'expense_category_id' => $category->id,
            'event_type' => 'Client Meeting',
            'amount' => 1000.00,
            'date' => '2026-06-10',
            'receipt_ids' => [$receipt->id],
            'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
        ], $extra);
    }

    private function makeCashAdvance(array $overrides = []): CashAdvance
    {
        return CashAdvance::create(array_merge([
            'user_id' => $this->employee->id,
            'purpose' => 'Business travel',
            'amount' => 5000.00,
            'outstanding_balance' => 5000.00,
            'status' => 'signed',
            'acknowledged_at' => Carbon::now()->subDay(),
            'expected_disbursement_date' => Carbon::now()->addDays(2),
            'expected_liquidation_date' => Carbon::now()->addDays(7),
        ], $overrides));
    }

    // ---------- Reimbursements ----------

    public function test_reimbursement_store_persists_template_sent_as_json_string_in_multipart(): void
    {
        $receipt = $this->makeReceipt();

        $response = $this->withHeaders($this->auth())->post('/api/reimbursements', $this->reimbursementPayload($receipt, [
            'report_template_data' => json_encode($this->template),
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('data.report_template_data.subject', $this->template['subject']);
        $response->assertJsonPath('data.report_template_data.breakdownItems.1.description', 'Meals');

        $id = $response->json('data.id');
        $this->assertEquals($this->template, Reimbursement::findOrFail($id)->report_template_data);

        $log = AuditLog::where('entity_type', 'reimbursement')->where('entity_id', $id)->where('action_type', 'CLAIM_SUBMITTED')->firstOrFail();
        $this->assertEquals($this->template, $log->after_state['report_template_data']);
    }

    public function test_reimbursement_store_accepts_template_as_array_and_url_resolves(): void
    {
        $receipt = $this->makeReceipt();

        $response = $this->withHeaders($this->auth())->post('/api/reimbursements', $this->reimbursementPayload($receipt, [
            'report_template_data' => $this->template,
        ]));

        $response->assertStatus(201);
        $this->assertEquals($this->template, $response->json('data.report_template_data'));
        $this->assertNotNull($response->json('data.report_url'));
        $this->assertStringEndsWith($response->json('data.report_file_path'), $response->json('data.report_url'));
    }

    public function test_reimbursement_manual_upload_without_template_still_works(): void
    {
        $receipt = $this->makeReceipt();

        $response = $this->withHeaders($this->auth())->post('/api/reimbursements', $this->reimbursementPayload($receipt));

        $response->assertStatus(201);
        $this->assertNull($response->json('data.report_template_data'));
        $this->assertNotNull($response->json('data.report_url'));
    }

    public function test_reimbursement_rejects_invalid_template_json(): void
    {
        $receipt = $this->makeReceipt();

        $response = $this->withHeaders($this->auth())->post('/api/reimbursements', $this->reimbursementPayload($receipt, [
            'report_template_data' => '{not valid json',
        ]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('report_template_data');
    }

    public function test_reimbursement_update_persists_template_and_logs_audit(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Pens',
            'amount' => 50.00,
            'date' => '2026-06-17',
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $response = $this->withHeaders($this->auth())->post('/api/reimbursements/' . $reimbursement->id, [
            '_method' => 'PATCH',
            'description' => 'Pens Updated',
            'report_template_data' => json_encode($this->template),
        ]);

        $response->assertStatus(200);
        $this->assertEquals($this->template, $reimbursement->fresh()->report_template_data);

        $log = AuditLog::where('entity_type', 'reimbursement')->where('entity_id', $reimbursement->id)->where('action_type', 'CLAIM_UPDATED')->firstOrFail();
        $this->assertNull($log->before_state['report_template_data']);
        $this->assertEquals($this->template, $log->after_state['report_template_data']);
    }

    // ---------- Cash advances ----------

    public function test_cash_advance_store_persists_template_json_string(): void
    {
        $response = $this->withHeaders($this->auth())->post('/api/cash-advances', [
            'purpose' => 'Field work',
            'amount' => 1000,
            'expected_disbursement_date' => Carbon::now()->addDays(2)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(9)->toDateString(),
            'documents' => [UploadedFile::fake()->create('request.pdf', 100, 'application/pdf')],
            'report_template_data' => json_encode($this->template),
        ]);

        $response->assertStatus(201);
        $this->assertEquals($this->template, $response->json('data.report_template_data'));
        $this->assertNotNull($response->json('data.document.file_url'));

        $id = $response->json('data.id');
        $this->assertEquals($this->template, CashAdvance::findOrFail($id)->report_template_data);

        $log = AuditLog::where('entity_type', 'cash_advance')->where('entity_id', $id)->where('action_type', 'CASH_ADVANCE_SUBMITTED')->firstOrFail();
        $this->assertEquals($this->template, $log->after_state['report_template_data']);
    }

    public function test_cash_advance_manual_upload_without_template_still_works(): void
    {
        $response = $this->withHeaders($this->auth())->post('/api/cash-advances', [
            'purpose' => 'Field work',
            'amount' => 1000,
            'expected_disbursement_date' => Carbon::now()->addDays(2)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(9)->toDateString(),
            'documents' => [UploadedFile::fake()->create('request.pdf', 100, 'application/pdf')],
        ]);

        $response->assertStatus(201);
        $this->assertNull($response->json('data.report_template_data'));
    }

    public function test_cash_advance_update_persists_template_array_and_logs_audit(): void
    {
        $advance = $this->makeCashAdvance(['status' => 'pending']);

        $response = $this->withHeaders($this->auth())->putJson('/api/cash-advances/' . $advance->id, [
            'purpose' => 'Updated purpose',
            'report_template_data' => $this->template,
        ]);

        $response->assertStatus(200);
        $this->assertEquals($this->template, $advance->fresh()->report_template_data);

        $log = AuditLog::where('entity_type', 'cash_advance')->where('entity_id', $advance->id)->where('action_type', 'CASH_ADVANCE_UPDATED')->firstOrFail();
        $this->assertEquals($this->template, $log->after_state['report_template_data']);
    }

    public function test_cash_advance_update_without_template_keeps_existing_template(): void
    {
        $advance = $this->makeCashAdvance(['status' => 'pending', 'report_template_data' => $this->template]);

        $this->withHeaders($this->auth())->putJson('/api/cash-advances/' . $advance->id, ['purpose' => 'Only purpose'])
            ->assertStatus(200);

        $this->assertEquals($this->template, $advance->fresh()->report_template_data);
    }

    // ---------- Liquidations ----------

    private function liquidationReceiptsJson(Receipt $receipt, float $amount): string
    {
        return json_encode([[
            'id' => $receipt->id,
            'vendor_name' => 'Vendor',
            'transaction_date' => '2026-06-12',
            'total_amount' => $amount,
        ]]);
    }

    public function test_liquidation_store_persists_template_json_string_with_report_attachment(): void
    {
        $advance = $this->makeCashAdvance();
        $receipt = $this->makeReceipt('b');

        $response = $this->withHeaders($this->auth())->post('/api/liquidations', [
            'cash_advance_id' => $advance->id,
            'receipts' => $this->liquidationReceiptsJson($receipt, 5000),
            'total_expense_amount' => 5000,
            'report_attachment' => UploadedFile::fake()->create('liquidation.pdf', 100, 'application/pdf'),
            'report_template_data' => json_encode($this->template),
        ]);

        $response->assertStatus(210);
        $response->assertJsonPath('data.report_template_data.subject', $this->template['subject']);
        $this->assertNotNull($response->json('data.report_url'));

        $liquidation = Liquidation::firstOrFail();
        $this->assertEquals($this->template, $liquidation->report_template_data);

        $log = AuditLog::where('entity_type', 'liquidation')->where('entity_id', $liquidation->id)->where('action_type', 'LIQUIDATION_SUBMITTED')->firstOrFail();
        $this->assertEquals($this->template, $log->after_state['report_template_data']);

        $this->withHeaders($this->auth())->getJson('/api/liquidations/' . $liquidation->id)
            ->assertStatus(200)
            ->assertJsonPath('report_template_data.signatoryName', 'John Doe');
        $this->withHeaders($this->auth())->getJson('/api/liquidations')
            ->assertStatus(200)
            ->assertJsonPath('0.report_template_data.signatoryName', 'John Doe');
    }

    public function test_liquidation_shortfall_still_requires_explanation_even_with_template(): void
    {
        $advance = $this->makeCashAdvance();
        $receipt = $this->makeReceipt('c');

        $response = $this->withHeaders($this->auth())->postJson('/api/liquidations', [
            'cash_advance_id' => $advance->id,
            'receipts' => [['id' => $receipt->id, 'vendor_name' => 'Vendor', 'total_amount' => 3000]],
            'total_expense_amount' => 3000,
            'report_template_data' => $this->template,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('shortfall_explanation');
        $this->assertDatabaseCount('liquidations', 0);
    }

    public function test_liquidation_shortfall_with_explanation_and_template_succeeds(): void
    {
        $advance = $this->makeCashAdvance();
        $receipt = $this->makeReceipt('d');

        $this->withHeaders($this->auth())->postJson('/api/liquidations', [
            'cash_advance_id' => $advance->id,
            'receipts' => [['id' => $receipt->id, 'vendor_name' => 'Vendor', 'total_amount' => 3000]],
            'total_expense_amount' => 3000,
            'shortfall_explanation' => 'Unused funds returned.',
            'report_template_data' => $this->template,
        ])->assertStatus(210);

        $this->assertEquals($this->template, Liquidation::firstOrFail()->report_template_data);
    }

    public function test_liquidation_manual_upload_without_template_still_works(): void
    {
        $advance = $this->makeCashAdvance();
        $receipt = $this->makeReceipt('e');

        $response = $this->withHeaders($this->auth())->post('/api/liquidations', [
            'cash_advance_id' => $advance->id,
            'receipts' => $this->liquidationReceiptsJson($receipt, 5000),
            'total_expense_amount' => 5000,
            'report_attachment' => UploadedFile::fake()->create('liquidation.pdf', 100, 'application/pdf'),
        ]);

        $response->assertStatus(210);
        $this->assertNull($response->json('data.report_template_data'));
        $this->assertNotNull($response->json('data.report_url'));
    }

    public function test_liquidation_update_persists_template_json_string_and_logs_audit(): void
    {
        $advance = $this->makeCashAdvance(['status' => 'under-review']);
        $liquidation = Liquidation::create([
            'cash_advance_id' => $advance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [],
            'total_expense_amount' => 5000.00,
            'outstanding_balance' => 5000.00,
        ]);

        $response = $this->withHeaders($this->auth())->post('/api/liquidations/' . $liquidation->id, [
            '_method' => 'PUT',
            'report_template_data' => json_encode($this->template),
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.report_template_data.subject', $this->template['subject']);
        $this->assertEquals($this->template, $liquidation->fresh()->report_template_data);

        $log = AuditLog::where('entity_type', 'liquidation')->where('entity_id', $liquidation->id)->where('action_type', 'LIQUIDATION_UPDATED')->firstOrFail();
        $this->assertNull($log->before_state['report_template_data']);
        $this->assertEquals($this->template, $log->after_state['report_template_data']);
    }
}
