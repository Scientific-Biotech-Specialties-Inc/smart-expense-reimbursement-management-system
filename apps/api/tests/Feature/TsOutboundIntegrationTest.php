<?php

namespace Tests\Feature;

use App\Modules\Reimbursements\Jobs\UpdatePrsReimbursementStatusJob;
use App\Modules\Reimbursements\Jobs\UpdateTsReimbursementStatusJob;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpClientRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TsOutboundIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $accounting;
    private string $employeeToken;
    private string $accountingToken;
    private string $tsSecret = 'ts-outbound-shared-secret';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.ts.api_url'                  => 'https://ts.test/api/ticket',
            'services.ts.reimbursement_status_url' => 'https://ts.test/api/ticket/internal/reimbursement-status',
            'services.ts.internal_secret'          => $this->tsSecret,
            'services.ts.timeout'                  => 10,
        ]);

        $this->employee = User::create([
            'auth_id'    => 201,
            'email'      => 'engineer@sbsi.com',
            'name'       => 'Eng Dela Cruz',
            'role'       => 'employee',
            'department' => 'Engineering',
        ]);

        $this->accounting = User::create([
            'auth_id'    => 202,
            'email'      => 'accounting@sbsi.com',
            'name'       => 'Maria Accounting',
            'role'       => 'admin',
            'department' => 'Accounting',
        ]);

        $this->employeeToken = $this->generateMockToken([
            'sub'        => $this->employee->auth_id,
            'email'      => $this->employee->email,
            'first_name' => 'Eng',
            'last_name'  => 'Dela Cruz',
            'role'       => 'employee',
            'department' => 'Engineering',
        ]);

        $this->accountingToken = $this->generateMockToken([
            'sub'        => $this->accounting->auth_id,
            'email'      => $this->accounting->email,
            'first_name' => 'Maria',
            'last_name'  => 'Accounting',
            'role'       => 'admin',
            'department' => 'Accounting',
        ]);

        Cache::put("user_permissions:{$this->accounting->auth_id}", [
            'serms.reimbursements.manage',
        ], 3600);
    }

    public function test_approving_and_granting_ts_claim_dispatches_ts_job_and_never_prs_job(): void
    {
        Queue::fake();

        $tsClaim = Reimbursement::create([
            'user_id'              => $this->employee->id,
            'description'          => 'TS ticket expense',
            'amount'               => 1500.00,
            'date'                 => '2026-11-20',
            'status'               => 'pending',
            'submitted_by_name'    => $this->employee->name,
            'source_system'        => 'ts',
            'source_submission_id' => '55',
            'ticket_id'            => 55,
            'ticket_number'        => 'TKT-0055',
            'is_request'           => true,
        ]);

        $this->withHeaders(['Authorization' => 'Bearer ' . $this->accountingToken])
            ->postJson("/api/reimbursements/{$tsClaim->id}/approve", [])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        Queue::assertNotPushed(UpdatePrsReimbursementStatusJob::class);
        Queue::assertPushed(UpdateTsReimbursementStatusJob::class, function (UpdateTsReimbursementStatusJob $job) use ($tsClaim) {
            return $job->reimbursementId === $tsClaim->id
                && $job->ticketId === 55
                && $job->status === 'approved';
        });

        $this->withHeaders(['Authorization' => 'Bearer ' . $this->accountingToken])
            ->postJson("/api/reimbursements/{$tsClaim->id}/grant", [
                'granted_by'        => $this->accounting->name,
                'payout_method'     => 'Cash',
                'granter_signature' => 'data:image/png;base64,sig',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'granted');

        Queue::assertNotPushed(UpdatePrsReimbursementStatusJob::class);
        Queue::assertPushed(UpdateTsReimbursementStatusJob::class, function (UpdateTsReimbursementStatusJob $job) use ($tsClaim) {
            return $job->reimbursementId === $tsClaim->id
                && $job->ticketId === 55
                && $job->status === 'granted';
        });
    }

    public function test_revising_and_rejecting_ts_claim_dispatches_ts_status_job(): void
    {
        Queue::fake();

        $tsClaim = Reimbursement::create([
            'user_id'              => $this->employee->id,
            'description'          => 'TS claim for revision',
            'amount'               => 700.00,
            'date'                 => '2026-11-20',
            'status'               => 'pending',
            'submitted_by_name'    => $this->employee->name,
            'source_system'        => 'ts',
            'source_submission_id' => '66',
            'ticket_id'            => 66,
            'ticket_number'        => 'TKT-0066',
            'is_request'           => true,
        ]);

        $this->withHeaders(['Authorization' => 'Bearer ' . $this->accountingToken])
            ->postJson("/api/reimbursements/{$tsClaim->id}/reject", [
                'action'  => 'revise',
                'comment' => 'Please attach official BIR receipt.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'revise');

        Queue::assertPushed(UpdateTsReimbursementStatusJob::class, function (UpdateTsReimbursementStatusJob $job) use ($tsClaim) {
            return $job->reimbursementId === $tsClaim->id
                && $job->status === 'revise'
                && $job->rejectionComment === 'Please attach official BIR receipt.';
        });

        $this->withHeaders(['Authorization' => 'Bearer ' . $this->accountingToken])
            ->postJson("/api/reimbursements/{$tsClaim->id}/reject", [
                'action'  => 'reject',
                'comment' => 'Duplicate and invalid claim.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        Queue::assertPushed(UpdateTsReimbursementStatusJob::class, function (UpdateTsReimbursementStatusJob $job) use ($tsClaim) {
            return $job->reimbursementId === $tsClaim->id
                && $job->status === 'rejected'
                && $job->rejectionComment === 'Duplicate and invalid claim.';
        });

        Queue::assertNotPushed(UpdatePrsReimbursementStatusJob::class);
    }

    public function test_prs_claim_still_dispatches_prs_job_and_not_ts_job(): void
    {
        Queue::fake();

        $prsClaim = Reimbursement::create([
            'user_id'              => $this->employee->id,
            'description'          => 'PRS claim',
            'amount'               => 500.00,
            'date'                 => '2026-11-20',
            'status'               => 'submitted',
            'submitted_by_name'    => $this->employee->name,
            'source_system'        => 'prs',
            'source_submission_id' => '999',
            'is_request'           => true,
        ]);

        $this->withHeaders(['Authorization' => 'Bearer ' . $this->accountingToken])
            ->postJson("/api/reimbursements/{$prsClaim->id}/approve", [])
            ->assertOk();

        Queue::assertPushed(UpdatePrsReimbursementStatusJob::class, fn ($job) => (string) $job->sourceSubmissionId === '999');
        Queue::assertNotPushed(UpdateTsReimbursementStatusJob::class);
    }

    public function test_update_ts_reimbursement_status_job_posts_payload_with_both_headers_and_handles_unconfigured_or_failure(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id'              => $this->employee->id,
            'description'          => 'Webhook push claim',
            'amount'               => 1100.00,
            'date'                 => '2026-11-21',
            'status'               => 'approved',
            'approved_at'          => now(),
            'submitted_by_name'    => $this->employee->name,
            'source_system'        => 'ts',
            'source_submission_id' => '70',
            'ticket_id'            => 70,
            'ticket_number'        => 'TKT-0070',
            'is_request'           => true,
        ]);

        Http::fake([
            'https://ts.test/api/ticket/internal/reimbursement-status' => Http::sequence()
                ->push(['ok' => true], 200)
                ->push(['message' => 'Internal error'], 500),
        ]);

        UpdateTsReimbursementStatusJob::dispatchSync(
            $reimbursement->id,
            70,
            'TKT-0070',
            'approved',
            null
        );

        Http::assertSent(function (HttpClientRequest $req) use ($reimbursement) {
            return $req->url() === 'https://ts.test/api/ticket/internal/reimbursement-status'
                && $req->hasHeader('X-Internal-Token', $this->tsSecret)
                && $req->hasHeader('X-Internal-Secret', $this->tsSecret)
                && $req['ticket_id'] === 70
                && $req['ticket_number'] === 'TKT-0070'
                && $req['reimbursement_id'] === $reimbursement->id
                && $req['reference_no'] === $reimbursement->reference_no
                && $req['status'] === 'approved';
        });

        // 500 failure must throw so queue retries
        $this->expectException(\RuntimeException::class);
        UpdateTsReimbursementStatusJob::dispatchSync(
            $reimbursement->id,
            70,
            'TKT-0070',
            'approved',
            null
        );
    }

    public function test_update_ts_reimbursement_status_job_skips_cleanly_when_unconfigured(): void
    {
        config(['services.ts.reimbursement_status_url' => '']);
        Http::fake();

        UpdateTsReimbursementStatusJob::dispatchSync(1, 70, 'TKT-0070', 'approved', null);

        Http::assertNothingSent();
    }

    public function test_ts_tickets_proxy_normalizes_and_batch_enriches_with_graceful_fallback(): void
    {
        $reimbOlderRejected = Reimbursement::create([
            'user_id'           => $this->employee->id,
            'description'       => 'Old rejected attempt',
            'amount'            => 300.00,
            'date'              => '2026-11-19',
            'status'            => 'rejected',
            'ticket_id'         => 101,
            'ticket_number'     => 'TKT-0101',
            'source_system'     => 'ts',
            'submitted_by_name' => $this->employee->name,
        ]);

        $reimbLatest = Reimbursement::create([
            'user_id'           => $this->employee->id,
            'description'       => 'Latest active claim',
            'amount'            => 450.00,
            'date'              => '2026-11-21',
            'status'            => 'approved',
            'ticket_id'         => 101,
            'ticket_number'     => 'TKT-0101',
            'source_system'     => 'ts',
            'submitted_by_name' => $this->employee->name,
        ]);

        // Unauthenticated call returns 401
        $this->getJson('/api/ts/tickets')->assertUnauthorized();

        Http::fake([
            'https://ts.test/api/ticket/internal/tickets*' => Http::sequence()
                ->push([
                    'data' => [
                        [
                            'ticket_ID'      => 101,
                            'ticket_number'  => 'TKT-0101',
                            'title'          => 'Calibrate centrifuge',
                            'status_name'    => 'Resolved',
                            'priority'       => 'High',
                            'assignee'       => [
                                'name'       => 'Eng Dela Cruz',
                                'email'      => 'engineer@sbsi.com',
                                'department' => 'Engineering',
                            ],
                            'created_at'     => '2026-11-19T08:00:00Z',
                            'updated_at'     => '2026-11-21T09:00:00Z',
                        ],
                        [
                            'ticket_id'      => 102,
                            'ticket_number'  => 'TKT-0102',
                            'title'          => 'Replace sensor',
                            'status'         => 'Pending Evaluation',
                            'priority'       => 'Medium',
                            'assignee_name'  => 'Eng Two',
                            'assignee_email' => 'eng2@sbsi.com',
                            'department'     => 'Engineering',
                            'created_at'     => '2026-11-20T10:00:00Z',
                            'updated_at'     => '2026-11-20T11:00:00Z',
                        ],
                    ],
                ], 200)
                ->pushStatus(503),
        ]);

        $res = $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken])
            ->getJson('/api/ts/tickets?search=calib&status=Resolved&limit=50');

        $res->assertOk()
            ->assertJsonPath('available', true)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.ticket_id', 101)
            ->assertJsonPath('data.0.ticket_number', 'TKT-0101')
            ->assertJsonPath('data.0.status', 'Resolved')
            ->assertJsonPath('data.0.assignee_name', 'Eng Dela Cruz')
            ->assertJsonPath('data.0.reimbursement.reimbursement_id', $reimbLatest->id)
            ->assertJsonPath('data.0.reimbursement.reference_no', $reimbLatest->reference_no)
            ->assertJsonPath('data.0.reimbursement.status', 'approved')
            ->assertJsonPath('data.0.reimbursement.reimbursement_status', 'approved')
            ->assertJsonPath('data.0.reimbursement.amount', 450)
            ->assertJsonPath('data.0.reimbursement.reimbursement_amount', 450)
            ->assertJsonPath('data.1.ticket_id', 102)
            ->assertJsonPath('data.1.reimbursement', null);

        $this->assertNotSame($reimbOlderRejected->id, $res->json('data.0.reimbursement.reimbursement_id'));

        Http::assertSent(function (HttpClientRequest $req) {
            return str_starts_with($req->url(), 'https://ts.test/api/ticket/internal/tickets')
                && $req->hasHeader('X-Internal-Token', $this->tsSecret)
                && $req->hasHeader('X-Internal-Secret', $this->tsSecret)
                && str_contains($req->url(), 'search=calib')
                && str_contains($req->url(), 'status=Resolved')
                && str_contains($req->url(), 'limit=50');
        });

        // Graceful fallback when TS returns 503
        $offlineRes = $this->withHeaders(['Authorization' => 'Bearer ' . $this->employeeToken])
            ->getJson('/api/ts/tickets');

        $offlineRes->assertOk()
            ->assertJsonPath('available', false)
            ->assertJsonPath('data', []);
    }

    public function test_manual_reimbursement_store_and_update_persist_ticket_id_and_ticket_number(): void
    {
        Storage::fake('supabase');

        $cat = ExpenseCategory::firstOrCreate(['name' => 'Field Service']);
        $receipt = Receipt::create([
            'uploaded_by'         => $this->employee->id,
            'file_path'           => ['receipts/ts-manual.png'],
            'file_hash'           => [hash('sha256', 'ts-manual')],
            'file_type'           => ['png'],
            'file_size_bytes'     => [100],
            'vendor_name'         => 'Calibration Depot',
            'transaction_date'    => '2026-11-21',
            'total_amount'        => 600.00,
            'expense_category_id' => $cat->id,
            'status'              => 'processed',
        ]);

        $createRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->employeeToken,
            'Accept'        => 'application/json',
        ])->post('/api/reimbursements', [
            'description'         => 'Manual linked ticket claim',
            'expense_category_id' => $cat->id,
            'ticket_id'           => 303,
            'ticket_number'       => 'TKT-0303',
            'event_type'          => 'Field Service',
            'amount'              => 600.00,
            'date'                => '2026-11-21',
            'report_file'         => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
            'receipt_ids'         => [$receipt->id],
        ]);

        $createRes->assertCreated()
            ->assertJsonPath('data.ticket_id', 303)
            ->assertJsonPath('data.ticket_number', 'TKT-0303');

        $reimbId = $createRes->json('data.id');

        $updateRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->employeeToken,
            'Accept'        => 'application/json',
        ])->patchJson("/api/reimbursements/{$reimbId}", [
            'ticket_id'     => 304,
            'ticket_number' => 'TKT-0304',
        ]);

        $updateRes->assertOk()
            ->assertJsonPath('data.ticket_id', 304)
            ->assertJsonPath('data.ticket_number', 'TKT-0304');

        $this->assertDatabaseHas('reimbursements', [
            'id'            => $reimbId,
            'ticket_id'     => 304,
            'ticket_number' => 'TKT-0304',
        ]);
    }
}
