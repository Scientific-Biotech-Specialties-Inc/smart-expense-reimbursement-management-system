<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Verifies the OCR callback status transition rules implemented in
 * App\Modules\Reimbursements\Services\OcrCallbackService.
 *
 * Product rule: a successfully OCR'd receipt (not rejected, not duplicate,
 * not low-confidence) must become 'processed' automatically — no admin
 * intervention required. Low-confidence stays 'flagged'; rejected/duplicate
 * stays 'rejected'.
 */
class OcrCallbackServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private string $aiApiKey = 'test-ai-service-key';

    protected function setUp(): void
    {
        parent::setUp();

        // Configure the shared secret the AI service middleware expects.
        config(['services.ai_service.api_key' => $this->aiApiKey]);

        $this->employee = User::create([
            'email' => 'employee@serms.com',
            'name' => 'John Santos',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'SALES',
            'avatar' => 'JS',
        ]);
    }

    private function makeProcessingReceipt(): Receipt
    {
        return Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/ocr_test.png',
            'file_hash' => hash('sha256', 'ocr_callback_' . uniqid()),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'OCR Vendor',
            'status' => 'processing', // state set by ReceiptService::storeReceipt
        ]);
    }

    private function postCallback(Receipt $receipt, array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->aiApiKey,
        ])->postJson("/api/reimbursements/receipts/{$receipt->id}/ocr-callback", $payload);
    }

    public function test_successful_high_confidence_ocr_sets_status_processed(): void
    {
        $receipt = $this->makeProcessingReceipt();

        $response = $this->postCallback($receipt, [
            'receipt_id' => $receipt->id,
            'vendor_name' => 'Ramen Nagi',
            'total_amount' => 1250.00,
            'ocr_confidence_score' => 0.95, // high confidence (>= 0.80)
            'expense_category' => 'Meals',
            'items' => [
                ['name' => 'Ramen', 'quantity' => 1, 'price' => 1250.00],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'processed');
        $response->assertJsonPath('data.ocr_flagged', false);

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'processed',
            'ocr_flagged' => false,
            'ocr_confidence_score' => '0.95',
        ]);
    }

    public function test_low_confidence_ocr_sets_status_flagged(): void
    {
        $receipt = $this->makeProcessingReceipt();

        $response = $this->postCallback($receipt, [
            'receipt_id' => $receipt->id,
            'vendor_name' => 'Blurry Shop',
            'total_amount' => 500.00,
            'ocr_confidence_score' => 0.50, // < 0.80 -> flagged
            'expense_category' => 'Meals',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'flagged');
        $response->assertJsonPath('data.ocr_flagged', true);

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'flagged',
            'ocr_flagged' => true,
        ]);
    }

    public function test_rejected_ocr_sets_status_rejected(): void
    {
        $receipt = $this->makeProcessingReceipt();

        $response = $this->postCallback($receipt, [
            'receipt_id' => $receipt->id,
            'status' => 'rejected',
            'rejection_code' => 'blurry',
            'rejection_reason' => 'Image too blurry.',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'rejected');

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'rejected',
            'rejection_code' => 'blurry',
        ]);
    }

    public function test_not_a_receipt_ocr_sets_status_rejected(): void
    {
        $receipt = $this->makeProcessingReceipt();

        $response = $this->postCallback($receipt, [
            'receipt_id' => $receipt->id,
            'status' => 'rejected',
            'rejection_code' => 'not_a_receipt',
            'rejection_reason' => 'The uploaded image does not appear to be a receipt or invoice. Please upload a clear photo of an official receipt or invoice.',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'rejected');

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'rejected',
            'rejection_code' => 'not_a_receipt',
        ]);
    }

    public function test_duplicate_ocr_sets_status_rejected(): void
    {
        $receipt = $this->makeProcessingReceipt();

        $response = $this->postCallback($receipt, [
            'receipt_id' => $receipt->id,
            'is_duplicate' => true,
            'duplicate_similarity' => 0.98,
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'rejected');

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'rejected',
            'rejection_code' => 'duplicate',
        ]);
    }

    public function test_already_processed_receipt_is_skipped_on_replay(): void
    {
        // A receipt already in 'processed' must be skipped by the replay guard.
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/replay_test.png',
            'file_hash' => hash('sha256', 'ocr_replay_' . uniqid()),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Original Vendor',
            'status' => 'processed',
        ]);

        $response = $this->postCallback($receipt, [
            'receipt_id' => $receipt->id,
            'vendor_name' => 'Tampered Vendor',
            'ocr_confidence_score' => 0.95,
        ]);

        $response->assertStatus(200);
        // Status must remain unchanged; vendor name must NOT be overwritten.
        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'processed',
            'vendor_name' => 'Original Vendor',
        ]);
    }
}
