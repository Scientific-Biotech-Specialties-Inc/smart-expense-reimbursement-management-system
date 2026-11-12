<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\ReceiptItem;
use App\Modules\AuditLogs\Models\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use App\Modules\Shared\Services\PasswordVerificationService;
use Carbon\Carbon;
use Mockery;

class ReimbursementLogicTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'John Doe',
            'email' => 'john.doe@example.com',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'IT',
        ]);

        $this->admin = User::create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'role' => 'admin',
            'grade' => 'L5',
            'department' => 'accounting',
        ]);

        Storage::fake('supabase');
    }

    public function test_default_status_is_pending(): void
    {
        $category = \App\Modules\Reimbursements\Models\ExpenseCategory::firstOrCreate(['name' => 'Meals']);

        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_test.png',
            'file_hash' => str_repeat('a', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Vendor Test',
            'total_amount' => 100.00,
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
            'description' => 'Business Lunch',
            'expense_category_id' => $category->id,
            'event_type' => 'Client Meeting',
            'category' => 'Meals',
            'amount' => 100.00,
            'date' => '2026-06-10',
            'receipt_ids' => [$receipt->id],
            'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf')
        ]);

        $response->assertStatus(201);
        $this->assertEquals('pending', $response->json('data.status'));
        
        $this->assertDatabaseHas('reimbursements', [
            'id' => $response->json('data.id'),
            'status' => 'pending'
        ]);
    }

    public function test_receipt_upload_allows_missing_category(): void
    {
        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->post('/api/reimbursements/receipts', [
                'file' => UploadedFile::fake()->create('receipt.pdf', 100, 'application/pdf'),
                'is_mock' => '1',
            ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.expense_category_id', null);
        $response->assertJsonPath('data.status', 'processed');

        $this->assertDatabaseHas('receipts', [
            'uploaded_by' => $this->employee->id,
            'expense_category_id' => null,
            'status' => 'processed',
        ]);
    }

    public function test_categories_endpoint_seeds_defaults_when_empty(): void
    {
        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->getJson('/api/reimbursements/categories');

        $response->assertStatus(200);
        $response->assertJsonFragment(['name' => 'Meals']);
        $response->assertJsonFragment(['name' => 'Transportation']);

        $this->assertDatabaseHas('expense_categories', ['name' => 'Meals']);
        $this->assertDatabaseHas('expense_categories', ['name' => 'Transportation']);
    }

    public function test_receipt_list_includes_reimbursement_count(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_claimed.png',
            'file_hash' => str_repeat('d', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Claimed Vendor',
            'transaction_date' => '2026-06-10',
            'total_amount' => 100.00,
            'invoice_number' => 'INV-COUNT',
            'status' => 'Processed',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Claimed Receipt',
            'category' => 'Meals',
            'amount' => 100.00,
            'date' => Carbon::now(),
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $reimbursement->receipts()->attach($receipt->id);

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->getJson('/api/reimbursements/receipts');

        $response->assertStatus(200);
        $response->assertJsonPath('data.0.reimbursements_count', 1);
    }

    public function test_fresh_unattached_receipt_reports_zero_reimbursement_count(): void
    {
        // A freshly uploaded receipt that has NOT been forwarded to any
        // reimbursement must report reimbursements_count === 0, so the frontend
        // never treats it as "already attached".
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_fresh.png',
            'file_hash' => str_repeat('f', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Fresh Vendor',
            'transaction_date' => '2026-06-10',
            'total_amount' => 100.00,
            'invoice_number' => 'INV-FRESH',
            'status' => 'pending',
        ]);

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->getJson('/api/reimbursements/receipts');

        $response->assertStatus(200);
        $response->assertJsonPath('data.0.reimbursements_count', 0);
        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'pending',
        ]);
    }

    public function test_reimbursement_cannot_reuse_claimed_receipt(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_reused.png',
            'file_hash' => str_repeat('e', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Already Claimed Vendor',
            'transaction_date' => '2026-06-10',
            'total_amount' => 100.00,
            'invoice_number' => 'INV-REUSED',
            'status' => 'Processed',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Original Claim',
            'category' => 'Meals',
            'amount' => 100.00,
            'date' => Carbon::now(),
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $reimbursement->receipts()->attach($receipt->id);

        $category = \App\Modules\Reimbursements\Models\ExpenseCategory::firstOrCreate(['name' => 'Meals']);

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->withHeaders(['Accept' => 'application/json'])
            ->post('/api/reimbursements', [
                'description' => 'Duplicate Claim',
                'expense_category_id' => $category->id,
                'event_type' => 'Client Meeting',
                'category' => 'Meals',
                'amount' => 100.00,
                'date' => '2026-06-10',
                'receipt_ids' => [$receipt->id],
                'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('receipt_ids');
    }

    public function test_self_approval_is_prohibited(): void
    {
        // Mock external password verification to return true via Http fake
        \Illuminate\Support\Facades\Http::fake([
            '*/api/verify-password' => \Illuminate\Support\Facades\Http::response(['valid' => true], 200),
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->admin->id, // Admin created their own claim
            'description' => 'Business Trip',
            'category' => 'Travel',
            'amount' => 500.00,
            'date' => Carbon::now(),
            'status' => 'pending',
            'submitted_by_name' => $this->admin->name,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'department' => 'accounting',
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        // Admin tries to approve their own claim
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$reimbursement->id}/approve", [
            'password' => 'valid_password'
        ]);

        $response->assertStatus(403);
        $response->assertJson(['message' => 'Conflict. Self-approval is strictly prohibited.']);
    }

    public function test_admin_can_update_status(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Office Supplies',
            'category' => 'Supplies',
            'amount' => 50.00,
            'date' => Carbon::now(),
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'department' => 'accounting',
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->patchJson("/api/reimbursements/{$reimbursement->id}", [
            'status' => 'approved',
            'admin_notes' => 'Looks good.'
        ]);

        $response->assertStatus(200);
        $this->assertEquals('approved', $response->json('data.status'));
        $this->assertEquals('Looks good.', $response->json('data.admin_notes'));
    }

    public function test_detail_panel_returns_accurate_data(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_test.png',
            'file_hash' => str_repeat('b', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Data Accuracy Vendor',
            'total_amount' => 150.00,
        ]);

        ReceiptItem::create([
            'receipt_id' => $receipt->id,
            'name' => 'Item 1',
            'quantity' => 1,
            'price' => 150.00,
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Detail Panel Test',
            'category' => 'Meals',
            'amount' => 150.00,
            'date' => Carbon::now(),
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $reimbursement->receipts()->attach($receipt->id);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Doe',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->getJson("/api/reimbursements/{$reimbursement->id}");

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'id',
            'description',
            'amount',
            'status',
            'receipts' => [
                '*' => [
                    'id',
                    'vendor_name',
                    'total_amount',
                    'items' => [
                        '*' => [
                            'id',
                            'name',
                            'price'
                        ]
                    ]
                ]
            ],
            'user' => [
                'id',
                'name',
                'email'
            ]
        ]);

        $this->assertEquals('Detail Panel Test', $response->json('description'));
        $this->assertEquals('Data Accuracy Vendor', $response->json('receipts.0.vendor_name'));
        $this->assertEquals('Item 1', $response->json('receipts.0.items.0.name'));
        $this->assertEquals($this->employee->name, $response->json('user.name'));
    }

    public function test_automatic_rejection_rule(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_reject.png',
            'file_hash' => str_repeat('c', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Rejected Vendor',
            'total_amount' => 200.00,
            'status' => 'pending',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Automatic Rejection Test',
            'category' => 'Meals',
            'amount' => 200.00,
            'date' => Carbon::now(),
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $reimbursement->receipts()->attach($receipt->id);

        // Update the receipt to 'rejected' status
        // The Observer should automatically reject the linked reimbursement
        $receipt->update([
            'status' => 'rejected'
        ]);

        $reimbursement->refresh();

        $this->assertEquals('rejected', $reimbursement->status);
        $this->assertEquals('Automatically rejected because a linked receipt was rejected.', $reimbursement->admin_notes);
        $this->assertEquals('Automatically rejected because a linked receipt was rejected.', $reimbursement->rejection_comment);
    }

    public function test_reimbursement_stores_optional_user_comment(): void
    {
        $category = \App\Modules\Reimbursements\Models\ExpenseCategory::firstOrCreate(['name' => 'Meals']);

        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_comment_test.png',
            'file_hash' => str_repeat('d', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Cafe Test',
            'total_amount' => 150.00,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Doe',
        ]);

        $customComment = 'Project kickoff lunch with external client partners.';

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->post('/api/reimbursements', [
            'description' => 'Client Lunch',
            'user_comment' => $customComment,
            'expense_category_id' => $category->id,
            'event_type' => 'Client Meeting',
            'amount' => 150.00,
            'date' => '2026-06-15',
            'receipt_ids' => [$receipt->id],
            'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf')
        ]);

        $response->assertStatus(201);
        $this->assertEquals($customComment, $response->json('data.user_comment'));

        $this->assertDatabaseHas('reimbursements', [
            'id' => $response->json('data.id'),
            'user_comment' => $customComment,
        ]);
    }

    public function test_reimbursement_can_be_submitted_without_user_comment(): void
    {
        $category = \App\Modules\Reimbursements\Models\ExpenseCategory::firstOrCreate(['name' => 'Transport']);

        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_no_comment.png',
            'file_hash' => str_repeat('e', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Taxi Service',
            'total_amount' => 80.00,
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
            'description' => 'Taxi Ride',
            'expense_category_id' => $category->id,
            'event_type' => 'Client Meeting',
            'amount' => 80.00,
            'date' => '2026-06-16',
            'receipt_ids' => [$receipt->id],
            'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf')
        ]);

        $response->assertStatus(201);
        $this->assertNull($response->json('data.user_comment'));

        $this->assertDatabaseHas('reimbursements', [
            'id' => $response->json('data.id'),
            'user_comment' => null,
        ]);
    }

    public function test_employee_can_update_user_comment(): void
    {
        $category = \App\Modules\Reimbursements\Models\ExpenseCategory::firstOrCreate(['name' => 'Supplies']);

        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_update_comment.png',
            'file_hash' => str_repeat('f', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Stationery Shop',
            'total_amount' => 50.00,
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Pens and Notebooks',
            'user_comment' => 'Initial comment',
            'expense_category_id' => $category->id,
            'amount' => 50.00,
            'date' => '2026-06-17',
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);
        $reimbursement->receipts()->attach($receipt->id);

        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Doe',
        ]);

        $updatedComment = 'Updated notes with additional rationale.';

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->patch('/api/reimbursements/' . $reimbursement->id, [
            'user_comment' => $updatedComment,
            'description' => 'Pens and Notebooks Updated',
        ]);

        $response->assertStatus(200);
        $this->assertEquals($updatedComment, $response->json('data.user_comment'));
        $this->assertDatabaseHas('reimbursements', [
            'id' => $reimbursement->id,
            'user_comment' => $updatedComment,
        ]);
    }

    public function test_reimbursement_eager_loads_payout_relation(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Granted Reimbursement',
            'amount' => 1500.00,
            'date' => '2026-10-01',
            'status' => 'granted',
            'submitted_by_name' => $this->employee->name,
        ]);

        \App\Modules\Reimbursements\Models\Payout::create([
            'reimbursement_id' => $reimbursement->id,
            'request_date' => '2026-10-01',
            'approved_at' => '2026-10-05 14:00:00',
            'granted_at' => '2026-10-10 10:00:00',
            'approved_by' => 'Finance Manager',
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'E-wallet',
            'amount' => 1500.00,
            'granter_signature' => 'data:image/png;base64,granterSig',
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
        ])->get('/api/reimbursements');

        $response->assertStatus(200);
        $this->assertEquals('E-wallet', $response->json('0.payout.payout_method'));
        $this->assertEquals('Cashier Jane', $response->json('0.payout.granted_by'));
    }

    public function test_approve_saves_approving_admin_and_timestamp(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Client Lunch',
            'amount' => 1200.00,
            'date' => '2026-10-01',
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/approve', []);

        $response->assertStatus(200);
        $this->assertEquals('approved', $response->json('data.status'));
        $this->assertEquals($this->admin->name, $response->json('data.approved_by'));
        $this->assertNotNull($response->json('data.approved_at'));
    }

    public function test_grant_creates_payout_record_and_blocks_duplicate_or_unapproved_grant(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Conference Travel',
            'amount' => 3500.00,
            'date' => '2026-10-02',
            'status' => 'approved',
            'approved_by' => 'Finance Approver',
            'approved_at' => '2026-10-05 12:00:00',
            'submitted_by_name' => $this->employee->name,
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        // Selecting Other without payout_method_other fails validation (G2-045)
        $invalidResponse = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/grant', [
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Other',
            'granter_signature' => 'data:image/png;base64,granterSig',
        ]);
        $invalidResponse->assertStatus(422);

        // Valid grant (G2-044, G2-045, G2-046, G2-047)
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/grant', [
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Other',
            'payout_method_other' => 'GCash Corporate',
            'granter_signature' => 'data:image/png;base64,granterSig',
        ]);

        $response->assertStatus(200);
        $this->assertEquals('granted', $response->json('data.status'));
        $this->assertEquals('Cashier Jane', $response->json('data.payout.granted_by'));
        $this->assertEquals('Finance Approver', $response->json('data.payout.approved_by'));
        $this->assertEquals('Other', $response->json('data.payout.payout_method'));
        $this->assertEquals('GCash Corporate', $response->json('data.payout.payout_method_other'));
        $this->assertEquals('3500.00', $response->json('data.payout.amount'));

        // Duplicate grant is blocked (G2-047)
        $secondGrant = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/grant', [
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Cash',
            'granter_signature' => 'data:image/png;base64,granterSig',
        ]);
        $secondGrant->assertStatus(403);
    }

    public function test_employee_can_acknowledge_own_granted_payout_once_and_not_others(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Granted Reimbursement',
            'amount' => 1500.00,
            'date' => '2026-10-01',
            'status' => 'granted',
            'submitted_by_name' => $this->employee->name,
        ]);

        \App\Modules\Reimbursements\Models\Payout::create([
            'reimbursement_id' => $reimbursement->id,
            'request_date' => '2026-10-01',
            'approved_at' => '2026-10-05 14:00:00',
            'granted_at' => '2026-10-10 10:00:00',
            'approved_by' => 'Finance Manager',
            'granted_by' => 'Cashier Jane',
            'payout_method' => 'Cash',
            'amount' => 1500.00,
            'granter_signature' => 'data:image/png;base64,granterSig',
        ]);

        $otherUser = User::create([
            'name' => 'Other Emp',
            'email' => 'other@example.com',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'IT',
        ]);

        $otherToken = $this->generateMockToken([
            'email' => $otherUser->email,
            'role' => $otherUser->role,
            'first_name' => 'Other',
            'last_name' => 'Emp',
        ]);

        // Other employee cannot acknowledge (G2-050, G2-053)
        $forbidden = $this->withHeaders([
            'Authorization' => 'Bearer ' . $otherToken,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/acknowledge', [
            'employee_signature' => 'data:image/png;base64,empSig',
        ]);
        $forbidden->assertStatus(403);

        // Owning employee acknowledges (G2-050)
        $empToken = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => $this->employee->role,
            'first_name' => 'John',
            'last_name' => 'Doe',
        ]);

        $ok = $this->withHeaders([
            'Authorization' => 'Bearer ' . $empToken,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/acknowledge', [
            'employee_signature' => 'data:image/png;base64,empSig',
        ]);
        $ok->assertStatus(200);
        $this->assertEquals('data:image/png;base64,empSig', $ok->json('data.payout.employee_signature'));
        $this->assertNotNull($ok->json('data.payout.acknowledged_at'));

        // Cannot re-sign once acknowledged (G2-050 Task 3)
        $resign = $this->withHeaders([
            'Authorization' => 'Bearer ' . $empToken,
            'Accept' => 'application/json',
        ])->postJson('/api/reimbursements/' . $reimbursement->id . '/acknowledge', [
            'employee_signature' => 'data:image/png;base64,newSig',
        ]);
        $resign->assertStatus(403);
    }

    public function test_granted_reimbursement_cannot_be_updated_or_deleted(): void
    {
        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Locked Granted Claim',
            'amount' => 1500.00,
            'date' => '2026-10-01',
            'status' => 'granted',
            'submitted_by_name' => $this->employee->name,
        ]);

        $adminToken = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'first_name' => 'Admin',
            'last_name' => 'User',
        ]);

        $patchRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $adminToken,
            'Accept' => 'application/json',
        ])->patchJson('/api/reimbursements/' . $reimbursement->id, [
            'admin_notes' => 'Trying to edit granted record',
        ]);
        $patchRes->assertStatus(403);
    }

    public function test_store_reimbursement_requires_event_type(): void
    {
        $category = \App\Modules\Reimbursements\Models\ExpenseCategory::firstOrCreate(['name' => 'Meals']);
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_test.png',
            'file_hash' => str_repeat('b', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Vendor Test',
            'total_amount' => 100.00,
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
            'description' => 'Meeting Lunch',
            'expense_category_id' => $category->id,
            'amount' => 100.00,
            'date' => '2026-10-01',
            'receipt_ids' => [$receipt->id],
            'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['event_type']);
    }

    public function test_store_and_update_reimbursement_persists_event_type(): void
    {
        $category = \App\Modules\Reimbursements\Models\ExpenseCategory::firstOrCreate(['name' => 'Meals']);
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_test.png',
            'file_hash' => str_repeat('c', 64),
            'file_type' => 'png',
            'file_size_bytes' => 1024,
            'vendor_name' => 'Vendor Test',
            'total_amount' => 100.00,
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
            'description' => 'Meeting Lunch',
            'expense_category_id' => $category->id,
            'event_type' => 'Client Meeting',
            'amount' => 100.00,
            'date' => '2026-10-01',
            'receipt_ids' => [$receipt->id],
            'receipts' => [
                [
                    'id' => $receipt->id,
                    'event_type' => 'Client Meeting',
                ],
            ],
            'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
        ]);

        $response->assertStatus(201);
        $reimbursementId = $response->json('data.id');

        $this->assertDatabaseHas('reimbursements', [
            'id' => $reimbursementId,
            'event_type' => 'Client Meeting',
        ]);

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'event_type' => 'Client Meeting',
        ]);

        $updateRes = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ])->patch('/api/reimbursements/' . $reimbursementId, [
            'description' => 'Updated Meeting Lunch',
            'expense_category_id' => $category->id,
            'event_type' => 'Conference / Seminar',
            'amount' => 100.00,
            'date' => '2026-10-01',
            'receipt_ids' => [$receipt->id],
            'receipts' => [
                [
                    'id' => $receipt->id,
                    'event_type' => 'Conference / Seminar',
                ],
            ],
        ]);

        $updateRes->assertStatus(200);

        $this->assertDatabaseHas('reimbursements', [
            'id' => $reimbursementId,
            'event_type' => 'Conference / Seminar',
        ]);

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'event_type' => 'Conference / Seminar',
        ]);
    }
}



