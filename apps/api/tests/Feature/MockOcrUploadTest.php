<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Queue;

class MockOcrUploadTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'Mock Tester',
            'email' => 'mock.tester@example.com',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'IT',
        ]);

        Storage::fake('supabase');
        Queue::fake();
    }

    public function test_mock_reimbursement_upload_returns_processed_with_mock_fields(): void
    {
        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->post('/api/reimbursements/receipts', [
                'file' => UploadedFile::fake()->image('jollibee_mock.png'),
                'is_mock' => '1',
            ], ['X-Mock-OCR' => '1']);

        $response->assertStatus(201);
        $response->assertJsonPath('data.status', 'processed');
        $this->assertNotEmpty($response->json('data.vendor_name'));
        $this->assertNotEmpty($response->json('data.tin'));
        $this->assertNotEmpty($response->json('data.invoice_number'));
        $this->assertGreaterThan(0, (float) $response->json('data.total_amount'));
        $this->assertEquals('PHP', $response->json('data.currency'));

        $this->assertDatabaseHas('receipts', [
            'id' => $response->json('data.id'),
            'status' => 'processed',
        ]);
    }

    public function test_mock_liquidation_scan_returns_processed_with_mock_fields(): void
    {
        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->post('/api/liquidations/scan', [
                'files' => [UploadedFile::fake()->image('sm_mock.png')],
                'is_mock' => '1',
            ], ['X-Mock-OCR' => '1']);

        $response->assertStatus(201);
        $response->assertJsonPath('data.status', 'processed');
        $this->assertNotEmpty($response->json('data.vendor_name'));
        $this->assertGreaterThan(0, (float) $response->json('data.total_amount'));
    }
}
