<?php

namespace Tests\Feature;

use App\Modules\Reimbursements\Jobs\DispatchReceiptToAiService;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TsInternalReimbursementTest extends TestCase
{
    use RefreshDatabase;

    private string $internalSecret = 'ts-serms-shared-secret-test';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.cms.internal_secret' => $this->internalSecret,
            'services.ts.internal_secret'  => $this->internalSecret,
        ]);

        Storage::fake('supabase');
        Queue::fake();
    }

    private function internalHeaders(?string $secret = null, bool $acceptJson = true): array
    {
        $headers = [];
        if ($acceptJson) {
            $headers['Accept'] = 'application/json';
        }
        if ($secret !== null) {
            $headers['X-Internal-Secret'] = $secret;
        }
        return $headers;
    }

    public function test_internal_ts_endpoints_return_401_when_secret_is_missing_or_invalid(): void
    {
        $this->postJson('/api/internal/ts/reimbursements', [], $this->internalHeaders())
            ->assertUnauthorized();

        $this->postJson('/api/internal/ts/reimbursements', [], $this->internalHeaders('wrong-secret'))
            ->assertUnauthorized();

        $this->getJson('/api/internal/ts/reimbursements/by-ticket/1', $this->internalHeaders())
            ->assertUnauthorized();

        $this->getJson('/api/internal/ts/reimbursements/by-ticket/1', $this->internalHeaders('wrong-secret'))
            ->assertUnauthorized();

        // Also returns 401 when no internal secret is configured at all
        config([
            'services.cms.internal_secret' => '',
            'services.ts.internal_secret'  => '',
        ]);
        putenv('INTERNAL_SERVICE_SECRET=');
        putenv('TS_INTERNAL_SECRET=');
        unset(
            $_ENV['INTERNAL_SERVICE_SECRET'],
            $_SERVER['INTERNAL_SERVICE_SECRET'],
            $_ENV['TS_INTERNAL_SECRET'],
            $_SERVER['TS_INTERNAL_SECRET']
        );

        $this->getJson('/api/internal/ts/reimbursements/by-ticket/1', $this->internalHeaders('anything'))
            ->assertUnauthorized();
    }

    public function test_internal_ts_endpoint_accepts_ts_specific_internal_secret(): void
    {
        config([
            'services.cms.internal_secret' => 'cms-only-secret',
            'services.ts.internal_secret'  => 'ts-only-secret',
        ]);

        // Wrong secret for TS must fail
        $this->getJson('/api/internal/ts/reimbursements/by-ticket/999', $this->internalHeaders('cms-only-secret'))
            ->assertUnauthorized();

        // TS-specific secret passes auth (returns 404 since ticket 999 has no reimbursement)
        $this->getJson('/api/internal/ts/reimbursements/by-ticket/999', $this->internalHeaders('ts-only-secret'))
            ->assertNotFound();
    }

    public function test_inbound_ts_reimbursement_validates_required_fields_and_files_returning_json_422(): void
    {
        // Intentionally omit Accept: application/json to confirm multipart callers always get JSON 422
        $response = $this->withHeaders($this->internalHeaders($this->internalSecret, false))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id' => 0,
                'amount'    => 0,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors([
                'ticket_id',
                'ticket_number',
                'employee_email',
                'employee_name',
                'amount',
                'description',
                'expense_date',
                'receipts',
            ]);

        // Unsupported mime and >2048KB rejection
        $badFileRes = $this->withHeaders($this->internalHeaders($this->internalSecret))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id'      => 10,
                'ticket_number'  => 'TKT-0010',
                'employee_email' => 'eng@sbsi.com',
                'employee_name'  => 'Engineer One',
                'amount'         => 500,
                'description'    => 'Spare part purchase',
                'expense_date'   => '2026-11-20',
                'receipts'       => [
                    UploadedFile::fake()->create('notes.txt', 10, 'text/plain'),
                    UploadedFile::fake()->create('huge.pdf', 3000, 'application/pdf'),
                ],
            ]);

        $badFileRes->assertStatus(422)
            ->assertJsonValidationErrors(['receipts.0', 'receipts.1']);
    }

    public function test_inbound_ts_reimbursement_uploads_to_supabase_dispatches_ocr_and_creates_pending_claim(): void
    {
        $accounting = User::create([
            'auth_id'    => 501,
            'email'      => 'accounting@sbsi.com',
            'name'       => 'Accounting Admin',
            'role'       => 'admin',
            'department' => 'Accounting',
        ]);

        $file1 = UploadedFile::fake()->image('or-page1.png');
        $file2 = UploadedFile::fake()->create('invoice.pdf', 200, 'application/pdf');
        $expectedHash1 = hash_file('sha256', $file1->getRealPath());
        $expectedHash2 = hash_file('sha256', $file2->getRealPath());

        $response = $this->withHeaders($this->internalHeaders($this->internalSecret))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id'        => 42,
                'ticket_number'    => 'TKT-0042',
                'employee_email'   => 'engineer@sbsi.com',
                'employee_name'    => 'Juan Engineer',
                'employee_id'      => '707',
                'department'       => 'Engineering',
                'amount'           => 1250.50,
                'expense_category' => 'Spare Parts',
                'description'      => 'Replacement valve for client analyzer',
                'expense_date'     => '2026-11-20',
                'receipts'         => [$file1, $file2],
            ]);

        $response->assertCreated();
        $reimbursementId = $response->json('reimbursement_id');
        $expectedRef = 'RMB-' . date('Y') . '-' . str_pad((string) $reimbursementId, 5, '0', STR_PAD_LEFT);

        $response->assertJsonPath('reference_no', $expectedRef)
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('data.ticket_id', 42)
            ->assertJsonPath('data.ticket_number', 'TKT-0042')
            ->assertJsonPath('data.source_system', 'ts')
            ->assertJsonPath('data.source_submission_id', '42')
            ->assertJsonPath('data.is_request', true)
            ->assertJsonPath('data.reference_no', $expectedRef);

        $this->assertDatabaseHas('reimbursements', [
            'id'                   => $reimbursementId,
            'ticket_id'            => 42,
            'ticket_number'        => 'TKT-0042',
            'source_system'        => 'ts',
            'source_submission_id' => '42',
            'is_request'           => true,
            'status'               => 'pending',
            'amount'               => 1250.50,
        ]);

        $reimbursement = Reimbursement::with('receipts')->findOrFail($reimbursementId);
        $this->assertCount(2, $reimbursement->receipts);

        foreach ($reimbursement->receipts as $receipt) {
            $this->assertFalse((bool) $receipt->is_draft);
            $this->assertSame('processing', $receipt->status);
            Storage::disk('supabase')->assertExists($receipt->file_path[0]);
        }

        $storedHashes = $reimbursement->receipts->pluck('file_hash')->flatten()->all();
        $this->assertContains($expectedHash1, $storedHashes);
        $this->assertContains($expectedHash2, $storedHashes);

        Queue::assertPushed(DispatchReceiptToAiService::class, 2);

        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'TS_REIMBURSEMENT_RECEIVED',
            'entity_type' => 'reimbursement',
            'entity_id'   => $reimbursementId,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id'     => $reimbursement->user_id,
            'type'        => 'reimbursement_submitted',
            'record_type' => 'reimbursement',
            'record_id'   => $reimbursementId,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id'     => $accounting->id,
            'type'        => 'admin_reimbursement_submitted',
            'record_type' => 'reimbursement',
            'record_id'   => $reimbursementId,
        ]);
    }

    public function test_inbound_ts_reimbursement_supports_nested_employee_purpose_date_category_id_and_attachments(): void
    {
        $category = ExpenseCategory::firstOrCreate(['name' => 'Travel']);
        $employee = User::create([
            'auth_id'    => 88,
            'email'      => 'field.tech@sbsi.com',
            'name'       => 'Field Tech',
            'role'       => 'employee',
            'department' => 'Field Service',
        ]);

        $response = $this->withHeaders($this->internalHeaders($this->internalSecret))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id'        => 88,
                'ticket_number'    => 'TKT-0088',
                'employee'         => [
                    'id'         => 88,
                    'email'      => 'FIELD.TECH@SBSI.COM',
                    'name'       => 'Field Tech',
                    'department' => 'Field Service',
                ],
                'amount'           => 450.00,
                'expense_category' => (string) $category->id,
                'purpose'          => 'Toll and fuel for onsite repair',
                'date'             => '2026-11-21',
                'attachments'      => [
                    UploadedFile::fake()->createWithContent(
                        'toll.jpg',
                        hex2bin('ffd8ffe000104a46494600010101004800480000ffdb004300ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc0000b080001000101011100ffc40014000100000000000000000000000000000009ffc40014100100000000000000000000000000000000ffda0008010100003f007f00ffd9')
                    ),
                ],
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.user_id', $employee->id)
            ->assertJsonPath('data.expense_category_id', $category->id)
            ->assertJsonPath('data.description', 'Toll and fuel for onsite repair');
    }

    public function test_inbound_ts_reimbursement_is_idempotent_while_active_and_allows_new_claim_after_rejection(): void
    {
        $firstRes = $this->withHeaders($this->internalHeaders($this->internalSecret))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id'      => 77,
                'ticket_number'  => 'TKT-0077',
                'employee_email' => 'tech@sbsi.com',
                'employee_name'  => 'Tech One',
                'amount'         => 800.00,
                'description'    => 'Initial claim',
                'expense_date'   => '2026-11-20',
                'receipts'       => [UploadedFile::fake()->image('first.png')],
            ]);

        $firstRes->assertCreated();
        $firstId = $firstRes->json('reimbursement_id');

        // Retry while pending -> returns 200 OK with existing claim and uploads nothing new
        $retryRes = $this->withHeaders($this->internalHeaders($this->internalSecret))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id'      => 77,
                'ticket_number'  => 'TKT-0077',
                'employee_email' => 'tech@sbsi.com',
                'employee_name'  => 'Tech One',
                'amount'         => 800.00,
                'description'    => 'Initial claim',
                'expense_date'   => '2026-11-20',
                'receipts'       => [UploadedFile::fake()->image('retry.png')],
            ]);

        $retryRes->assertOk()
            ->assertJsonPath('reimbursement_id', $firstId)
            ->assertJsonPath('status', 'pending');

        $this->assertSame(1, Reimbursement::where('ticket_id', 77)->count());

        // Terminally reject the first claim -> must allow creating a new claim for ticket_id 77
        $firstModel = Reimbursement::findOrFail($firstId);
        $firstModel->update([
            'status'            => 'rejected',
            'rejection_comment' => 'Blurred OR attachment',
        ]);

        $secondRes = $this->withHeaders($this->internalHeaders($this->internalSecret))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id'      => 77,
                'ticket_number'  => 'TKT-0077',
                'employee_email' => 'tech@sbsi.com',
                'employee_name'  => 'Tech One',
                'amount'         => 820.00,
                'description'    => 'Resubmitted clearer claim',
                'expense_date'   => '2026-11-21',
                'receipts'       => [UploadedFile::fake()->image('clearer.png', 24, 24)],
            ]);

        $secondRes->assertCreated();
        $secondId = $secondRes->json('reimbursement_id');
        $this->assertNotSame($firstId, $secondId);
        $this->assertSame(2, Reimbursement::where('ticket_id', 77)->count());

        // Pull endpoint returns the latest claim
        $pullRes = $this->getJson('/api/internal/ts/reimbursements/by-ticket/77', $this->internalHeaders($this->internalSecret));
        $pullRes->assertOk()
            ->assertJsonPath('reimbursement_id', $secondId)
            ->assertJsonPath('status', 'pending');
    }

    public function test_inbound_ts_reimbursement_cleans_up_supabase_files_when_duplicate_file_hash_fails(): void
    {
        $user = User::create([
            'email' => 'dup@sbsi.com',
            'name'  => 'Dup User',
            'role'  => 'employee',
        ]);

        $dupFile = UploadedFile::fake()->image('existing.png');
        $dupHash = hash_file('sha256', $dupFile->getRealPath());

        Receipt::create([
            'uploaded_by'     => $user->id,
            'file_path'       => ['receipts/existing.png'],
            'file_hash'       => [$dupHash],
            'file_type'       => ['png'],
            'file_size_bytes' => [1024],
            'status'          => 'processed',
        ]);

        $freshFile = UploadedFile::fake()->image('fresh.png');

        $response = $this->withHeaders($this->internalHeaders($this->internalSecret))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id'      => 91,
                'ticket_number'  => 'TKT-0091',
                'employee_email' => 'dup@sbsi.com',
                'employee_name'  => 'Dup User',
                'amount'         => 300.00,
                'description'    => 'Duplicate file test',
                'expense_date'   => '2026-11-21',
                'receipts'       => [$freshFile, $dupFile],
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['file_hash']);

        $this->assertDatabaseMissing('reimbursements', ['ticket_id' => 91]);
        $this->assertSame([], Storage::disk('supabase')->allFiles('receipts'));
    }

    public function test_multipart_post_to_ts_reimbursements_with_idempotency_key_is_safe(): void
    {
        $file = UploadedFile::fake()->image('idemp.png');

        $headers = array_merge($this->internalHeaders($this->internalSecret), [
            'X-Idempotency-Key' => 'ts-multipart-key-001',
        ]);

        $payload = [
            'ticket_id'      => 105,
            'ticket_number'  => 'TKT-0105',
            'employee_email' => 'idemp@sbsi.com',
            'employee_name'  => 'Idemp User',
            'amount'         => 600.00,
            'description'    => 'Idempotency key test',
            'expense_date'   => '2026-11-21',
            'receipts'       => [$file],
        ];

        $first = $this->withHeaders($headers)->post('/api/internal/ts/reimbursements', $payload);
        $first->assertCreated();

        $replay = $this->withHeaders($headers)->post('/api/internal/ts/reimbursements', $payload);
        $replay->assertCreated()
            ->assertHeader('X-Idempotent-Replay', 'true')
            ->assertJsonPath('reimbursement_id', $first->json('reimbursement_id'));

        $differentFilePayload = array_merge($payload, [
            'receipts' => [UploadedFile::fake()->image('different.png', 32, 32)],
        ]);

        $mismatch = $this->withHeaders($headers)->post('/api/internal/ts/reimbursements', $differentFilePayload);
        $mismatch->assertStatus(422)
            ->assertJson(['message' => 'Idempotency key reused with different request payload.']);
    }

    public function test_by_ticket_endpoint_returns_404_when_missing_and_returns_status_and_history_when_found(): void
    {
        $this->getJson('/api/internal/ts/reimbursements/by-ticket/999999', $this->internalHeaders($this->internalSecret))
            ->assertNotFound();

        $createRes = $this->withHeaders($this->internalHeaders($this->internalSecret))
            ->post('/api/internal/ts/reimbursements', [
                'ticket_id'      => 202,
                'ticket_number'  => 'TKT-0202',
                'employee_email' => 'status@sbsi.com',
                'employee_name'  => 'Status User',
                'amount'         => 999.00,
                'description'    => 'Calibration service expense',
                'expense_date'   => '2026-11-21',
                'receipts'       => [UploadedFile::fake()->image('status.png')],
            ]);
        $createRes->assertCreated();
        $reimbursementId = $createRes->json('reimbursement_id');

        $pullRes = $this->getJson('/api/internal/ts/reimbursements/by-ticket/202', $this->internalHeaders($this->internalSecret));

        $pullRes->assertOk()
            ->assertJsonPath('reimbursement_id', $reimbursementId)
            ->assertJsonPath('reference_no', $createRes->json('reference_no'))
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('ticket_id', 202)
            ->assertJsonPath('ticket_number', 'TKT-0202')
            ->assertJsonPath('amount', 999)
            ->assertJsonStructure([
                'reimbursement_id',
                'reference_no',
                'status',
                'message',
                'ticket_id',
                'ticket_number',
                'amount',
                'rejection_comment',
                'approved_at',
                'updated_at',
                'history',
            ]);

        $history = $pullRes->json('history');
        $this->assertCount(1, $history);
        $this->assertSame('TS_REIMBURSEMENT_RECEIVED', $history[0]['action_type']);
        $this->assertSame('ts', $history[0]['domain']);
        $this->assertSame('Ticketing Integration', $history[0]['domain_label']);
        $this->assertNull($history[0]['ip_address']);
    }
}
