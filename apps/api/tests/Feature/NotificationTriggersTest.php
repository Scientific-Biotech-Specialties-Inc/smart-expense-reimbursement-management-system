<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Services\ReimbursementService;
use App\Modules\Reimbursements\Services\OcrCallbackService;
use App\Modules\CashAdvances\Services\CashAdvanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;

class NotificationTriggersTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;
    private ExpenseCategory $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->employee = User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@sbsi.com',
            'role' => 'employee',
            'department' => 'Operations',
        ]);

        $this->admin = User::create([
            'name' => 'Maria Admin',
            'email' => 'maria@sbsi.com',
            'role' => 'admin',
            'department' => 'Accounting',
        ]);

        $this->category = ExpenseCategory::create([
            'name' => 'Meals',
            'description' => 'Meals and refreshments',
        ]);
    }

    public function test_reimbursement_lifecycle_triggers_employee_and_admin_notifications(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/r1.jpg'],
            'file_hash' => ['hash1'],
            'file_type' => ['jpeg'],
            'file_size_bytes' => [1024],
            'expense_category_id' => $this->category->id,
            'vendor_name' => 'Jollibee',
            'transaction_date' => '2026-10-20',
            'total_amount' => 4500.10,
            'status' => 'processed',
        ]);

        $service = app(ReimbursementService::class);

        // 1. Employee submits reimbursement (with user_comment)
        $reimbursement = $service->storeReimbursement($this->employee, [
            'description' => 'Client lunch meeting',
            'user_comment' => 'Urgent client visit in Makati',
            'expense_category_id' => $this->category->id,
            'amount' => 4500.10,
            'date' => '2026-10-20',
            'receipt_ids' => [$receipt->id],
        ], null);

        // Employee gets submission confirmation (G2-068)
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_submitted',
            'module' => 'Reimbursement',
            'record_link' => "/reimbursements?view={$reimbursement->id}",
        ]);

        // Admin gets new request notification (G2-070) + employee note notification (G2-072)
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_reimbursement_submitted',
            'module' => 'Reimbursement',
            'record_link' => "/reimbursements?view={$reimbursement->id}",
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_employee_note_added',
            'module' => 'Reimbursement',
        ]);

        // 2. Admin requests revision (G2-069)
        $req = Request::create('/api/reimbursements/' . $reimbursement->id . '/reject', 'POST');
        $service->rejectReimbursement($this->admin, $reimbursement->id, 'Please attach itemized slip.', null, '127.0.0.1', $req, 'revise');

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_revised',
            'module' => 'Reimbursement',
        ]);

        // 3. Employee resubmits after revision (G2-072)
        $service->updateReimbursement($this->employee, $reimbursement->id, [
            'description' => 'Client lunch meeting updated',
            'user_comment' => 'Attached updated slip',
        ], false);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_reimbursement_resubmitted',
            'module' => 'Reimbursement',
        ]);

        // 4. Admin approves and grants (G2-069)
        $service->approveReimbursement($this->admin, $reimbursement->id, null, '127.0.0.1', $req);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_approved',
            'module' => 'Reimbursement',
        ]);

        $service->grantReimbursement($this->admin, $reimbursement->id, null, '127.0.0.1', $req, [
            'granted_by' => $this->admin->name,
            'payout_method' => 'Cash',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'reimbursement_granted',
            'module' => 'Reimbursement',
        ]);

        // 5. Employee signs to acknowledge payout (G2-068 Task 4 & G2-072 Task 2)
        $service->acknowledgePayout($this->employee, $reimbursement->id, 'data:image/png;base64,sig', '127.0.0.1');
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'payout_acknowledged',
            'module' => 'Reimbursement',
            'record_link' => "/payout?view={$reimbursement->id}",
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_payout_signed',
            'module' => 'Reimbursement',
            'record_link' => "/payout?view={$reimbursement->id}",
        ]);
    }

    public function test_ocr_callback_notifies_employee_when_receipt_processed_or_auto_rejected(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/ocr1.jpg'],
            'file_hash' => ['hash_ocr1'],
            'file_type' => ['jpeg'],
            'file_size_bytes' => [1024],
            'status' => 'processing',
        ]);

        $ocrService = app(OcrCallbackService::class);
        $ocrService->handle($receipt->id, [
            'vendor_name' => 'Mercury Drug',
            'total_amount' => 850.00,
            'ocr_confidence_score' => 0.92,
            'status' => 'processed',
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'receipt_processed',
            'module' => 'My Expense',
            'record_link' => "/my-expense?view={$receipt->id}",
        ]);

        $badReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/ocr2.jpg'],
            'file_hash' => ['hash_ocr2'],
            'file_type' => ['jpeg'],
            'file_size_bytes' => [1024],
            'status' => 'processing',
        ]);

        $ocrService->handle($badReceipt->id, [
            'status' => 'rejected',
            'rejection_code' => 'blurry',
            'rejection_reason' => 'Image is too blurry to read.',
            'ocr_confidence_score' => 0.15,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'receipt_auto_rejected',
            'module' => 'My Expense',
            'record_link' => "/my-expense?view={$badReceipt->id}",
        ]);
    }

    public function test_cash_advance_and_liquidation_lifecycle_notifications(): void
    {
        $caService = app(CashAdvanceService::class);

        // Employee submits cash advance (G2-068 & G2-070)
        $advance = $caService->createAdvance($this->employee, [
            'purpose' => 'Regional Lab Calibration',
            'amount' => 12000.00,
            'expected_disbursement_date' => '2026-10-25',
            'expected_liquidation_date' => '2026-11-05',
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->employee->id,
            'type' => 'cash_advance_submitted',
            'module' => 'Cash Advance',
            'record_link' => "/cash-advances?view={$advance->id}",
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_cash_advance_submitted',
            'module' => 'Cash Advance',
            'record_link' => "/cash-advances?view={$advance->id}",
        ]);

        // Employee signs cash advance (G2-072 Task 2)
        $advance->update(['status' => 'disbursed']);
        $caService->acknowledgeAdvance($advance, ['signature' => 'data:image/png;base64,casig']);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'type' => 'admin_cash_advance_signed',
            'module' => 'Cash Advance',
            'record_link' => "/cash-advances?view={$advance->id}",
        ]);
    }
}
