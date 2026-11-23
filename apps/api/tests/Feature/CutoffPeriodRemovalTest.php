<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class CutoffPeriodRemovalTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Sales',
        ]);
    }

    public function test_reimbursements_table_does_not_have_cutoff_period_column(): void
    {
        $this->assertFalse(
            Schema::hasColumn('reimbursements', 'cutoff_period'),
            'reimbursements table still contains cutoff_period column'
        );
    }

    public function test_employee_can_submit_reimbursement_without_cutoff_period(): void
    {
        Storage::fake('supabase');
        $category = ExpenseCategory::firstOrCreate(['name' => 'Meals']);

        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/test.png',
            'file_hash' => str_repeat('a', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Test Vendor',
            'total_amount' => 300.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Doe',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->post('/api/reimbursements', [
            'description' => 'Test submission without cutoff',
            'expense_category_id' => $category->id,
            'event_type' => 'Client Meeting',
            'amount' => 300.00,
            'date' => '2026-10-23',
            'receipt_ids' => [$receipt->id],
            'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
        ]);

        $response->assertStatus(201);
        $this->assertEquals('pending', $response->json('data.status'));

        $this->assertDatabaseHas('reimbursements', [
            'id' => $response->json('data.id'),
            'description' => 'Test submission without cutoff',
        ]);
    }

    public function test_prs_webhook_silently_ignores_cutoff_period_when_provided(): void
    {
        config(['services.prs.webhook_secret' => 'test-prs-secret']);

        $payload = [
            'event' => 'prs.reimbursement.requested',
            'source_system' => 'prs',
            'source_submission_id' => 'PRS-TEST-001',
            'source_user' => [
                'id' => 77,
                'name' => 'PRS User',
                'email' => 'prs@example.com',
                'department' => 'Sales',
            ],
            'activity' => [
                'institution' => 'Clinic Z',
                'contact_person' => 'Dr. Z',
                'product' => 'Kit Z',
                'activity_type' => 'Demo',
                'activity_date' => '2026-10-23',
                'start_time' => '10:00',
                'description' => 'PRS activity demo',
            ],
            'receipt' => [
                'invoice_number' => 'INV-2026-00099',
                'transaction_date' => '2026-10-23',
                'tin' => '123-456-789-000',
                'vendor_name' => 'Vendor Z',
                'expense_category_id' => null,
                'vat_classification' => 'vat',
                'total_amount' => 750,
                'vat_amount' => 90,
                'file_url' => 'https://prs.local/receipts/inv-00099.jpg',
                'items' => [
                    ['name' => 'Meals', 'quantity' => 1, 'price' => 750],
                ],
            ],
            'reimbursement' => [
                'description' => 'PRS Reimbursement with cutoff',
                'category' => 'Demo',
                'amount' => 750,
                'date' => '2026-10-23',
                'cutoff_period' => 'Oct 16 - Oct 31, 2026', // Sent by PRS, should be silently ignored
            ],
        ];

        $timestamp = (string) time();
        $body = json_encode($payload);
        $headers = [
            'X-PRS-Event' => 'prs.reimbursement.requested',
            'X-PRS-Delivery-Id' => 'delivery-test-999',
            'X-PRS-Timestamp' => $timestamp,
            'X-PRS-Signature' => 'sha256=' . hash_hmac('sha256', $timestamp . '.' . $body, 'test-prs-secret'),
        ];

        $response = $this->postJson('/api/reimbursements/webhooks/prs', $payload, $headers);
        $response->assertCreated();

        $this->assertDatabaseHas('reimbursements', [
            'source_system' => 'prs',
            'source_submission_id' => 'PRS-TEST-001',
            'description' => 'PRS Reimbursement with cutoff',
        ]);
    }

    public function test_prs_webhook_succeeds_without_cutoff_period(): void
    {
        config(['services.prs.webhook_secret' => 'test-prs-secret']);

        $payload = [
            'event' => 'prs.reimbursement.requested',
            'source_system' => 'prs',
            'source_submission_id' => 'PRS-TEST-002',
            'source_user' => [
                'id' => 78,
                'name' => 'PRS User 2',
                'email' => 'prs2@example.com',
                'department' => 'Sales',
            ],
            'activity' => [
                'institution' => 'Clinic Y',
                'contact_person' => 'Dr. Y',
                'product' => 'Kit Y',
                'activity_type' => 'Demo',
                'activity_date' => '2026-10-23',
                'start_time' => '14:00',
                'description' => 'PRS activity demo',
            ],
            'receipt' => [
                'invoice_number' => 'INV-2026-00098',
                'transaction_date' => '2026-10-23',
                'tin' => '123-456-789-000',
                'vendor_name' => 'Vendor Y',
                'expense_category_id' => null,
                'vat_classification' => 'vat',
                'total_amount' => 500,
                'vat_amount' => 60,
                'file_url' => 'https://prs.local/receipts/inv-00098.jpg',
                'items' => [
                    ['name' => 'Transport', 'quantity' => 1, 'price' => 500],
                ],
            ],
            'reimbursement' => [
                'description' => 'PRS Reimbursement without cutoff',
                'category' => 'Demo',
                'amount' => 500,
                'date' => '2026-10-23',
                // No cutoff_period provided
            ],
        ];

        $timestamp = (string) time();
        $body = json_encode($payload);
        $headers = [
            'X-PRS-Event' => 'prs.reimbursement.requested',
            'X-PRS-Delivery-Id' => 'delivery-test-998',
            'X-PRS-Timestamp' => $timestamp,
            'X-PRS-Signature' => 'sha256=' . hash_hmac('sha256', $timestamp . '.' . $body, 'test-prs-secret'),
        ];

        $response = $this->postJson('/api/reimbursements/webhooks/prs', $payload, $headers);
        $response->assertCreated();

        $this->assertDatabaseHas('reimbursements', [
            'source_system' => 'prs',
            'source_submission_id' => 'PRS-TEST-002',
            'description' => 'PRS Reimbursement without cutoff',
        ]);
    }
}
