<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ReceiptStorageRetrievalTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;
    private User $otherEmployee;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Create standard employee (matches mock_token_2 in external middleware)
        $this->employee = User::create([
            'email' => 'employee@serms.com',
            'name' => 'John Santos',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'SALES',
            'avatar' => 'JS',
        ]);

        // 2. Create admin user (matches mock_token_1 in external middleware)
        $this->admin = User::create([
            'email' => 'admin@serms.com',
            'name' => 'Alex Reyes',
            'role' => 'admin',
            'grade' => 'EXEC',
            'department' => 'accounting',
            'avatar' => 'AR',
        ]);

        // 3. Create another employee user (unrelated employee)
        $this->otherEmployee = User::create([
            'email' => 'other@serms.com',
            'name' => 'Jane Smith',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'HR',
            'avatar' => 'JS',
        ]);
    }

    /**
     * Test successful receipt storage (upload/store) and ocr_flagged determination.
     */
    public function test_receipt_storage_succeeds_with_correct_parameters(): void
    {
        $payload = [
            'file_path' => 'receipts/restaurant_dinner.jpg',
            'file_hash' => hash('sha256', 'restaurant_dinner_receipt_contents'),
            'file_type' => 'jpeg',
            'file_size_bytes' => 1500000, // 1.5MB
            'vendor_name' => 'Ramen Nagi',
            'transaction_date' => '2026-05-18',
            'total_amount' => 1250.00,
            'vat_amount' => 133.93,
            'tin' => '123-456-789-000',
            'invoice_number' => 'INV-2026-0098',
            'vat_classification' => 'vat',
            'ocr_confidence_score' => 92.50,
            'category' => 'Meals',
        ];

        // Store as the standard employee (using 'mock_token_2')
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->postJson('/api/expenses', $payload);

        $response->assertStatus(201);
        $response->assertJsonPath('message', 'Receipt stored successfully.');
        $response->assertJsonStructure([
            'data' => [
                'id',
                'uploaded_by',
                'file_path',
                'file_hash',
                'file_type',
                'file_size_bytes',
                'vendor_name',
                'transaction_date',
                'total_amount',
                'vat_amount',
                'tin',
                'invoice_number',
                'vat_classification',
                'ocr_confidence_score',
                'ocr_flagged',
                'status',
                'category',
                'created_at',
                'updated_at',
            ]
        ]);
        $response->assertJsonPath('data.status', 'processed');

        // Assert database values
        $this->assertDatabaseHas('receipts', [
            'uploaded_by' => $this->employee->id,
            'file_path' => json_encode('receipts/restaurant_dinner.jpg'),
            'vendor_name' => 'Ramen Nagi',
            'total_amount' => '1250.00',
            'ocr_flagged' => false, // Confidence score 92.50 is >= 80, so ocr_flagged must be false
            'status' => 'processed',
        ]);
    }

    /**
     * Test OCR flagged field triggers on low confidence score (< 80).
     */
    public function test_receipt_ocr_flagged_triggers_on_low_confidence(): void
    {
        $payload = [
            'file_path' => 'receipts/blurred_invoice.pdf',
            'file_hash' => hash('sha256', 'blurred_invoice_receipt_contents'),
            'file_type' => 'pdf',
            'file_size_bytes' => 850000,
            'vendor_name' => 'Blurry Shop',
            'total_amount' => 500.00,
            'ocr_confidence_score' => 74.30, // < 80 confidence -> should be flagged
        ];

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->postJson('/api/expenses', $payload);

        $response->assertStatus(201);
        
        // Assert database shows ocr_flagged = true
        $this->assertDatabaseHas('receipts', [
            'vendor_name' => 'Blurry Shop',
            'ocr_confidence_score' => '74.30',
            'ocr_flagged' => true,
        ]);
    }

    /**
     * Test duplicate detection policy (same file_hash rejected with 409 Conflict).
     */
    public function test_receipt_duplicate_detection_rejects_matching_hash(): void
    {
        $hash = hash('sha256', 'some_receipt_contents');

        // Pre-create receipt
        Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/duplicate_original.png',
            'file_hash' => $hash,
            'file_type' => 'png',
            'file_size_bytes' => 500000,
            'vendor_name' => 'Shop A',
        ]);

        $payload = [
            'file_path' => 'receipts/duplicate_clone.png',
            'file_hash' => $hash, // Same hash
            'file_type' => 'png',
            'file_size_bytes' => 500000,
            'vendor_name' => 'Shop A Clone',
        ];

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->postJson('/api/expenses', $payload);

        $response->assertStatus(409);
        $response->assertJsonPath('message', 'Duplicate detected. A receipt with this file hash already exists.');
    }

    /**
     * Test retrieval security: role-scoped list and permissions.
     */
    public function test_receipt_retrieval_is_correctly_role_scoped(): void
    {
        // 1. Create receipt uploaded by standard Employee
        $employeeReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/employee_receipt.png',
            'file_hash' => hash('sha256', 'employee_data'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Employee Store',
        ]);

        // 2. Create receipt uploaded by Other Employee
        $otherReceipt = Receipt::create([
            'uploaded_by' => $this->otherEmployee->id,
            'file_path' => 'receipts/other_receipt.png',
            'file_hash' => hash('sha256', 'other_data'),
            'file_type' => 'png',
            'file_size_bytes' => 200000,
            'vendor_name' => 'Other Store',
        ]);

        // --- Standard Employee Index Call ---
        // Should only see their own receipts (employeeReceipt)
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken() // maps to employee
        ])->getJson('/api/expenses');

        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $employeeReceipt->id);

        // --- Admin Index Call ---
        // Should see all receipts
        $responseAdmin = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken(['email' => 'admin@serms.com', 'role' => 'admin', 'department' => 'accounting']) // maps to admin
        ])->getJson('/api/expenses');

        $responseAdmin->assertStatus(200);
        $responseAdmin->assertJsonCount(2);

        // --- Single Receipt Show Security ---
        // Owner should view their own receipt successfully
        $responseShowSuccess = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson("/api/expenses/{$employeeReceipt->id}");
        
        $responseShowSuccess->assertStatus(200);
        $responseShowSuccess->assertJsonPath('id', $employeeReceipt->id);

        // Employee trying to access another employee's receipt should get 403 Forbidden
        // Note: mock_token_2 resolves to employee, which does not match otherReceipt->uploaded_by (otherEmployee)
        $responseShowForbidden = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson("/api/expenses/{$otherReceipt->id}");

        $responseShowForbidden->assertStatus(403);
        $responseShowForbidden->assertJsonPath('message', 'Forbidden.');
    }

    /**
     * Test metadata updates.
     */
    public function test_receipt_metadata_update_succeeds_for_owner_fails_for_others(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/to_update.png',
            'file_hash' => hash('sha256', 'update_data'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Original Vendor',
        ]);

        $updatePayload = [
            'vendor_name' => 'Updated Vendor Name',
            'total_amount' => 888.88,
        ];

        // 1. Unrelated employee tries to update -> 403 Forbidden
        // Wait, the middleware resolves 'mock_token_3' to 'employee@serms.com' (our $this->employee).
        // Since we want to test updating another user's receipt:
        // We will login as the standard employee (using 'mock_token_2') but update a receipt uploaded by otherEmployee!
        $otherReceipt = Receipt::create([
            'uploaded_by' => $this->otherEmployee->id,
            'file_path' => 'receipts/other_to_update.png',
            'file_hash' => hash('sha256', 'other_update_data'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
        ]);

        $responseForbidden = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken() // John Santos (employee)
        ])->putJson("/api/expenses/{$otherReceipt->id}", $updatePayload);

        $responseForbidden->assertStatus(403);
        $responseForbidden->assertJsonPath('message', 'Forbidden.');

        // 2. Owner updates their own receipt -> 200 OK
        $responseSuccess = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->putJson("/api/expenses/{$receipt->id}", $updatePayload);

        $responseSuccess->assertStatus(200);
        $responseSuccess->assertJsonPath('data.vendor_name', 'Updated Vendor Name');
        $responseSuccess->assertJsonPath('data.total_amount', '888.88');
    }

    /**
     * Test soft-deletion and list exclusion.
     */
    public function test_receipt_soft_deletion_excludes_it_from_list_and_prevents_unauthorized_deletion(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/to_delete.png',
            'file_hash' => hash('sha256', 'delete_data'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Delete Me Store',
        ]);

        $otherReceipt = Receipt::create([
            'uploaded_by' => $this->otherEmployee->id,
            'file_path' => 'receipts/other_to_delete.png',
            'file_hash' => hash('sha256', 'other_delete_data'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
        ]);

        // 1. Try to delete another user's receipt -> 403 Forbidden
        $responseForbidden = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken() // John Santos
        ])->deleteJson("/api/expenses/{$otherReceipt->id}");

        $responseForbidden->assertStatus(403);
        $responseForbidden->assertJsonPath('message', 'Forbidden.');

        // 2. Delete own receipt -> 200 OK (soft-deleted)
        $responseSuccess = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->deleteJson("/api/expenses/{$receipt->id}");

        $responseSuccess->assertStatus(200);
        $responseSuccess->assertJsonPath('message', 'Receipt deleted successfully.');

        // 3. Assert soft deleted in database (exists in all records, but not in standard)
        $this->assertNull(Receipt::find($receipt->id));
        $this->assertNotNull(Receipt::withTrashed()->find($receipt->id));

        // 4. Assert excluded from standard index lists
        $responseList = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson('/api/expenses');

        $responseList->assertStatus(200);
        $responseList->assertJsonCount(0); // The deleted receipt should be excluded
    }
}
