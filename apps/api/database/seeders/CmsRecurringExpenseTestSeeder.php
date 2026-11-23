<?php

namespace Database\Seeders;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class CmsRecurringExpenseTestSeeder extends Seeder
{
    public function run(): void
    {
        $employee = User::where('email', 'employee@example.com')->first()
            ?? User::where('role', 'employee')->firstOrFail();

        $accounting = User::where('email', 'sum@sbsi.com')->first()
            ?? User::where('department', 'Accounting')->first();

        $category = ExpenseCategory::firstOrCreate(['name' => 'Field Service']);

        $dates = [
            now()->subMonths(5)->format('Y-m-d'),
            now()->subMonths(4)->format('Y-m-d'),
            now()->subMonths(2)->format('Y-m-d'),
            now()->subMonth()->format('Y-m-d'),
        ];

        DB::transaction(function () use ($employee, $accounting, $category, $dates) {
            foreach ($dates as $idx => $txDate) {
                $num = $idx + 1;
                $hash = hash('sha256', "cms-recurring-seed-{$num}");

                $existingReceipt = Receipt::where('file_hash', $hash)->first();
                if ($existingReceipt) {
                    continue;
                }

                $receipt = Receipt::create([
                    'uploaded_by'           => $employee->id,
                    'file_path'             => "seed/metro-calibration-{$num}.png",
                    'file_hash'             => $hash,
                    'file_type'             => 'png',
                    'file_size_bytes'       => 2048,
                    'vendor_name'           => 'Metro Calibration Services',
                    'transaction_date'      => $txDate,
                    'total_amount'          => 20000.00,
                    'subtotal'              => 17857.14,
                    'vat_amount'            => 2142.86,
                    'tin'                   => '111-222-333-000',
                    'invoice_number'        => sprintf('INV-MCS-2026-%03d', $num),
                    'vat_classification'    => 'vat',
                    'currency'              => 'PHP',
                    'expense_category_id'   => $category->id,
                    'event_type'            => 'Calibration',
                    'ocr_confidence_score'  => 0.96,
                    'ocr_flagged'           => false,
                    'status'                => 'approved',
                    'vendor_matched'        => false,
                    'vendor_accredited'     => false,
                    'vendor_audit_required' => true,
                    'vendor_status_tag'     => '[Unverified Vendor — Secondary Accounting Audit Required]',
                ]);

                $reimbursement = Reimbursement::create([
                    'user_id'             => $employee->id,
                    'receipt_id'          => $receipt->id,
                    'description'         => "Quarterly instrument calibration visit #{$num}",
                    'expense_category_id' => $category->id,
                    'event_type'          => 'Calibration',
                    'amount'              => 20000.00,
                    'date'                => $txDate,
                    'status'              => 'approved',
                    'submitted_by_name'   => $employee->name,
                    'approved_by'         => $accounting?->name ?? 'Maria Santos',
                    'approved_at'         => now(),
                ]);

                $reimbursement->receipts()->attach($receipt->id);

                AuditLogService::log(
                    actorId: $employee->id,
                    actorRole: $employee->role ?? 'employee',
                    actionType: 'CLAIM_SUBMITTED',
                    entityType: 'reimbursement',
                    entityId: $reimbursement->id,
                    beforeState: null,
                    afterState: $reimbursement->toArray(),
                    ipAddress: '127.0.0.1'
                );
            }
        });
    }
}
