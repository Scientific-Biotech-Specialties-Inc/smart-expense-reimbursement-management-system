<?php

namespace Tests\Feature;

use App\Modules\Reimbursements\Jobs\DispatchReceiptToAiService;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OcrCallbackMultiReceiptSplitTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private string $aiApiKey = 'test-ai-service-key';

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.ai_service.api_key' => $this->aiApiKey]);

        $this->employee = User::create([
            'email' => 'employee@serms.com',
            'name' => 'John Santos',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'SALES',
            'avatar' => 'JS',
        ]);

        Storage::fake('supabase');
        Queue::fake();
    }

    private function fakePngWithBytes(string $name, string $pngBytes): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'split_rcpt_');
        file_put_contents($path, $pngBytes);

        return new UploadedFile($path, $name, 'image/png', null, true);
    }

    private function makePngBytes(int $width, int $height): string
    {
        $fake = UploadedFile::fake()->image("gen_{$width}x{$height}.png", $width, $height);
        return file_get_contents($fake->getRealPath());
    }

    private function postCallback(Receipt $receipt, array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->aiApiKey,
        ])->postJson("/api/reimbursements/receipts/{$receipt->id}/ocr-callback", $payload);
    }

    public function test_single_file_upload_with_duplicate_hash_is_rejected_immediately(): void
    {
        $contentA = $this->makePngBytes(20, 20);
        $hashA = hash('sha256', $contentA);

        Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/existing_a.png'],
            'file_hash' => [$hashA],
            'file_type' => ['png'],
            'file_size_bytes' => [strlen($contentA)],
            'status' => 'processed',
        ]);

        $reimbRes = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/reimbursements/receipts', [
                'file' => $this->fakePngWithBytes('dup_a.png', $contentA),
            ]);

        $reimbRes->assertStatus(422);
        $reimbRes->assertJsonValidationErrors(['file_hash']);

        $liqRes = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/liquidations/scan', [
                'files' => [$this->fakePngWithBytes('dup_a_liq.png', $contentA)],
            ]);

        $liqRes->assertStatus(422);
        $liqRes->assertJsonValidationErrors(['file_hash']);

        $this->assertDatabaseCount('receipts', 1);
        Queue::assertNothingPushed();
    }

    public function test_multi_file_upload_allows_partial_duplicate_and_rejects_only_when_all_match_existing_hashes(): void
    {
        $contentA = $this->makePngBytes(21, 21);
        $contentB = $this->makePngBytes(22, 22);
        $contentNew = $this->makePngBytes(23, 23);
        $contentNew2 = $this->makePngBytes(24, 24);

        Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/existing_a.png'],
            'file_hash' => [hash('sha256', $contentA)],
            'file_type' => ['png'],
            'file_size_bytes' => [strlen($contentA)],
            'status' => 'processed',
        ]);

        Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/existing_b.png'],
            'file_hash' => [hash('sha256', $contentB)],
            'file_type' => ['png'],
            'file_size_bytes' => [strlen($contentB)],
            'status' => 'processed',
        ]);

        // 1. ALL files match DB hashes -> immediate 422 on both reimbursement & liquidation endpoints
        $allDupReimb = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/reimbursements/receipts/segmented', [
                'files' => [
                    $this->fakePngWithBytes('a1.png', $contentA),
                    $this->fakePngWithBytes('b1.png', $contentB),
                ],
            ]);
        $allDupReimb->assertStatus(422);
        $allDupReimb->assertJsonValidationErrors(['file_hash']);

        $allDupLiq = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/liquidations/scan', [
                'files' => [
                    $this->fakePngWithBytes('a2.png', $contentA),
                    $this->fakePngWithBytes('b2.png', $contentB),
                ],
            ]);
        $allDupLiq->assertStatus(422);
        $allDupLiq->assertJsonValidationErrors(['file_hash']);

        $this->assertDatabaseCount('receipts', 2);

        // 2. Partial match ([A, NEW]) -> allowed to upload & dispatch so OcrCallbackService can isolate
        $partialReimb = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/reimbursements/receipts/segmented', [
                'files' => [
                    $this->fakePngWithBytes('a3.png', $contentA),
                    $this->fakePngWithBytes('new1.png', $contentNew),
                ],
                'is_draft' => true,
            ]);
        $partialReimb->assertStatus(201);
        $partialReimb->assertJsonPath('data.status', 'processing');

        $partialLiq = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/liquidations/scan', [
                'files' => [
                    $this->fakePngWithBytes('a4.png', $contentA),
                    $this->fakePngWithBytes('new2.png', $contentNew2),
                ],
            ]);
        $partialLiq->assertStatus(201);
        $partialLiq->assertJsonPath('data.status', 'processing');

        $this->assertDatabaseCount('receipts', 4);
        Queue::assertPushed(DispatchReceiptToAiService::class, 2);
    }

    public function test_one_long_receipt_callback_without_split_preserves_merged_files_and_returns_empty_split_ids(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/long_top.png', 'receipts/long_bottom.png'],
            'file_hash' => [hash('sha256', 'long_top'), hash('sha256', 'long_bottom')],
            'file_type' => ['png', 'png'],
            'file_size_bytes' => [1024, 2048],
            'is_draft' => true,
            'status' => 'processing',
        ]);

        $response = $this->postCallback($receipt, [
            'receipt_id' => $receipt->id,
            'vendor_name' => 'SM Supermarket',
            'transaction_date' => '2026-11-20',
            'total_amount' => 1540.00,
            'ocr_confidence_score' => 0.93,
            'expense_category' => 'Groceries',
            'items' => [
                ['name' => 'Rice 5kg', 'quantity' => 1, 'price' => 300.00],
                ['name' => 'Cooking Oil', 'quantity' => 2, 'price' => 620.00],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'processed');
        $response->assertJsonPath('data.split_receipt_ids', []);

        $receipt->refresh();
        $this->assertCount(2, $receipt->file_path);
        $this->assertDatabaseCount('receipts', 1);

        $token = $this->generateMockToken(['email' => $this->employee->email]);

        $showReimb = $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->getJson("/api/reimbursements/receipts/{$receipt->id}");
        $showReimb->assertStatus(200);
        $this->assertArrayNotHasKey('split_receipts', $showReimb->json('data'));

        $showLiq = $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->getJson("/api/liquidations/receipts/{$receipt->id}");
        $showLiq->assertStatus(200);
        $this->assertArrayNotHasKey('split_receipts', $showLiq->json('data'));
    }

    public function test_one_long_receipt_callback_runs_deferred_duplicate_hash_check_when_unsplit(): void
    {
        $dupHash = hash('sha256', 'dup-seg-0');

        Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/original.png'],
            'file_hash' => [$dupHash],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'status' => 'processed',
        ]);

        $longReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/dup_seg_0.png', 'receipts/fresh_seg_1.png'],
            'file_hash' => [$dupHash, hash('sha256', 'fresh-seg-1')],
            'file_type' => ['png', 'png'],
            'file_size_bytes' => [1024, 1024],
            'status' => 'processing',
        ]);

        $response = $this->postCallback($longReceipt, [
            'receipt_id' => $longReceipt->id,
            'vendor_name' => 'Long Receipt Store',
            'total_amount' => 999.00,
            'ocr_confidence_score' => 0.94,
            'is_duplicate' => false,
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'rejected');
        $response->assertJsonPath('data.rejection_code', 'duplicate');

        $this->assertDatabaseHas('receipts', [
            'id' => $longReceipt->id,
            'status' => 'rejected',
            'rejection_code' => 'duplicate',
            'ocr_flagged' => true,
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'RECEIPT_OCR_REJECTED',
            'entity_type' => 'receipt',
            'entity_id' => $longReceipt->id,
        ]);
    }

    public function test_multi_receipt_split_callback_creates_children_logs_audits_and_hydrates_polling_endpoints(): void
    {
        $h0 = hash('sha256', 'seg-0');
        $h1 = hash('sha256', 'seg-1');
        $h2 = hash('sha256', 'seg-2');

        $parent = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/seg0.png', 'receipts/seg1.png', 'receipts/seg2.png'],
            'file_hash' => [$h0, $h1, $h2],
            'file_type' => ['png', 'png', 'png'],
            'file_size_bytes' => [1000, 2000, 3000],
            'is_draft' => true,
            'status' => 'processing',
        ]);

        $response = $this->postCallback($parent, [
            'receipt_id' => $parent->id,
            'segment_indices' => [0, 2],
            'vendor_name' => 'Mercury Drug',
            'transaction_date' => '2026-11-18',
            'total_amount' => 840.00,
            'subtotal' => 750.00,
            'vat_amount' => 90.00,
            'tin' => '123-456-789-000',
            'invoice_number' => 'OR-1001',
            'vat_classification' => 'vat',
            'currency' => 'PHP',
            'location' => 'Makati',
            'ocr_confidence_score' => 0.95,
            'expense_category' => 'Medical',
            'items' => [
                ['name' => 'Vitamin C', 'quantity' => 2, 'price' => 420.00],
            ],
            'split_receipts' => [
                [
                    'segment_indices' => [1],
                    'vendor_name' => 'Grab PH',
                    'transaction_date' => '2026-11-19',
                    'total_amount' => 320.00,
                    'ocr_confidence_score' => 0.72,
                    'expense_category' => 'Transportation',
                    'currency' => 'PHP',
                    'items' => [
                        ['name' => 'Ride Fare', 'quantity' => 1, 'price' => 320.00],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.receipt_id', $parent->id);
        $response->assertJsonPath('data.status', 'processed');

        $splitIds = $response->json('data.split_receipt_ids');
        $this->assertIsArray($splitIds);
        $this->assertCount(1, $splitIds);
        $childId = $splitIds[0];

        $parent->refresh();
        $this->assertSame(['receipts/seg0.png', 'receipts/seg2.png'], $parent->file_path);
        $this->assertSame([$h0, $h2], $parent->file_hash);
        $this->assertSame(['png', 'png'], $parent->file_type);
        $this->assertSame([1000, 3000], $parent->file_size_bytes);
        $this->assertSame('Mercury Drug', $parent->vendor_name);
        $this->assertTrue($parent->is_draft);

        $child = Receipt::with(['category', 'items', 'uploader'])->findOrFail($childId);
        $this->assertSame($this->employee->id, $child->uploaded_by);
        $this->assertTrue($child->is_draft);
        $this->assertSame(['receipts/seg1.png'], $child->file_path);
        $this->assertSame([$h1], $child->file_hash);
        $this->assertSame(['png'], $child->file_type);
        $this->assertSame([2000], $child->file_size_bytes);
        $this->assertSame('Grab PH', $child->vendor_name);
        $this->assertSame('flagged', $child->status);
        $this->assertTrue($child->ocr_flagged);
        $this->assertSame('Transportation', $child->category->name);
        $this->assertCount(1, $child->items);
        $this->assertSame('Ride Fare', $child->items[0]->name);

        // Audit logs recorded for parent OCR completion + child creation + child OCR completion
        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'RECEIPT_OCR_COMPLETED',
            'entity_type' => 'receipt',
            'entity_id' => $parent->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'RECEIPT_CREATED',
            'entity_type' => 'receipt',
            'entity_id' => $childId,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'RECEIPT_OCR_COMPLETED',
            'entity_type' => 'receipt',
            'entity_id' => $childId,
        ]);

        // Polling endpoints hydrate split_receipts + segment_indices
        $token = $this->generateMockToken(['email' => $this->employee->email]);

        foreach ([
            "/api/reimbursements/receipts/{$parent->id}",
            "/api/liquidations/receipts/{$parent->id}",
        ] as $endpoint) {
            $pollRes = $this->withHeaders(['Authorization' => 'Bearer ' . $token])
                ->getJson($endpoint);

            $pollRes->assertStatus(200);
            $pollRes->assertJsonPath('data.id', $parent->id);
            $pollRes->assertJsonPath('data.segment_indices', [0, 2]);
            $pollRes->assertJsonCount(1, 'data.split_receipts');
            $pollRes->assertJsonPath('data.split_receipts.0.id', $childId);
            $pollRes->assertJsonPath('data.split_receipts.0.segment_indices', [1]);
            $pollRes->assertJsonPath('data.split_receipts.0.vendor_name', 'Grab PH');
            $pollRes->assertJsonPath('data.split_receipts.0.category.name', 'Transportation');
            $pollRes->assertJsonPath('data.split_receipts.0.items.0.name', 'Ride Fare');
            $pollRes->assertJsonPath('data.split_receipts.0.uploader.id', $this->employee->id);
        }
    }

    public function test_multi_receipt_split_isolates_duplicate_and_quality_rejections_per_receipt(): void
    {
        $h0 = hash('sha256', 'existing-in-db');
        $h1 = hash('sha256', 'blurry-slip');
        $h2 = hash('sha256', 'valid-unique');

        Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/db_existing.png'],
            'file_hash' => [$h0],
            'file_type' => ['png'],
            'file_size_bytes' => [512],
            'status' => 'processed',
        ]);

        // Case A: Group 0 hits DB hash duplicate while Group 1 succeeds,
        // Group 2 is quality-rejected (blurry), and Group 3 duplicates Group 1 in the same batch.
        $parent = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/f0.png', 'receipts/f1.png', 'receipts/f2.png', 'receipts/f3.png'],
            'file_hash' => [$h0, $h2, $h1, $h2],
            'file_type' => ['png', 'png', 'png', 'png'],
            'file_size_bytes' => [500, 600, 700, 600],
            'is_draft' => true,
            'status' => 'processing',
        ]);

        $response = $this->postCallback($parent, [
            'receipt_id' => $parent->id,
            'segment_indices' => [0],
            'vendor_name' => 'Duplicate Store',
            'total_amount' => 100.00,
            'ocr_confidence_score' => 0.90,
            'is_duplicate' => false,
            'split_receipts' => [
                [
                    'segment_indices' => [1],
                    'vendor_name' => 'Valid Bakery',
                    'total_amount' => 250.00,
                    'ocr_confidence_score' => 0.96,
                    'expense_category' => 'Meals',
                    'items' => [
                        ['name' => 'Bread', 'quantity' => 1, 'price' => 250.00],
                    ],
                ],
                [
                    'segment_indices' => [2],
                    'status' => 'rejected',
                    'rejection_code' => 'blurry',
                    'rejection_reason' => 'Image is too blurry.',
                    'ocr_confidence_score' => 0.0,
                ],
                [
                    'segment_indices' => [3],
                    'vendor_name' => 'Valid Bakery Copy',
                    'total_amount' => 250.00,
                    'ocr_confidence_score' => 0.95,
                    'is_duplicate' => false,
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'rejected');
        $response->assertJsonPath('data.rejection_code', 'duplicate');

        $splitIds = $response->json('data.split_receipt_ids');
        $this->assertCount(3, $splitIds);

        [$validChildId, $blurryChildId, $intraDupChildId] = $splitIds;

        $this->assertDatabaseHas('receipts', [
            'id' => $parent->id,
            'status' => 'rejected',
            'rejection_code' => 'duplicate',
            'ocr_flagged' => true,
        ]);

        $this->assertDatabaseHas('receipts', [
            'id' => $validChildId,
            'status' => 'processed',
            'ocr_flagged' => false,
            'vendor_name' => 'Valid Bakery',
        ]);

        $this->assertDatabaseHas('receipts', [
            'id' => $blurryChildId,
            'status' => 'rejected',
            'rejection_code' => 'blurry',
            'rejection_reason' => 'Image is too blurry.',
            'ocr_flagged' => true,
        ]);

        $this->assertDatabaseHas('receipts', [
            'id' => $intraDupChildId,
            'status' => 'rejected',
            'rejection_code' => 'duplicate',
            'ocr_flagged' => true,
        ]);

        // Polling endpoint still exposes valid & rejected split_receipts even when Group 0 was rejected
        $token = $this->generateMockToken(['email' => $this->employee->email]);
        $pollRes = $this->withHeaders(['Authorization' => 'Bearer ' . $token])
            ->getJson("/api/reimbursements/receipts/{$parent->id}");

        $pollRes->assertStatus(200);
        $pollRes->assertJsonPath('data.status', 'rejected');
        $pollRes->assertJsonCount(3, 'data.split_receipts');
        $pollRes->assertJsonPath('data.split_receipts.0.status', 'processed');
        $pollRes->assertJsonPath('data.split_receipts.1.status', 'rejected');
        $pollRes->assertJsonPath('data.split_receipts.2.status', 'rejected');
    }

    public function test_ocr_callback_request_validates_nested_split_receipt_fields(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/a.png', 'receipts/b.png'],
            'file_hash' => [hash('sha256', 'va'), hash('sha256', 'vb')],
            'file_type' => ['png', 'png'],
            'file_size_bytes' => [500, 500],
            'status' => 'processing',
        ]);

        $invalidRes = $this->postCallback($receipt, [
            'receipt_id' => $receipt->id,
            'segment_indices' => [-1],
            'split_receipts' => [
                [
                    'segment_indices' => [1],
                    'ocr_confidence_score' => 1.5,
                    'items' => [
                        ['name' => 'Bad Item', 'quantity' => 0, 'price' => -5],
                    ],
                ],
            ],
        ]);

        $invalidRes->assertStatus(422);
        $invalidRes->assertJsonValidationErrors([
            'segment_indices.0',
            'split_receipts.0.ocr_confidence_score',
            'split_receipts.0.items.0.quantity',
            'split_receipts.0.items.0.price',
        ]);
    }

    public function test_split_callback_replay_is_idempotent_and_split_child_failed_status_is_isolated(): void
    {
        $parent = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/p0.png', 'receipts/p1.png'],
            'file_hash' => [hash('sha256', 'p0'), hash('sha256', 'p1')],
            'file_type' => ['png', 'png'],
            'file_size_bytes' => [500, 500],
            'is_draft' => true,
            'status' => 'processing',
        ]);

        $payload = [
            'receipt_id' => $parent->id,
            'segment_indices' => [0],
            'vendor_name' => 'Good Cafe',
            'total_amount' => 180.00,
            'ocr_confidence_score' => 0.94,
            'split_receipts' => [
                [
                    'segment_indices' => [1],
                    'status' => 'failed',
                    'error' => 'LLM extraction timed out for segment 1.',
                ],
            ],
        ];

        $first = $this->postCallback($parent, $payload);
        $first->assertStatus(200);
        $first->assertJsonPath('data.status', 'processed');
        $splitIds = $first->json('data.split_receipt_ids');
        $this->assertCount(1, $splitIds);

        $this->assertDatabaseHas('receipts', [
            'id' => $splitIds[0],
            'status' => 'failed',
            'rejection_code' => 'ocr_failed',
            'rejection_reason' => 'LLM extraction timed out for segment 1.',
        ]);

        // Replay must not create duplicate child receipts or overwrite existing statuses
        $replay = $this->postCallback($parent, $payload);
        $replay->assertStatus(200);
        $replay->assertJsonPath('data.split_receipt_ids', $splitIds);
        $this->assertDatabaseCount('receipts', 2);
    }
}
