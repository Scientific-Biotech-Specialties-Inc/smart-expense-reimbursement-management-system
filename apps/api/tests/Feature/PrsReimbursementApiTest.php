<?php

namespace Tests\Feature;

use App\Modules\Reimbursements\Jobs\UpdatePrsReimbursementStatusJob;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PrsReimbursementApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_valid_prs_api_request_creates_reimbursement(): void
    {
        config(['services.prs.reimbursement_api_key' => 'test-prs-api-key']);

        $response = $this->postJson(
            '/api/reimbursements/prs-requests',
            $this->payload(),
            ['Authorization' => 'Bearer test-prs-api-key']
        );

        $response->assertCreated()
            ->assertJsonPath('data.source_system', 'prs')
            ->assertJsonPath('data.source_submission_id', '123')
            ->assertJsonPath('data.is_request', true);

        $this->assertDatabaseHas('reimbursements', [
            'source_system' => 'prs',
            'source_submission_id' => '123',
            'is_request' => true,
            'status' => 'submitted',
        ]);
        $this->assertDatabaseHas('receipts', [
            'invoice_number' => 'INV-2026-00001',
            'file_path' => json_encode('https://prs.local/receipts/inv-00001.jpg'),
        ]);
    }

    public function test_invalid_api_key_is_rejected(): void
    {
        config(['services.prs.reimbursement_api_key' => 'test-prs-api-key']);

        $this->postJson(
            '/api/reimbursements/prs-requests',
            $this->payload(),
            ['Authorization' => 'Bearer wrong-key']
        )->assertUnauthorized();
    }

    public function test_duplicate_source_submission_is_idempotent(): void
    {
        config(['services.prs.reimbursement_api_key' => 'test-prs-api-key']);
        $headers = ['Authorization' => 'Bearer test-prs-api-key'];

        $this->postJson('/api/reimbursements/prs-requests', $this->payload(), $headers)->assertCreated();
        $this->postJson('/api/reimbursements/prs-requests', $this->payload(), $headers)->assertOk();

        $this->assertSame(1, Reimbursement::where('source_system', 'prs')->where('source_submission_id', '123')->count());
    }

    public function test_approval_of_prs_request_dispatches_prs_status_api_job(): void
    {
        Queue::fake();
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $employee = User::create([
            'email' => 'employee@serms.com',
            'name' => 'Employee User',
            'role' => 'employee',
            'department' => 'Sales',
        ]);
        $admin = User::create([
            'auth_id' => 99,
            'email' => 'admin@serms.com',
            'name' => 'Admin User',
            'role' => 'admin',
            'department' => 'Finance',
        ]);
        $reimbursement = Reimbursement::create([
            'user_id' => $employee->id,
            'description' => 'PRS imported request',
            'category' => 'Demo',
            'amount' => 500,
            'date' => '2026-06-15',
            'status' => 'submitted',
            'submitted_by_name' => $employee->name,
            'source_system' => 'prs',
            'source_submission_id' => '123',
            'is_request' => true,
        ]);

        $token = $this->generateMockToken([
            'sub' => $admin->auth_id,
            'email' => $admin->email,
            'role' => 'admin',
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$reimbursement->id}/approve", [
            'password' => 'correct-password',
        ])->assertOk();

        Queue::assertPushed(UpdatePrsReimbursementStatusJob::class, function (UpdatePrsReimbursementStatusJob $job) {
            return (string) $job->sourceSubmissionId === '123';
        });
    }

    private function payload(): array
    {
        return [
            'source_system' => 'prs',
            'source_submission_id' => '123',
            'is_request' => 1,
            'is_reimbursed' => 0,
            'source_user' => [
                'id' => 7,
                'name' => 'Sales User',
                'email' => 'sales@example.com',
                'department' => 'Sales & Marketing',
            ],
            'activity' => [
                'institution' => 'Clinic A',
                'contact_person' => 'Dr. Buyer',
                'product' => 'Kit A',
                'activity_type' => 'Demo',
                'activity_date' => '2026-06-15',
                'start_time' => '09:00',
                'description' => 'Approved activity',
            ],
            'receipt' => [
                'invoice_number' => 'INV-2026-00001',
                'transaction_date' => '2026-06-15',
                'tin' => '123-456-789-000',
                'vendor_name' => 'Clinic A',
                'expense_category_id' => null,
                'vat_classification' => 'vat',
                'total_amount' => 500,
                'vat_amount' => 60,
                'file_url' => 'https://prs.local/receipts/inv-00001.jpg',
                'items' => [
                    ['name' => 'Parking', 'quantity' => 1, 'price' => 500],
                ],
            ],
            'reimbursement' => [
                'description' => 'Reimbursement for Demo at Clinic A',
                'category' => 'Demo',
                'amount' => 500,
                'date' => '2026-06-15',
                'cutoff_period' => 'June 1-15, 2026',
            ],
        ];
    }
}
