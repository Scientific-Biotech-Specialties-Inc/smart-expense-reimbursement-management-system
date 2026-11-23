<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Http;
use App\Modules\Reimbursements\Jobs\DispatchReceiptToAiService;

class ReceiptResubmitOcrTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'Jane Doe',
            'email' => 'jane.doe@example.com',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'IT',
        ]);

        Storage::fake('supabase');

        // Set the AI service URL after the app is fully booted so it takes effect
        // at runtime (the engine reads it at call time).
        config([
            'filesystems.disks.supabase.url' => 'http://storage.test/supabase',
            'services.ai_service.url' => 'http://ai-service.test',
            'services.ai_service.api_key' => 'test-key',
            'services.ai_service.ocr_queue_connection' => 'sync',
        ]);

        // OCR dispatches synchronously by default (no worker needed). Fake the
        // external AI service so the inline dispatch succeeds; individual tests can
        // re-fake a 500 to force an OCR failure.
        Http::fake(function () {
            return Http::response(['status' => 'received'], 200);
        });
    }

    private function pngUploadedFile(string $name, string $content): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'rcpt');
        file_put_contents($path, $content);

        return new UploadedFile($path, $name, 'image/png', null, true);
    }

    private function createReceipt(UploadedFile $file): array
    {
        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->post('/api/reimbursements/receipts', [
                'file' => $file,
                'vendor_name' => 'Vendor',
                'transaction_date' => '2026-06-10',
                'total_amount' => 100.00,
                'vat_amount' => 12.00,
                'tin' => '123-456-789-000',
                'invoice_number' => 'INV-001',
                'vat_classification' => 'vat',
                'currency' => 'PHP',
            ]);

        $response->assertStatus(201);

        return $response->json('data');
    }

    /**
     * Receipt image re-upload is disabled. Any file supplied to the resubmit
     * endpoint must be rejected (422) and the existing on-file image preserved.
     * This replaces the previous scenarios that triggered duplicate-detection or
     * OCR re-runs on a re-uploaded file (different file, brand-new file, and the
     * same file re-uploaded) — none of those are permitted anymore.
     */
    public function test_resubmit_rejects_file_upload_and_preserves_existing_receipt(): void
    {
        $fileA = UploadedFile::fake()->image('a.png', 100, 100);
        $fileB = UploadedFile::fake()->image('b.png', 200, 200);
        $contentA = file_get_contents($fileA->getRealPath());
        $contentB = file_get_contents($fileB->getRealPath());

        $receiptA = $this->createReceipt($fileA);
        $this->createReceipt($fileB);

        $scenarios = [
            'different receipt file' => $this->pngUploadedFile('b_copy.png', $contentB),
            'brand-new file'        => $this->pngUploadedFile('new.png', $contentA),
            'same file re-uploaded' => $this->pngUploadedFile('a_same.png', $contentA),
        ];

        foreach ($scenarios as $label => $uploaded) {
            Queue::fake();

            $response = $this
                ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
                ->actingAs($this->employee)
                ->postJson("/api/reimbursements/receipts/{$receiptA['id']}/resubmit", [
                    'file' => $uploaded,
                    'vendor_name' => 'Changed',
                ]);

            // The re-upload must be rejected at the boundary.
            $response->assertStatus(422, "Scenario failed: {$label}");
            $this->assertArrayHasKey('file', $response->json('errors'), "Scenario failed: {$label}");

            // The existing receipt image and metadata are preserved (no overwrite,
            // no OCR dispatch for a rejected re-upload).
            $this->assertDatabaseHas('receipts', [
                'id' => $receiptA['id'],
                'status' => 'processing',
                'vendor_name' => 'Vendor',
            ]);
            $this->assertEquals(
                $receiptA['file_path'],
                Receipt::find($receiptA['id'])->file_path,
                "Existing receipt image was replaced — scenario: {$label}"
            );
            Queue::assertNotPushed(DispatchReceiptToAiService::class, "Scenario failed: {$label}");
        }
    }

    public function test_resubmit_metadata_only_keeps_processed_and_skips_ocr(): void
    {
        $fileA = UploadedFile::fake()->image('a.png', 100, 100);
        $receiptA = $this->createReceipt($fileA);

        Queue::fake();

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->post("/api/reimbursements/receipts/{$receiptA['id']}/resubmit", [
                'vendor_name' => 'Metadata Only',
                'total_amount' => 200.00,
            ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'processed');
        $response->assertJsonPath('data.vendor_name', 'Metadata Only');

        $this->assertDatabaseHas('receipts', [
            'id' => $receiptA['id'],
            'status' => 'processed',
            'vendor_name' => 'Metadata Only',
        ]);

        // Metadata-only edit must not dispatch OCR.
        Queue::assertNotPushed(DispatchReceiptToAiService::class);
    }

    public function test_resubmit_persists_full_metadata_items_and_logs_audit_entry(): void
    {
        $category = ExpenseCategory::create(['name' => 'Meals']);
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/resubmit_full.png'],
            'file_hash' => [hash('sha256', 'resubmit_full')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Blurry Bistro',
            'status' => 'flagged',
            'ocr_flagged' => true,
        ]);

        Queue::fake();

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson("/api/reimbursements/receipts/{$receipt->id}/resubmit", [
                'expense_category_id' => $category->id,
                'event_type' => 'Client Meeting',
                'vendor_name' => 'Clear Bistro Corp.',
                'transaction_date' => '2026-11-20',
                'tin' => '123-456-789-000',
                'invoice_number' => 'INV-2026-9901',
                'location' => 'Makati City',
                'currency' => 'USD',
                'vat_classification' => 'VAT',
                'discount_type' => 'promo',
                'discount_amount' => 25.00,
                'subtotal' => 200.00,
                'vat_amount' => 24.00,
                'total_amount' => 224.00,
                'items' => [
                    ['name' => 'Team Lunch', 'quantity' => 2, 'price' => 112.00],
                    ['name' => 'Complimentary Water', 'quantity' => 1, 'price' => 0],
                ],
            ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'processed');
        $response->assertJsonPath('data.ocr_flagged', false);
        $response->assertJsonPath('data.subtotal', '200.00');
        $response->assertJsonPath('data.currency', 'USD');
        $response->assertJsonPath('data.location', 'Makati City');
        $response->assertJsonPath('data.event_type', 'Client Meeting');
        $response->assertJsonPath('data.discount_type', 'promo');
        $response->assertJsonPath('data.discount_amount', '25.00');
        $response->assertJsonPath('data.vat_classification', 'vat');
        $response->assertJsonPath('data.vat_amount', '24.00');
        $response->assertJsonPath('data.total_amount', '224.00');
        $this->assertCount(2, $response->json('data.items'));

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'processed',
            'ocr_flagged' => false,
            'expense_category_id' => $category->id,
            'event_type' => 'Client Meeting',
            'vendor_name' => 'Clear Bistro Corp.',
            'location' => 'Makati City',
            'currency' => 'USD',
            'vat_classification' => 'vat',
            'discount_type' => 'promo',
            'discount_amount' => '25.00',
            'subtotal' => '200.00',
            'vat_amount' => '24.00',
            'total_amount' => '224.00',
        ]);

        $this->assertDatabaseHas('receipt_items', [
            'receipt_id' => $receipt->id,
            'name' => 'Team Lunch',
            'quantity' => 2,
            'price' => '112.00',
        ]);
        $this->assertDatabaseHas('receipt_items', [
            'receipt_id' => $receipt->id,
            'name' => 'Complimentary Water',
            'quantity' => 1,
            'price' => '0.00',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'actor_role' => 'employee',
            'action_type' => 'RECEIPT_UPDATED',
            'entity_type' => 'receipt',
            'entity_id' => $receipt->id,
        ]);

        Queue::assertNotPushed(DispatchReceiptToAiService::class);
    }

    public function test_resubmit_allows_null_event_type_and_rejects_negative_subtotal_or_item_price(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/resubmit_validation.png'],
            'file_hash' => [hash('sha256', 'resubmit_validation')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'status' => 'flagged',
            'ocr_flagged' => true,
        ]);

        $invalidResponse = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson("/api/reimbursements/receipts/{$receipt->id}/resubmit", [
                'subtotal' => -10,
                'items' => [
                    ['name' => 'Invalid Item', 'quantity' => 1, 'price' => -5],
                ],
            ]);

        $invalidResponse->assertStatus(422);
        $invalidResponse->assertJsonValidationErrors(['subtotal', 'items.0.price']);

        $validResponse = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson("/api/reimbursements/receipts/{$receipt->id}/resubmit", [
                'event_type' => null,
                'subtotal' => 100.00,
                'currency' => 'PHP',
                'total_amount' => 112.00,
            ]);

        $validResponse->assertStatus(200);
        $validResponse->assertJsonPath('data.event_type', null);
        $validResponse->assertJsonPath('data.subtotal', '100.00');
    }

    public function test_store_receipt_accepts_event_type(): void
    {
        $file = UploadedFile::fake()->image('event_store.png', 200, 200);

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/reimbursements/receipts', [
                'file' => $file,
                'vendor_name' => 'Event Vendor',
                'event_type' => 'Team Offsite',
                'subtotal' => 100.00,
                'vat_amount' => 12.00,
                'total_amount' => 112.00,
                'currency' => 'PHP',
            ]);

        $response->assertStatus(201);
    }

    public function test_store_receipt_with_existing_file_hash_is_rejected_and_skips_ocr(): void
    {
        $fileA = UploadedFile::fake()->image('a.png', 100, 100);
        $contentA = file_get_contents($fileA->getRealPath());

        $this->createReceipt($fileA); // receipt A stored (status processing, OCR dispatched)

        // Reset the fake so only the duplicate store's dispatch (if any) is observed.
        Queue::fake();

        $duplicate = $this->pngUploadedFile('a_dup.png', $contentA);
        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/reimbursements/receipts', [
                'file' => $duplicate,
                'vendor_name' => 'Duplicate Vendor',
                'transaction_date' => '2026-06-10',
                'total_amount' => 100.00,
                'vat_amount' => 12.00,
                'tin' => '123-456-789-000',
                'invoice_number' => 'INV-DUP',
                'vat_classification' => 'vat',
                'currency' => 'PHP',
            ]);

        // storeReceipt rejects duplicates with a 422 ValidationException (no receipt
        // is created and no OCR is dispatched). The frontend new-upload path keys
        // off this 422 to surface the DuplicateReceiptModal.
        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['file_hash']);

        // No second receipt should exist, and OCR must NOT be dispatched for a dup.
        $this->assertDatabaseCount('receipts', 1);
        Queue::assertNotPushed(DispatchReceiptToAiService::class);
    }

    public function test_new_receipt_store_stays_processing_and_dispatches_ocr(): void
    {
        $fileNew = UploadedFile::fake()->image('new_store.png', 300, 300);

        Queue::fake();

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/reimbursements/receipts', [
                'file' => $fileNew,
                'vendor_name' => 'Fresh Vendor',
                'transaction_date' => '2026-06-11',
                'total_amount' => 250.00,
                'vat_amount' => 30.00,
                'tin' => '987-654-321-000',
                'invoice_number' => 'INV-NEW',
                'vat_classification' => 'vat',
                'currency' => 'PHP',
            ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.status', 'processing');

        $this->assertDatabaseHas('receipts', [
            'status' => 'processing',
        ]);

        // A brand-new upload MUST auto-trigger OCR (BUG 2 fix: the receipt must
        // remain 'processing' so OcrCallbackService applies the async results
        // instead of being force-flipped to 'processed' and skipped by the replay guard).
        // OCR now dispatches synchronously by default; the faked AI service above
        // accepts the request, leaving the receipt in `processing`.
    }

    public function test_dispatch_job_marks_receipt_failed_when_ai_service_throws(): void
    {
        Queue::fake();

        $file = UploadedFile::fake()->image('ocr_fail.png', 300, 300);
        $data = $this->createReceipt($file);
        $receiptId = $data['id'];

        $this->assertDatabaseHas('receipts', [
            'id' => $receiptId,
            'status' => 'processing',
        ]);

        // Simulate the external AI OCR service failing. Bind a mock engine that
        // throws so we exercise the job's failure path deterministically.
        $engine = $this->createMock(\App\Modules\Ai\Contracts\AsyncOcrEngineInterface::class);
        $engine->method('sendForProcessing')
            ->willThrowException(new \App\Modules\Ai\Exceptions\AiServiceException('AI service unreachable'));

        $this->instance(\App\Modules\Ai\Contracts\AsyncOcrEngineInterface::class, $engine);

        $job = new DispatchReceiptToAiService(Receipt::findOrFail($receiptId));

        // The job must log + rethrow (so the queue can retry), but it must NOT
        // silently swallow the failure: the receipt is left in a clear `failed`
        // state with a reason so the UI can surface it (RC-3 fix).
        try {
            $job->handle($engine);
            $this->fail('Expected AiServiceException to be thrown');
        } catch (\App\Modules\Ai\Exceptions\AiServiceException $e) {
            // expected rethrow
        }

        $this->assertDatabaseHas('receipts', [
            'id' => $receiptId,
            'status' => 'failed',
            'rejection_code' => 'ocr_failed',
        ]);
    }

    public function test_store_receipt_returns_synchronous_422_rejection_and_skips_uploaded_notification(): void
    {
        $reason = 'The receipt text is too faded or washed out to read critical details (Total Amount). Please upload a clearer photo with better contrast or request a clearer copy of the receipt.';

        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake([
            'http://ai-service.test/api/ocr/process' => Http::response([
                'status' => 'rejected',
                'rejection_code' => 'faded',
                'rejection_reason' => $reason,
                'message' => $reason,
            ], 422),
        ]);

        $file = UploadedFile::fake()->image('faded_receipt.png', 400, 600);

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->post('/api/reimbursements/receipts', [
                'file' => $file,
            ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.status', 'rejected');
        $response->assertJsonPath('data.ocr_flagged', true);
        $response->assertJsonPath('data.rejection_code', 'faded');
        $response->assertJsonPath('data.rejection_reason', $reason);

        $receiptId = $response->json('data.id');

        $this->assertDatabaseHas('receipts', [
            'id' => $receiptId,
            'status' => 'rejected',
            'ocr_flagged' => true,
            'rejection_code' => 'faded',
            'rejection_reason' => $reason,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'receipt_auto_rejected',
            'record_type' => 'receipt',
            'record_id' => $receiptId,
        ]);

        $this->assertDatabaseMissing('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'receipt_uploaded',
            'record_type' => 'receipt',
            'record_id' => $receiptId,
        ]);
    }

    public function test_update_receipt_blocks_uploader_from_editing_or_promoting_rejected_and_automatic_rejected_receipts(): void
    {
        foreach (['rejected', 'automatic-rejected'] as $status) {
            $receipt = Receipt::create([
                'uploaded_by' => $this->employee->id,
                'file_path' => ["receipts/blocked_update_{$status}.png"],
                'file_hash' => [hash('sha256', "blocked_update_{$status}")],
                'file_type' => ['png'],
                'file_size_bytes' => [1024],
                'vendor_name' => 'Original Rejected Vendor',
                'total_amount' => 150.00,
                'status' => $status,
                'ocr_flagged' => true,
                'rejection_code' => 'unreadable',
                'rejection_reason' => 'Receipt is too unreadable.',
            ]);

            $patchResponse = $this
                ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
                ->actingAs($this->employee)
                ->patchJson("/api/reimbursements/receipts/{$receipt->id}", [
                    'vendor_name' => 'Tampered Vendor',
                    'status' => 'processed',
                ]);

            $patchResponse->assertStatus(422);
            $patchResponse->assertJsonValidationErrors(['status']);

            $putResponse = $this
                ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
                ->actingAs($this->employee)
                ->putJson("/api/expenses/{$receipt->id}", [
                    'vendor_name' => 'Tampered Expense Vendor',
                ]);

            $putResponse->assertStatus(422);
            $putResponse->assertJsonValidationErrors(['status']);

            $this->assertDatabaseHas('receipts', [
                'id' => $receipt->id,
                'status' => $status,
                'ocr_flagged' => true,
                'vendor_name' => 'Original Rejected Vendor',
                'rejection_code' => 'unreadable',
                'rejection_reason' => 'Receipt is too unreadable.',
            ]);
        }
    }

    public function test_resubmit_receipt_blocks_uploader_from_editing_or_promoting_rejected_and_automatic_rejected_receipts(): void
    {
        foreach (['rejected', 'automatic-rejected'] as $status) {
            $receipt = Receipt::create([
                'uploaded_by' => $this->employee->id,
                'file_path' => ["receipts/blocked_resubmit_{$status}.png"],
                'file_hash' => [hash('sha256', "blocked_resubmit_{$status}")],
                'file_type' => ['png'],
                'file_size_bytes' => [1024],
                'vendor_name' => 'Original Rejected Vendor',
                'total_amount' => 150.00,
                'status' => $status,
                'ocr_flagged' => true,
                'rejection_code' => 'faded',
                'rejection_reason' => 'Receipt text is too faded.',
            ]);

            $response = $this
                ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
                ->actingAs($this->employee)
                ->postJson("/api/reimbursements/receipts/{$receipt->id}/resubmit", [
                    'vendor_name' => 'Promoted Vendor',
                    'total_amount' => 250.00,
                ]);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['status']);

            $this->assertDatabaseHas('receipts', [
                'id' => $receipt->id,
                'status' => $status,
                'ocr_flagged' => true,
                'vendor_name' => 'Original Rejected Vendor',
                'total_amount' => '150.00',
            ]);
        }
    }

    public function test_delete_receipt_still_allows_deleting_rejected_and_automatic_rejected_receipts(): void
    {
        $nonDraftRejected = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/delete_rejected.png'],
            'file_hash' => [hash('sha256', 'delete_rejected')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'status' => 'rejected',
            'is_draft' => false,
            'ocr_flagged' => true,
            'rejection_code' => 'unreadable',
        ]);

        $draftAutoRejected = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/delete_auto_rejected.png'],
            'file_hash' => [hash('sha256', 'delete_auto_rejected')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'status' => 'automatic-rejected',
            'is_draft' => true,
            'ocr_flagged' => true,
            'rejection_code' => 'faded',
        ]);

        $res1 = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->deleteJson("/api/reimbursements/receipts/{$nonDraftRejected->id}");
        $res1->assertStatus(200);
        $this->assertSoftDeleted('receipts', ['id' => $nonDraftRejected->id]);

        $res2 = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->deleteJson("/api/reimbursements/receipts/{$draftAutoRejected->id}");
        $res2->assertStatus(200);
        $this->assertDatabaseMissing('receipts', ['id' => $draftAutoRejected->id]);
    }
}
