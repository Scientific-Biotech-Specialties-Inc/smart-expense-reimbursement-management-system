<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Gate;
use App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\ReceiptItem;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ReceiptOwnerUpdateTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;   // receipt owner
    private User $admin;
    private User $otherEmployee;
    private ExpenseCategory $category;

    protected function setUp(): void
    {
        parent::setUp();

        // Mirror the auth.external middleware's admin resolution: the
        // `serms.reimbursements.manage` gate is granted to accounting users.
        Gate::define('serms.reimbursements.manage', function ($user) {
            return method_exists($user, 'hasAdminPrivileges')
                ? $user->hasAdminPrivileges()
                : strtolower(trim((string) ($user->department ?? ''))) === 'accounting';
        });

        $this->employee = User::create([
            'email' => 'employee@serms.com',
            'name' => 'John Santos',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'SALES',
            'avatar' => 'JS',
        ]);

        $this->admin = User::create([
            'email' => 'admin@serms.com',
            'name' => 'Alex Reyes',
            'role' => 'admin',
            'grade' => 'EXEC',
            'department' => 'accounting', // accounting => admin privileges
            'avatar' => 'AR',
        ]);

        $this->otherEmployee = User::create([
            'email' => 'other@serms.com',
            'name' => 'Jane Smith',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'HR',
            'avatar' => 'JS',
        ]);

        $this->category = ExpenseCategory::create(['name' => 'Meals']);
    }

    /**
     * Helper: dispatch a PATCH through the route without the JWT middleware,
     * acting as the given user (the project's passing tests use this pattern
     * because the sandbox lacks the AI-service public key).
     */
    private function patchAs(User $user, int $receiptId, array $payload)
    {
        return $this->withoutMiddleware(AuthenticateWithExternalService::class)
            ->actingAs($user)
            ->patchJson("/api/reimbursements/receipts/{$receiptId}", $payload);
    }

    public function test_admin_can_update_status_and_admin_notes(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/admin_update.png'],
            'file_hash' => [str_repeat('a', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Original Vendor',
            'status' => 'pending',
        ]);

        $response = $this->patchAs($this->admin, $receipt->id, [
            'status' => 'approved',
            'admin_notes' => 'Verified by finance.',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'approved');
        $response->assertJsonPath('data.admin_notes', 'Verified by finance.');

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'approved',
            'admin_notes' => 'Verified by finance.',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->admin->id,
            'actor_role' => 'admin',
            'action_type' => 'RECEIPT_UPDATED',
            'entity_type' => 'receipt',
            'entity_id' => $receipt->id,
        ]);
    }

    public function test_owner_can_correct_ocr_fields(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/owner_correct.png'],
            'file_hash' => [str_repeat('b', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'OCR Vendor',
            'total_amount' => 100.00,
            'vat_amount' => 12.00,
            'vat_classification' => 'vat',
            'status' => 'pending', // status left untouched by OCR/admins
        ]);

        $response = $this->patchAs($this->employee, $receipt->id, [
            'expense_category_id' => $this->category->id,
            'vendor_name' => 'Corrected Vendor',
            'transaction_date' => '2026-06-15',
            'total_amount' => 250.00,
            'vat_amount' => 30.00,
            'tin' => '999-888-777-000',
            'invoice_number' => 'INV-2026-7777',
            'location' => 'Cebu',
            'vat_classification' => 'VAT', // normalized to lowercase
            'currency' => 'PHP',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.vendor_name', 'Corrected Vendor');
        $response->assertJsonPath('data.total_amount', '250.00');
        $response->assertJsonPath('data.vat_classification', 'vat');
        $response->assertJsonPath('data.currency', 'PHP');

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'uploaded_by' => $this->employee->id,
            'vendor_name' => 'Corrected Vendor',
            'total_amount' => '250.00',
            'vat_amount' => '30.00',
            'tin' => '999-888-777-000',
            'invoice_number' => 'INV-2026-7777',
            'location' => 'Cebu',
            'vat_classification' => 'vat',
            'currency' => 'PHP',
            'expense_category_id' => $this->category->id,
            'status' => 'pending', // unchanged
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'actor_role' => 'employee',
            'action_type' => 'RECEIPT_UPDATED',
            'entity_type' => 'receipt',
            'entity_id' => $receipt->id,
        ]);
    }

    public function test_owner_cannot_set_status_or_admin_notes(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/owner_locked.png'],
            'file_hash' => [str_repeat('c', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Locked Vendor',
            'status' => 'pending',
            'admin_notes' => null,
        ]);

        $response = $this->patchAs($this->employee, $receipt->id, [
            'status' => 'rejected',       // must be ignored for non-admin
            'admin_notes' => 'hacked',     // must be ignored for non-admin
            'vendor_name' => 'Still Allowed',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.vendor_name', 'Still Allowed');

        // Admin-only fields must NOT have changed.
        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'pending',
            'admin_notes' => null,
            'vendor_name' => 'Still Allowed',
        ]);
    }

    /**
     * A non-admin owner MAY promote their own (non-attached) poor-OCR receipt to
     * `processed` and clear the `ocr_flagged` flag, without admin intervention.
     */
    public function test_owner_can_promote_non_attached_receipt_to_processed(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/owner_promote.png'],
            'file_hash' => [str_repeat('f', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Flagged Vendor',
            'status' => 'flagged',
            'ocr_flagged' => true,
        ]);

        $response = $this->patchAs($this->employee, $receipt->id, [
            'status' => 'processed',
            'vendor_name' => 'Corrected Vendor',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'processed');
        $response->assertJsonPath('data.ocr_flagged', false);

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'processed',
            'ocr_flagged' => false,
            'vendor_name' => 'Corrected Vendor',
        ]);
    }

    /**
     * The mirroring invariant: a non-admin owner must NOT be able to flip the
     * status of a receipt that is already attached to a reimbursement. The
     * promotion request is ignored; OCR fields remain editable.
     */
    public function test_owner_cannot_promote_attached_receipt_to_processed(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/owner_attached.png'],
            'file_hash' => [str_repeat('g', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Attached Vendor',
            'status' => 'flagged',
            'ocr_flagged' => true,
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Linked request',
            'amount' => 100.00,
            'date' => '2026-06-20',
            'status' => 'pending',
        ]);
        $receipt->reimbursements()->attach($reimbursement->id);

        $response = $this->patchAs($this->employee, $receipt->id, [
            'status' => 'processed',
            'vendor_name' => 'Should Not Apply Status',
        ]);

        $response->assertStatus(200);

        // Status + ocr_flagged stay untouched (mirroring protected); OCR field
        // correction is still applied.
        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'flagged',
            'ocr_flagged' => true,
            'vendor_name' => 'Should Not Apply Status',
        ]);
    }

    /**
     * Helper: POST a resubmit through the route without the JWT middleware.
     */
    private function resubmitAs(User $user, int $receiptId, array $payload)
    {
        return $this->withoutMiddleware(AuthenticateWithExternalService::class)
            ->actingAs($user)
            ->postJson("/api/reimbursements/receipts/{$receiptId}/resubmit", $payload);
    }

    /**
     * A non-admin owner can resubmit a `flagged` (poor-OCR) receipt; it becomes
     * `processed` with `ocr_flagged` cleared.
     */
    public function test_owner_can_resubmit_flagged_receipt(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/owner_resubmit_flagged.png'],
            'file_hash' => [str_repeat('h', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Blurry Vendor',
            'status' => 'flagged',
            'ocr_flagged' => true,
        ]);

        $response = $this->resubmitAs($this->employee, $receipt->id, [
            'vendor_name' => 'Corrected Vendor',
            'total_amount' => 300.00,
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'processed');
        $response->assertJsonPath('data.ocr_flagged', false);
        $response->assertJsonPath('data.vendor_name', 'Corrected Vendor');

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'status' => 'processed',
            'ocr_flagged' => false,
            'vendor_name' => 'Corrected Vendor',
        ]);
    }

    /**
     * A non-admin owner must NOT be able to resubmit a `rejected` or
     * `automatic-rejected` receipt back to `processed`.
     */
    public function test_owner_cannot_resubmit_rejected_or_automatic_rejected_receipt(): void
    {
        foreach (['rejected', 'automatic-rejected'] as $status) {
            $receipt = Receipt::create([
                'uploaded_by' => $this->employee->id,
                'file_path' => ["receipts/owner_resubmit_{$status}.png"],
                'file_hash' => [hash('sha256', "owner_resubmit_{$status}")],
                'file_type' => ['png'],
                'file_size_bytes' => [1024],
                'vendor_name' => 'Rejected Vendor',
                'status' => $status,
                'ocr_flagged' => true,
                'rejection_code' => 'unreadable',
                'rejection_reason' => 'Receipt is too unreadable.',
            ]);

            $response = $this->resubmitAs($this->employee, $receipt->id, [
                'vendor_name' => 'Rejected Corrected Vendor',
            ]);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['status']);

            $this->assertDatabaseHas('receipts', [
                'id' => $receipt->id,
                'status' => $status,
                'ocr_flagged' => true,
                'vendor_name' => 'Rejected Vendor',
            ]);
        }
    }

    /**
     * A non-admin owner must NOT be able to edit or promote a `rejected` or
     * `automatic-rejected` receipt via PATCH update.
     */
    public function test_owner_cannot_update_or_promote_rejected_or_automatic_rejected_receipt(): void
    {
        foreach (['rejected', 'automatic-rejected'] as $status) {
            $receipt = Receipt::create([
                'uploaded_by' => $this->employee->id,
                'file_path' => ["receipts/owner_patch_{$status}.png"],
                'file_hash' => [hash('sha256', "owner_patch_{$status}")],
                'file_type' => ['png'],
                'file_size_bytes' => [1024],
                'vendor_name' => 'Rejected Patch Vendor',
                'status' => $status,
                'ocr_flagged' => true,
                'rejection_code' => 'faded',
                'rejection_reason' => 'Too faded.',
            ]);

            $response = $this->patchAs($this->employee, $receipt->id, [
                'status' => 'processed',
                'vendor_name' => 'Should Not Save',
            ]);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['status']);

            $this->assertDatabaseHas('receipts', [
                'id' => $receipt->id,
                'status' => $status,
                'ocr_flagged' => true,
                'vendor_name' => 'Rejected Patch Vendor',
            ]);
        }
    }

    public function test_unrelated_employee_cannot_update_receipt(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/owner_only.png'],
            'file_hash' => [str_repeat('d', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Owner Only Vendor',
        ]);

        $response = $this->patchAs($this->otherEmployee, $receipt->id, [
            'vendor_name' => 'Intruder Vendor',
        ]);

        $response->assertStatus(403);
        $response->assertJsonPath('message', 'Unauthorized.');

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'vendor_name' => 'Owner Only Vendor',
        ]);
    }

    public function test_owner_can_sync_items(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/owner_items.png'],
            'file_hash' => [str_repeat('e', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Items Vendor',
        ]);

        ReceiptItem::create([
            'receipt_id' => $receipt->id,
            'name' => 'Old Item',
            'quantity' => 1,
            'price' => 50.00,
        ]);

        // Send items as a JSON string (FormData style) to exercise prepareForValidation.
        $itemsJson = json_encode([
            ['name' => 'New Item A', 'quantity' => 2, 'price' => 25.00],
            ['name' => 'New Item B', 'quantity' => 1, 'price' => 100.00],
        ]);

        $response = $this->patchAs($this->employee, $receipt->id, [
            'items' => $itemsJson,
        ]);

        $response->assertStatus(200);
        $this->assertCount(2, $response->json('data.items'));

        $this->assertDatabaseMissing('receipt_items', [
            'receipt_id' => $receipt->id,
            'name' => 'Old Item',
        ]);
        $this->assertDatabaseHas('receipt_items', [
            'receipt_id' => $receipt->id,
            'name' => 'New Item A',
            'quantity' => 2,
            'price' => '25.00',
        ]);
        $this->assertDatabaseHas('receipt_items', [
            'receipt_id' => $receipt->id,
            'name' => 'New Item B',
            'quantity' => 1,
            'price' => '100.00',
        ]);
    }

    public function test_owner_can_commit_draft_receipt_and_see_it_in_my_expense_list(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/draft_upload.png'],
            'file_hash' => [str_repeat('f', 64)],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'status' => 'processing',
            'is_draft' => true,
        ]);

        // Draft receipt should not appear in My Expense listing yet.
        $beforeList = $this->withoutMiddleware(AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->getJson('/api/reimbursements/receipts?scope=mine');
        $beforeList->assertStatus(200);
        $this->assertCount(0, $beforeList->json('data'));

        // Committing via JSON PATCH with is_draft = false makes it visible.
        $patchResponse = $this->patchAs($this->employee, $receipt->id, [
            'expense_category_id' => $this->category->id,
            'transaction_date' => '2026-11-22',
            'is_draft' => false,
        ]);
        $patchResponse->assertStatus(200)
            ->assertJsonPath('data.is_draft', false);

        $afterList = $this->withoutMiddleware(AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->getJson('/api/reimbursements/receipts?scope=mine');
        $afterList->assertStatus(200);
        $this->assertCount(1, $afterList->json('data'));
        $this->assertSame($receipt->id, $afterList->json('data.0.id'));
    }
}
