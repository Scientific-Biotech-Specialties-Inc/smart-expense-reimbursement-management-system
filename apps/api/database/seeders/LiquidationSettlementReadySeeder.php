<?php

namespace Database\Seeders;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceDisbursement;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\ReceiptItem;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds:
 * 1. A pending liquidation request linked to an existing employee cash advance
 *    for the Admin Liquidation Console review/approve flow.
 * 2. A signed, acknowledged cash advance for each admin/finance account so
 *    "New Liquidation Request" -> settlement is immediately available on the admin side.
 */
class LiquidationSettlementReadySeeder extends Seeder
{
    public function run(): void
    {
        $disbursedAt = Carbon::today()->subDays(3);
        $dueDate = Carbon::today()->addDays(14);
        $submittedAt = Carbon::now()->subDays(5);

        $this->seedAdminSignedAdvances($disbursedAt, $dueDate, $submittedAt);
        $this->seedEmployeePendingLiquidation($disbursedAt, $dueDate, $submittedAt);
    }

    private function seedAdminSignedAdvances(Carbon $disbursedAt, Carbon $dueDate, Carbon $submittedAt): void
    {
        $adminUsers = User::whereIn('email', [
            'admin@example.com',
            'superadmin@example.com',
            'sum@sbsi.com',
            'slosinada@gmail.com',
        ])->get();

        foreach ($adminUsers as $admin) {
            $purpose = "Settlement Ready — Field Operations ({$admin->email})";

            DB::transaction(function () use ($admin, $purpose, $disbursedAt, $dueDate, $submittedAt): void {
                $advance = CashAdvance::updateOrCreate(
                    ['user_id' => $admin->id, 'purpose' => $purpose],
                    [
                        'amount' => 5000.00,
                        'outstanding_balance' => 5000.00,
                        'expected_disbursement_date' => $disbursedAt,
                        'expected_liquidation_date' => $dueDate,
                        'status' => 'signed',
                        'signature' => 'SEEDED-SIGNATURE',
                        'acknowledged_at' => $disbursedAt,
                        'submitted_at' => $submittedAt,
                    ]
                );

                CashAdvanceDisbursement::updateOrCreate(
                    ['cash_advance_id' => $advance->id],
                    [
                        'disbursed_by_id' => $admin->id,
                        'disbursement_date' => $disbursedAt,
                        'channel' => 'bank-transfer',
                        'reference_number' => "SEED-SETTLE-{$advance->id}",
                    ]
                );
            });
        }
    }

    private function seedEmployeePendingLiquidation(Carbon $disbursedAt, Carbon $dueDate, Carbon $submittedAt): void
    {
        $employee = User::where('email', 'employee@example.com')->first();
        if (! $employee) {
            return;
        }

        ExpenseCategory::ensureDefaults();
        $category = ExpenseCategory::where('name', 'Meals')->first() ?? ExpenseCategory::first();
        $categoryId = $category ? $category->id : 1;

        DB::transaction(function () use ($employee, $disbursedAt, $dueDate, $submittedAt, $categoryId): void {
            $advance = CashAdvance::where('user_id', $employee->id)
                ->where('purpose', 'Settlement Ready — Field Operations (employee@example.com)')
                ->first();

            if (! $advance) {
                $advance = CashAdvance::create([
                    'user_id' => $employee->id,
                    'purpose' => 'Settlement Ready — Field Operations (employee@example.com)',
                    'amount' => 5000.00,
                    'outstanding_balance' => 5000.00,
                    'expected_disbursement_date' => $disbursedAt,
                    'expected_liquidation_date' => $dueDate,
                    'status' => 'under-review',
                    'signature' => 'SEEDED-SIGNATURE',
                    'acknowledged_at' => $disbursedAt,
                    'submitted_at' => $submittedAt,
                ]);
            } else {
                $advance->update([
                    'status' => 'under-review',
                    'outstanding_balance' => $advance->amount,
                    'acknowledged_at' => $advance->acknowledged_at ?? $disbursedAt,
                ]);
            }

            CashAdvanceDisbursement::updateOrCreate(
                ['cash_advance_id' => $advance->id],
                [
                    'disbursed_by_id' => $employee->id,
                    'disbursement_date' => $disbursedAt,
                    'channel' => 'bank-transfer',
                    'reference_number' => "SEED-SETTLE-{$advance->id}",
                ]
            );

            $amount = (float) $advance->amount;
            $receipt = Receipt::where('invoice_number', 'INV-SEED-SETTLE-01')->first();
            if (! $receipt) {
                $path = 'receipts/mock_receipt.png';
                $hash = hash('sha256', implode('|', [$path, $employee->id, 'Field Operations Supply', $amount]));
                $receipt = Receipt::create([
                    'uploaded_by' => $employee->id,
                    'file_path' => [$path],
                    'file_hash' => [$hash],
                    'file_type' => ['png'],
                    'file_size_bytes' => [125000],
                    'vendor_name' => 'Field Operations Supply',
                    'transaction_date' => $disbursedAt->toDateString(),
                    'total_amount' => $amount,
                    'vat_amount' => round($amount * 0.12 / 1.12, 2),
                    'tin' => '123-456-789-000',
                    'invoice_number' => 'INV-SEED-SETTLE-01',
                    'vat_classification' => 'vat',
                    'currency' => 'PHP',
                    'location' => 'Metro Manila',
                    'ocr_confidence_score' => 95.00,
                    'ocr_flagged' => false,
                    'is_archived' => false,
                    'expense_category_id' => $categoryId,
                    'status' => 'approved',
                ]);

                ReceiptItem::create([
                    'receipt_id' => $receipt->id,
                    'name' => 'Field Operations Supplies & Meals',
                    'quantity' => 1,
                    'price' => $amount,
                ]);
            }

            $liquidation = Liquidation::updateOrCreate(
                ['cash_advance_id' => $advance->id],
                [
                    'user_id' => $employee->id,
                    'status' => 'pending',
                    'reimbursement_ids' => [$receipt->id],
                    'total_expense_amount' => $amount,
                    'outstanding_balance' => $amount,
                    'shortfall_explanation' => null,
                    'admin_note' => null,
                ]
            );

            AuditLogService::log(
                actorId: $employee->id,
                actorRole: (string) ($employee->role ?? 'employee'),
                actionType: 'SEED_LIQUIDATION_SETTLEMENT_READY',
                entityType: 'liquidation',
                entityId: $liquidation->id,
                beforeState: null,
                afterState: $liquidation->toArray()
            );
        });
    }
}
