<?php

namespace Tests\Feature;

use App\Modules\CashAdvances\Jobs\UpdatePrsCashAdvanceStatusJob;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Services\CashAdvanceService;
use App\Modules\CashAdvances\Services\PrsCashAdvanceService;
use App\Modules\Reimbursements\Jobs\UpdatePrsReimbursementStatusJob;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Services\OcrCallbackService;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrsIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private string $prsSecret = 'prs-integration-secret-key';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.prs.internal_secret' => $this->prsSecret,
            'services.prs.webhook_secret'  => $this->prsSecret,
            'services.prs.api_url'         => 'https://prs.local',
        ]);
    }

    private function prsHeaders(): array
    {
        return [
            'X-Internal-Secret' => $this->prsSecret,
            'Accept'            => 'application/json',
        ];
    }

    private function makeGdUploadedFile(string $format, string $filename, array $rgb = [10, 20, 30]): ?UploadedFile
    {
        $img = imagecreatetruecolor(40, 40);
        $color = imagecolorallocate($img, $rgb[0], $rgb[1], $rgb[2]);
        imagefilledrectangle($img, 0, 0, 39, 39, $color);
        $tmpPath = tempnam(sys_get_temp_dir(), 'prs_img_') . '.' . $format;

        $created = match ($format) {
            'gif'  => function_exists('imagegif') ? imagegif($img, $tmpPath) : false,
            'webp' => function_exists('imagewebp') ? imagewebp($img, $tmpPath) : false,
            'bmp'  => function_exists('imagebmp') ? imagebmp($img, $tmpPath) : false,
            default => false,
        };
        imagedestroy($img);

        if (!$created || !file_exists($tmpPath)) {
            return null;
        }

        $mime = match ($format) {
            'gif'  => 'image/gif',
            'webp' => 'image/webp',
            'bmp'  => 'image/bmp',
            default => 'application/octet-stream',
        };

        return new UploadedFile($tmpPath, $filename, $mime, null, true);
    }

    public function test_post_reimbursement_requires_valid_internal_secret(): void
    {
        $missing = $this->postJson('/api/internal/prs/reimbursements', []);
        $missing->assertStatus(401);

        $bad = $this->postJson('/api/internal/prs/reimbursements', [], [
            'X-Internal-Secret' => 'wrong-secret',
        ]);
        $bad->assertStatus(401);
    }

    public function test_post_reimbursement_normalizes_images_is_idempotent_and_allows_resubmit_after_rejection(): void
    {
        Storage::fake('supabase');
        Queue::fake();

        $files = [UploadedFile::fake()->image('receipt-1.jpg', 120, 120)];
        $gif = $this->makeGdUploadedFile('gif', 'receipt-2.gif', [255, 0, 0]);
        if ($gif) {
            $files[] = $gif;
        }
        $webp = $this->makeGdUploadedFile('webp', 'receipt-3.webp', [0, 255, 0]);
        if ($webp) {
            $files[] = $webp;
        }
        $bmp = $this->makeGdUploadedFile('bmp', 'receipt-4.bmp', [0, 0, 255]);
        if ($bmp) {
            $files[] = $bmp;
        }

        $payload = [
            'activity_id'    => 1001,
            'employee_email' => 'rep1001@sbsi.com',
            'employee_name'  => 'PRS Field Rep',
            'institution'    => 'Metro Clinic',
            'activity_type'  => 'Client Visit',
            'description'    => 'Client lunch and parking',
            'receipts'       => $files,
        ];

        $first = $this->post('/api/internal/prs/reimbursements', $payload, $this->prsHeaders());
        $first->assertStatus(201)
            ->assertJsonPath('status', 'pending');

        $reimbursementId = (int) $first->json('reimbursement_id');
        $this->assertGreaterThan(0, $reimbursementId);

        $reimbursement = Reimbursement::with('receipts')->findOrFail($reimbursementId);
        $this->assertSame(1001, (int) $reimbursement->prs_activity_id);
        $this->assertSame('prs', $reimbursement->source_system);

        $receipt = $reimbursement->receipts->first();
        $this->assertNotNull($receipt);
        foreach ((array) $receipt->file_type as $storedType) {
            $this->assertContains(strtolower((string) $storedType), ['jpg', 'jpeg', 'png', 'pdf']);
        }

        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'PRS_REIMBURSEMENT_RECEIVED',
            'entity_id'   => $reimbursementId,
        ]);

        // Idempotent retry while active -> 200
        $retryPayload = [
            'activity_id'    => 1001,
            'employee_email' => 'rep1001@sbsi.com',
            'employee_name'  => 'PRS Field Rep',
            'receipts'       => [UploadedFile::fake()->image('retry.png', 100, 100)],
        ];
        $second = $this->post('/api/internal/prs/reimbursements', $retryPayload, $this->prsHeaders());
        $second->assertStatus(200)
            ->assertJsonPath('reimbursement_id', $reimbursementId);

        // Terminal rejected status -> allows new 201 submission
        Reimbursement::whereKey($reimbursementId)->update(['status' => 'rejected']);

        $resubmitPayload = [
            'activity_id'    => 1001,
            'employee_email' => 'rep1001@sbsi.com',
            'employee_name'  => 'PRS Field Rep',
            'receipts'       => [UploadedFile::fake()->image('resubmit.png', 100, 100)],
        ];
        $third = $this->post('/api/internal/prs/reimbursements', $resubmitPayload, $this->prsHeaders());
        $third->assertStatus(201);
        $this->assertNotSame($reimbursementId, (int) $third->json('reimbursement_id'));
    }

    public function test_ocr_callback_updates_prs_reimbursement_php_amount_with_split_receipts_and_dispatches_job(): void
    {
        Queue::fake();

        $user = User::create([
            'email'      => 'ocr-split@sbsi.com',
            'name'       => 'OCR Split Rep',
            'role'       => 'employee',
            'department' => 'Sales & Marketing',
        ]);
        $category = ExpenseCategory::create(['name' => 'Travel & Meals']);

        $receipt = Receipt::create([
            'uploaded_by'     => $user->id,
            'file_path'       => ['receipts/page1.jpg', 'receipts/page2.jpg'],
            'file_hash'       => ['hash-split-1', 'hash-split-2'],
            'file_type'       => ['jpeg', 'jpeg'],
            'file_size_bytes' => [1024, 2048],
            'status'          => 'processing',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id'              => $user->id,
            'receipt_id'           => $receipt->id,
            'description'          => 'PRS Activity #2002',
            'amount'               => 0,
            'date'                 => '2026-11-23',
            'status'               => 'pending',
            'submitted_by_name'    => $user->name,
            'source_system'        => 'prs',
            'source_submission_id' => '2002',
            'prs_activity_id'      => 2002,
            'is_request'           => true,
        ]);
        $reimbursement->receipts()->attach([$receipt->id]);

        app(OcrCallbackService::class)->handle($receipt->id, [
            'split_receipts' => [
                [
                    'segment_index'        => 0,
                    'vendor_name'          => 'Jollibee',
                    'transaction_date'     => '2026-11-23',
                    'total_amount'         => 250.25,
                    'currency'             => 'PHP',
                    'expense_category'     => $category->name,
                    'ocr_confidence_score' => 0.95,
                    'status'               => 'processed',
                ],
                [
                    'segment_index'        => 1,
                    'vendor_name'          => 'Grab',
                    'transaction_date'     => '2026-11-23',
                    'total_amount'         => 149.75,
                    'currency'             => 'PHP',
                    'expense_category'     => $category->name,
                    'ocr_confidence_score' => 0.92,
                    'status'               => 'processed',
                ],
            ],
        ]);

        $reimbursement->refresh()->load('receipts');
        $this->assertSame('400.00', number_format((float) $reimbursement->amount, 2, '.', ''));
        $this->assertGreaterThanOrEqual(2, $reimbursement->receipts->count());

        Queue::assertPushed(UpdatePrsReimbursementStatusJob::class, function (UpdatePrsReimbursementStatusJob $job) use ($reimbursement) {
            return $job->reimbursementId === $reimbursement->id
                && $job->activityId === 2002;
        });
    }

    public function test_get_reimbursement_by_activity_returns_pull_status(): void
    {
        $user = User::create([
            'email'      => 'pull-prs@sbsi.com',
            'name'       => 'Pull Rep',
            'role'       => 'employee',
            'department' => 'Sales & Marketing',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id'              => $user->id,
            'description'          => 'PRS Activity #3003',
            'amount'               => 512.75,
            'date'                 => '2026-11-23',
            'status'               => 'granted',
            'submitted_by_name'    => $user->name,
            'source_system'        => 'prs',
            'source_submission_id' => '3003',
            'prs_activity_id'      => 3003,
            'is_request'           => true,
        ]);

        $res = $this->getJson('/api/internal/prs/reimbursements/by-activity/3003', $this->prsHeaders());
        $res->assertStatus(200)
            ->assertJsonPath('reimbursement_id', $reimbursement->id)
            ->assertJsonPath('activity_id', 3003)
            ->assertJsonPath('status', 'granted')
            ->assertJsonPath('is_reimbursed', true)
            ->assertJsonPath('amount', 512.75);
    }

    public function test_cash_advance_create_disburse_and_pre_vs_post_disbursement_removal(): void
    {
        Queue::fake();
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $admin = User::create([
            'name'       => 'Finance Admin',
            'email'      => 'finance-prs@sbsi.com',
            'role'       => 'admin',
            'grade'      => 'L4',
            'department' => 'Finance',
        ]);

        $itineraryId = 4004;
        $caPayload = [
            'itinerary_id'               => $itineraryId,
            'employee_email'             => 'sales-ca@sbsi.com',
            'employee_name'              => 'Sales Rep CA',
            'purpose'                    => 'Regional hospital blitz',
            'client_name'                => 'Cebu Doctors',
            'amount'                     => 3500.00,
            'expected_disbursement_date' => Carbon::now()->addDays(1)->toDateString(),
            'expected_liquidation_date'  => Carbon::now()->addDays(5)->toDateString(),
        ];

        $createRes = $this->postJson('/api/internal/prs/cash-advances', $caPayload, $this->prsHeaders());
        $createRes->assertStatus(201)
            ->assertJsonPath('itinerary_id', $itineraryId)
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('is_done', false)
            ->assertJsonPath('can_proceed', false)
            ->assertJsonPath('can_remove', true);

        $advanceId = (int) $createRes->json('cash_advance_id');

        // Delete before disbursement succeeds and logs PRS_CASH_ADVANCE_REMOVED
        $deleteBefore = $this->deleteJson("/api/internal/prs/cash-advances/by-itinerary/{$itineraryId}", [], $this->prsHeaders());
        $deleteBefore->assertStatus(200)
            ->assertJsonPath('removed', true)
            ->assertJsonPath('cash_advance_id', $advanceId);

        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'PRS_CASH_ADVANCE_REMOVED',
            'entity_id'   => $advanceId,
        ]);

        // Recreate for disbursement test
        $recreateRes = $this->postJson('/api/internal/prs/cash-advances', $caPayload, $this->prsHeaders());
        $recreateRes->assertStatus(201);
        $activeAdvance = CashAdvance::findOrFail((int) $recreateRes->json('cash_advance_id'));

        $token = $this->generateMockToken([
            'email'      => $admin->email,
            'role'       => $admin->role,
            'department' => $admin->department,
        ]);
        $disburseReq = Request::create('/api/cash-advances/' . $activeAdvance->id . '/disburse', 'POST');
        $disburseReq->headers->set('Authorization', 'Bearer ' . $token);

        $disbursed = app(CashAdvanceService::class)->disburseAdvance(
            $activeAdvance,
            $admin,
            ['payout_method' => 'Cash', 'channel' => 'Cash'],
            'password',
            $disburseReq
        );

        $this->assertSame('disbursed', $disbursed->status);

        $gating = app(PrsCashAdvanceService::class)->formatGatingPayload($disbursed);
        $this->assertTrue($gating['is_done']);
        $this->assertTrue($gating['can_proceed']);
        $this->assertFalse($gating['can_remove']);

        Queue::assertPushed(UpdatePrsCashAdvanceStatusJob::class, function (UpdatePrsCashAdvanceStatusJob $job) use ($disbursed, $itineraryId) {
            return $job->cashAdvanceId === $disbursed->id
                && $job->itineraryId === $itineraryId
                && $job->status === 'disbursed';
        });

        // Pull status reflects disbursed gating
        $pullRes = $this->getJson("/api/internal/prs/cash-advances/by-itinerary/{$itineraryId}", $this->prsHeaders());
        $pullRes->assertStatus(200)
            ->assertJsonPath('status', 'disbursed')
            ->assertJsonPath('is_done', true)
            ->assertJsonPath('can_proceed', true)
            ->assertJsonPath('can_remove', false);

        // Delete after disbursement returns 422
        $deleteAfter = $this->deleteJson("/api/internal/prs/cash-advances/by-itinerary/{$itineraryId}", [], $this->prsHeaders());
        $deleteAfter->assertStatus(422);
    }
}
