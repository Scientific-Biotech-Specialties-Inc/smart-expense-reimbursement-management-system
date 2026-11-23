<?php

namespace Tests\Feature;

use App\Modules\Reimbursements\Jobs\UpdatePrsReimbursementStatusJob;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Services\OcrCallbackService;
use App\Modules\Reimbursements\Services\PrsActivityReimbursementService;
use App\Modules\Reimbursements\Services\ReceiptService;
use App\Modules\Reimbursements\Services\ReimbursementService;
use App\Modules\Shared\Http\Middleware\AuthenticateInternalService;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PrsActivityReimbursementIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticate_internal_service_accepts_prs_secret_via_header_or_bearer(): void
    {
        config(['services.prs.internal_secret' => 'prs-secret-123']);
        $middleware = new AuthenticateInternalService();

        $headerReq = Request::create('/api/internal/prs/reimbursements', 'POST');
        $headerReq->headers->set('X-Internal-Secret', 'prs-secret-123');
        $res1 = $middleware->handle($headerReq, fn () => response()->json(['ok' => true]));
        $this->assertSame(200, $res1->getStatusCode());

        $bearerReq = Request::create('/api/internal/prs/reimbursements', 'POST');
        $bearerReq->headers->set('Authorization', 'Bearer prs-secret-123');
        $res2 = $middleware->handle($bearerReq, fn () => response()->json(['ok' => true]));
        $this->assertSame(200, $res2->getStatusCode());

        $badReq = Request::create('/api/internal/prs/reimbursements', 'POST');
        $badReq->headers->set('Authorization', 'Bearer wrong-secret');
        $res3 = $middleware->handle($badReq, fn () => response()->json(['ok' => true]));
        $this->assertSame(401, $res3->getStatusCode());
    }

    public function test_normalize_uploaded_image_file_converts_gif_and_keeps_jpeg_untouched(): void
    {
        $service = app(ReceiptService::class);

        $jpeg = UploadedFile::fake()->image('receipt.jpg', 100, 100);
        $this->assertSame($jpeg, $service->normalizeUploadedImageFile($jpeg));

        if (!function_exists('imagegif')) {
            $this->markTestSkipped('GD imagegif not available.');
        }

        $tmpGif = tempnam(sys_get_temp_dir(), 'test_gif_') . '.gif';
        $img = imagecreatetruecolor(40, 40);
        imagegif($img, $tmpGif);
        imagedestroy($img);

        $gifUpload = new UploadedFile($tmpGif, 'receipt.gif', 'image/gif', null, true);
        $normalized = $service->normalizeUploadedImageFile($gifUpload);

        $this->assertNotSame($gifUpload, $normalized);
        $this->assertContains(strtolower($normalized->extension()), ['png', 'jpg', 'jpeg']);
        $this->assertLessThanOrEqual(2 * 1024 * 1024, $normalized->getSize());

        @unlink($tmpGif);
        @unlink($normalized->getRealPath());
    }

    public function test_prs_activity_reimbursement_service_import_is_idempotent_and_allows_resubmit_after_rejection(): void
    {
        Storage::fake('supabase');
        Queue::fake();

        $service = app(PrsActivityReimbursementService::class);

        $request = Request::create('/api/internal/prs/reimbursements', 'POST', [
            'activity_id'    => 501,
            'employee_email' => 'rep@sbsi.com',
            'employee_name'  => 'Field Rep',
            'institution'    => 'St. Luke Clinic',
            'activity_type'  => 'Client Visit',
            'description'    => 'Parking and meals',
            'amount'         => 0,
        ], [], [
            'receipts' => [UploadedFile::fake()->image('r1.jpg', 200, 200)],
        ]);

        $first = $service->importFromRequest($request);
        $this->assertTrue($first['created']);
        $this->assertSame(501, $first['reimbursement']->prs_activity_id);
        $this->assertSame('prs', $first['reimbursement']->source_system);

        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'PRS_REIMBURSEMENT_RECEIVED',
            'entity_id'   => $first['reimbursement']->id,
        ]);

        // Second call while active -> idempotent
        $second = $service->importFromRequest($request);
        $this->assertFalse($second['created']);
        $this->assertSame($first['reimbursement']->id, $second['reimbursement']->id);

        // Reject first -> allows new submission
        Reimbursement::whereKey($first['reimbursement']->id)->update(['status' => 'rejected']);

        $request2 = Request::create('/api/internal/prs/reimbursements', 'POST', [
            'activity_id'    => 501,
            'employee_email' => 'rep@sbsi.com',
            'employee_name'  => 'Field Rep',
        ], [], [
            'receipts' => [UploadedFile::fake()->image('r2.png', 200, 200)],
        ]);

        $third = $service->importFromRequest($request2);
        $this->assertTrue($third['created']);
        $this->assertNotSame($first['reimbursement']->id, $third['reimbursement']->id);
    }

    public function test_ocr_callback_updates_prs_reimbursement_amount_and_dispatches_status_job(): void
    {
        Queue::fake();

        $user = User::create([
            'email'      => 'ocr-prs@sbsi.com',
            'name'       => 'OCR Rep',
            'role'       => 'employee',
            'department' => 'Sales & Marketing',
        ]);
        $category = ExpenseCategory::create(['name' => 'Meals']);
        $receipt = Receipt::create([
            'uploaded_by'     => $user->id,
            'file_path'       => ['receipts/a.jpg'],
            'file_hash'       => ['hash-ocr-prs-1'],
            'file_type'       => ['jpeg'],
            'file_size_bytes' => [1024],
            'status'          => 'processing',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id'              => $user->id,
            'receipt_id'           => $receipt->id,
            'description'          => 'PRS Activity #777',
            'amount'               => 0,
            'date'                 => '2026-11-23',
            'status'               => 'pending',
            'submitted_by_name'    => $user->name,
            'source_system'        => 'prs',
            'source_submission_id' => '777',
            'prs_activity_id'      => 777,
            'is_request'           => true,
        ]);
        $reimbursement->receipts()->attach([$receipt->id]);

        app(OcrCallbackService::class)->handle($receipt->id, [
            'vendor_name'          => 'Jollibee',
            'transaction_date'     => '2026-11-23',
            'total_amount'         => 350.50,
            'currency'             => 'PHP',
            'expense_category'     => $category->name,
            'ocr_confidence_score' => 0.95,
            'status'               => 'processed',
        ]);

        $reimbursement->refresh();
        $this->assertSame('350.50', (string) $reimbursement->amount);
        $this->assertSame($category->id, $reimbursement->expense_category_id);

        Queue::assertPushed(UpdatePrsReimbursementStatusJob::class, function (UpdatePrsReimbursementStatusJob $job) use ($reimbursement) {
            return $job->reimbursementId === $reimbursement->id
                && $job->activityId === 777;
        });
    }

    public function test_update_prs_reimbursement_status_job_sends_expected_payload_and_headers(): void
    {
        config([
            'services.prs.api_url'                      => 'https://prs.local',
            'services.prs.reimbursement_status_api_url' => null,
            'services.prs.internal_secret'              => 'internal-sec',
            'services.prs.webhook_secret'               => 'webhook-sec',
        ]);

        Http::fake([
            'https://prs.local/api/integrations/serms/reimbursements/status' => Http::response(['ok' => true], 200),
        ]);

        $user = User::create([
            'email'      => 'job-prs@sbsi.com',
            'name'       => 'Job Rep',
            'role'       => 'employee',
            'department' => 'Sales & Marketing',
        ]);
        $reimbursement = Reimbursement::create([
            'user_id'              => $user->id,
            'description'          => 'PRS Activity #888',
            'amount'               => 420.00,
            'date'                 => '2026-11-23',
            'status'               => 'rejected',
            'rejection_comment'    => 'Blurry receipt',
            'submitted_by_name'    => $user->name,
            'source_system'        => 'prs',
            'source_submission_id' => '888',
            'prs_activity_id'      => 888,
            'is_request'           => true,
        ]);

        (new UpdatePrsReimbursementStatusJob(
            '888',
            $reimbursement->id,
            888,
            'rejected',
            'Blurry receipt'
        ))->handle();

        Http::assertSent(function ($request) use ($reimbursement) {
            $data = $request->data();
            return $request->url() === 'https://prs.local/api/integrations/serms/reimbursements/status'
                && $request->hasHeader('X-Internal-Secret', 'internal-sec')
                && $request->hasHeader('X-Internal-Token', 'internal-sec')
                && $request->hasHeader('X-SERMS-Signature')
                && $data['reimbursement_id'] === $reimbursement->id
                && $data['activity_id'] === 888
                && $data['status'] === 'rejected'
                && $data['is_reimbursed'] === 0
                && $data['rejection_comment'] === 'Blurry receipt';
        });
    }

    public function test_reject_reimbursement_dispatches_prs_status_job(): void
    {
        Queue::fake();

        $employee = User::create([
            'email'      => 'emp-rej@sbsi.com',
            'name'       => 'Emp Rej',
            'role'       => 'employee',
            'department' => 'Sales & Marketing',
        ]);
        $admin = User::create([
            'email'      => 'adm-rej@sbsi.com',
            'name'       => 'Adm Rej',
            'role'       => 'admin',
            'department' => 'Finance',
        ]);
        $reimbursement = Reimbursement::create([
            'user_id'              => $employee->id,
            'description'          => 'PRS Activity #999',
            'amount'               => 100.00,
            'date'                 => '2026-11-23',
            'status'               => 'pending',
            'submitted_by_name'    => $employee->name,
            'source_system'        => 'prs',
            'source_submission_id' => '999',
            'prs_activity_id'      => 999,
            'is_request'           => true,
        ]);

        app(ReimbursementService::class)->rejectReimbursement(
            $admin,
            $reimbursement->id,
            'Missing TIN',
            null,
            '127.0.0.1',
            Request::create('/'),
            'reject'
        );

        Queue::assertPushed(UpdatePrsReimbursementStatusJob::class, function (UpdatePrsReimbursementStatusJob $job) use ($reimbursement) {
            return $job->reimbursementId === $reimbursement->id
                && $job->activityId === 999
                && $job->status === 'rejected';
        });
    }
}
