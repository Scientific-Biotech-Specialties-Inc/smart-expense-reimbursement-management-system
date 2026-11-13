<?php

namespace App\Modules\CashAdvances\Database\Seeders;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceApprovalAction;
use App\Modules\CashAdvances\Models\CashAdvanceDisbursement;
use App\Modules\CashAdvances\Models\CashAdvanceStatusHistory;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Liquidations\Models\PenaltyRecord;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\ReceiptItem;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

class OverdueCashAdvanceSeeder extends Seeder
{
    public const EMPLOYEE_EMAIL = 'employee@example.com';
    public const ADMIN_EMAIL = 'sum@sbsi.com';

    public function run(): void
    {
        $employee = User::firstOrCreate(
            ['email' => self::EMPLOYEE_EMAIL],
            [
                'name' => 'General Employee',
                'role' => 'employee',
                'department' => 'Operations',
            ]
        );

        $admin = User::firstOrCreate(
            ['email' => self::ADMIN_EMAIL],
            [
                'name' => 'summer love',
                'role' => 'admin',
                'department' => 'Accounting',
            ]
        );

        ExpenseCategory::ensureDefaults();
        $category = ExpenseCategory::where('name', 'Meals')->first() ?? ExpenseCategory::first();
        $categoryId = $category ? $category->id : 1;

        // 1. Employee Overdue Cash Advance with Overpayment (>6 steps, 2 rows)
        $this->seedOverdueAdvanceWithOverpayment(
            user: $employee,
            approver: $admin,
            purpose: 'Regional Client Onsite & Setup — Overdue with Overpayment',
            advanceAmount: 10000.00,
            expenseAmount: 12500.00, // 2500 overpayment
            overdueDays: 5,
            reference: 'SEED-OVD-EMP-001',
            invoiceNumber: 'INV-OVD-EMP-001',
            categoryId: $categoryId
        );

        // 2. Admin Overdue Cash Advance with Overpayment (>6 steps, 2 rows)
        $this->seedOverdueAdvanceWithOverpayment(
            user: $admin,
            approver: $admin,
            purpose: 'Accounting Summit Travel & Venue — Overdue with Overpayment',
            advanceAmount: 15000.00,
            expenseAmount: 18000.00, // 3000 overpayment
            overdueDays: 4,
            reference: 'SEED-OVD-ADM-001',
            invoiceNumber: 'INV-OVD-ADM-001',
            categoryId: $categoryId
        );

        // 3. Employee Standard Overdue Advance (6 steps)
        $this->seedStandardOverdueAdvance(
            user: $employee,
            approver: $admin,
            purpose: 'Equipment Calibration & Maintenance — Overdue Pending Liquidation',
            advanceAmount: 5000.00,
            overdueDays: 3,
            reference: 'SEED-OVD-EMP-002'
        );

        $this->command?->info('Successfully seeded overdue cash advances with overpayment for both employee and admin.');
    }

    private function seedOverdueAdvanceWithOverpayment(
        User $user,
        User $approver,
        string $purpose,
        float $advanceAmount,
        float $expenseAmount,
        int $overdueDays,
        string $reference,
        string $invoiceNumber,
        int $categoryId
    ): void {
        $today = Carbon::today();
        $dueDate = $today->copy()->subDays($overdueDays);
        $disbursedAt = $dueDate->copy()->subDays(10);
        $approvedAt = $disbursedAt->copy()->subDays(2);
        $submittedAt = $approvedAt->copy()->subDays(2);

        $advance = CashAdvance::where('user_id', $user->id)
            ->where('purpose', $purpose)
            ->first();

        if (!$advance) {
            $advance = CashAdvance::create([
                'user_id' => $user->id,
                'purpose' => $purpose,
                'amount' => $advanceAmount,
                'outstanding_balance' => $advanceAmount,
                'expected_disbursement_date' => $disbursedAt,
                'expected_liquidation_date' => $dueDate,
                'status' => 'overdue',
                'signature' => 'SEEDED-SIGNATURE-' . $user->id,
                'acknowledged_at' => $disbursedAt->copy()->addDay(),
            ]);

            $advance->forceFill([
                'created_at' => $submittedAt,
                'submitted_at' => $submittedAt,
            ])->save();
        } else {
            $advance->forceFill([
                'amount' => $advanceAmount,
                'outstanding_balance' => $advanceAmount,
                'expected_disbursement_date' => $disbursedAt,
                'expected_liquidation_date' => $dueDate,
                'status' => 'overdue',
                'acknowledged_at' => $disbursedAt->copy()->addDay(),
            ])->save();
        }

        // Approval Action
        CashAdvanceApprovalAction::updateOrCreate(
            ['cash_advance_id' => $advance->id],
            [
                'approver_id' => $approver->id,
                'action' => 'approved',
                'comment' => 'Approved for client travel.',
                'actioned_at' => $approvedAt,
            ]
        );

        // Disbursement
        CashAdvanceDisbursement::updateOrCreate(
            ['cash_advance_id' => $advance->id],
            [
                'disbursed_by_id' => $approver->id,
                'disbursement_date' => $disbursedAt,
                'channel' => 'bank-transfer',
                'reference_number' => $reference,
            ]
        );

        // Status history
        $advance->statusHistory()->delete();
        $transitions = [
            ['from' => null, 'to' => 'pending', 'at' => $submittedAt, 'by' => $user->id],
            ['from' => 'pending', 'to' => 'approved', 'at' => $approvedAt, 'by' => $approver->id],
            ['from' => 'approved', 'to' => 'disbursed', 'at' => $disbursedAt, 'by' => $approver->id],
            ['from' => 'disbursed', 'to' => 'signed', 'at' => $disbursedAt->copy()->addDay(), 'by' => $user->id],
            ['from' => 'signed', 'to' => 'overdue', 'at' => $dueDate->copy()->addDay(), 'by' => $approver->id],
        ];

        foreach ($transitions as $t) {
            CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => $t['from'],
                'to_status' => $t['to'],
                'changed_by' => $t['by'],
                'changed_at' => $t['at'],
            ]);
        }

        // Penalty record
        PenaltyRecord::where('cash_advance_id', $advance->id)->delete();
        PenaltyRecord::create([
            'cash_advance_id' => $advance->id,
            'days_overdue' => $overdueDays,
            'penalty_amount' => $overdueDays * 50.00,
        ]);

        // Seed 3 real receipts (receipt 1.jpg, receipt 2.jpg, receipt 3.jpg) for this liquidation
        $realReceipts = $this->seedRealReceiptsForLiquidation(
            $user,
            $disbursedAt,
            $categoryId,
            $expenseAmount,
            $invoiceNumber
        );

        $receiptIds = array_map(fn ($r) => $r->id, $realReceipts);

        // Liquidation pointing to advance with excess amount and real receipts
        $liquidation = Liquidation::where('cash_advance_id', $advance->id)->first();
        if ($liquidation) {
            $liquidation->update([
                'status' => 'pending',
                'reimbursement_ids' => $receiptIds,
                'total_expense_amount' => $expenseAmount,
                'outstanding_balance' => $advanceAmount,
            ]);
        } else {
            $liquidation = Liquidation::create([
                'cash_advance_id' => $advance->id,
                'user_id' => $user->id,
                'status' => 'pending',
                'reimbursement_ids' => $receiptIds,
                'total_expense_amount' => $expenseAmount,
                'outstanding_balance' => $advanceAmount,
                'shortfall_explanation' => null,
                'admin_note' => null,
            ]);
        }

        AuditLogService::log(
            actorId: $user->id,
            actorRole: (string) ($user->role ?? 'admin'),
            actionType: 'SEED_OVERDUE_LIQUIDATION',
            entityType: 'liquidation',
            entityId: $liquidation->id,
            beforeState: null,
            afterState: $liquidation->fresh()->toArray()
        );
    }

    private function seedStandardOverdueAdvance(
        User $user,
        User $approver,
        string $purpose,
        float $advanceAmount,
        int $overdueDays,
        string $reference
    ): void {
        $today = Carbon::today();
        $dueDate = $today->copy()->subDays($overdueDays);
        $disbursedAt = $dueDate->copy()->subDays(10);
        $approvedAt = $disbursedAt->copy()->subDays(2);
        $submittedAt = $approvedAt->copy()->subDays(2);

        $advance = CashAdvance::where('user_id', $user->id)
            ->where('purpose', $purpose)
            ->first();

        if (!$advance) {
            $advance = CashAdvance::create([
                'user_id' => $user->id,
                'purpose' => $purpose,
                'amount' => $advanceAmount,
                'outstanding_balance' => $advanceAmount,
                'expected_disbursement_date' => $disbursedAt,
                'expected_liquidation_date' => $dueDate,
                'status' => 'overdue',
                'signature' => 'SEEDED-SIGNATURE-' . $user->id,
                'acknowledged_at' => $disbursedAt->copy()->addDay(),
            ]);

            $advance->forceFill([
                'created_at' => $submittedAt,
                'submitted_at' => $submittedAt,
            ])->save();
        } else {
            $advance->forceFill([
                'amount' => $advanceAmount,
                'outstanding_balance' => $advanceAmount,
                'expected_disbursement_date' => $disbursedAt,
                'expected_liquidation_date' => $dueDate,
                'status' => 'overdue',
                'acknowledged_at' => $disbursedAt->copy()->addDay(),
            ])->save();
        }

        CashAdvanceApprovalAction::updateOrCreate(
            ['cash_advance_id' => $advance->id],
            [
                'approver_id' => $approver->id,
                'action' => 'approved',
                'comment' => 'Approved for maintenance.',
                'actioned_at' => $approvedAt,
            ]
        );

        CashAdvanceDisbursement::updateOrCreate(
            ['cash_advance_id' => $advance->id],
            [
                'disbursed_by_id' => $approver->id,
                'disbursement_date' => $disbursedAt,
                'channel' => 'bank-transfer',
                'reference_number' => $reference,
            ]
        );

        $advance->statusHistory()->delete();
        $transitions = [
            ['from' => null, 'to' => 'pending', 'at' => $submittedAt, 'by' => $user->id],
            ['from' => 'pending', 'to' => 'approved', 'at' => $approvedAt, 'by' => $approver->id],
            ['from' => 'approved', 'to' => 'disbursed', 'at' => $disbursedAt, 'by' => $approver->id],
            ['from' => 'disbursed', 'to' => 'signed', 'at' => $disbursedAt->copy()->addDay(), 'by' => $user->id],
            ['from' => 'signed', 'to' => 'overdue', 'at' => $dueDate->copy()->addDay(), 'by' => $approver->id],
        ];

        foreach ($transitions as $t) {
            CashAdvanceStatusHistory::create([
                'cash_advance_id' => $advance->id,
                'from_status' => $t['from'],
                'to_status' => $t['to'],
                'changed_by' => $t['by'],
                'changed_at' => $t['at'],
            ]);
        }

        PenaltyRecord::where('cash_advance_id', $advance->id)->delete();
        PenaltyRecord::create([
            'cash_advance_id' => $advance->id,
            'days_overdue' => $overdueDays,
            'penalty_amount' => $overdueDays * 50.00,
        ]);
    }

    /**
     * Seeds 3 real receipts matching docs/receipts/receipt 1.jpg, receipt 2.jpg, and receipt 3.jpg
     *
     * @return array<int, Receipt>
     */
    private function seedRealReceiptsForLiquidation(
        User $user,
        Carbon $disbursedAt,
        int $categoryId,
        float $targetTotalAmount,
        string $invoicePrefix
    ): array {
        $this->ensureReceiptFilesUploaded();

        // 3 Real receipts:
        // Receipt 3: Yamachan Japanese Restaurant (Exact from receipt 3.jpg: PHP 1,422.61, VAT: 139.93, Invoice: 9067)
        // Receipt 2: Jollibee Entrek (B) Sdn. Bhd. (from receipt 2.jpg: Chk No 20052)
        // Receipt 1: Jollibee Las Vegas (from receipt 1.jpg: Invoice 340)
        // Amounts are balanced so that sum(receipts) == $targetTotalAmount exactly.

        $r3Amount = 1422.61;
        $r3Vat = 139.93;
        $remainder = max(0, $targetTotalAmount - $r3Amount);

        // Split remainder between Receipt 1 (approx 78%) and Receipt 2 (approx 22%)
        $r1Amount = round($remainder * 0.784, 2);
        $r2Amount = round($targetTotalAmount - $r3Amount - $r1Amount, 2);

        $definitions = [
            [
                'invoice_number' => "{$invoicePrefix}-R1-340",
                'vendor_name' => 'Jollibee Las Vegas',
                'file_path' => 'receipts/receipt_1.jpg',
                'file_type' => 'jpeg',
                'file_size' => 103956,
                'tin' => '123-456-789-001',
                'location' => '3890 S Maryland Parkway Suite 137, Las Vegas NV',
                'transaction_date' => $disbursedAt->copy()->addDays(2)->toDateString(),
                'total_amount' => $r1Amount,
                'vat_amount' => round($r1Amount * 0.12 / 1.12, 2),
                'items' => [
                    [
                        'name' => 'Family bundle - 10pcs Chickenjoy bucket + 3 large sides (Summit Catering)',
                        'quantity' => 10,
                        'price' => round($r1Amount / 10, 2),
                    ],
                ],
            ],
            [
                'invoice_number' => "{$invoicePrefix}-R2-20052",
                'vendor_name' => 'Jollibee (Entrek (B) Sdn. Bhd.)',
                'file_path' => 'receipts/receipt_2.jpg',
                'file_type' => 'jpeg',
                'file_size' => 65146,
                'tin' => '123-456-789-002',
                'location' => 'Jollibee Yayasan Complex B06',
                'transaction_date' => $disbursedAt->copy()->addDays(3)->toDateString(),
                'total_amount' => $r2Amount,
                'vat_amount' => round($r2Amount * 0.12 / 1.12, 2),
                'items' => [
                    [
                        'name' => 'C1 Chickenjoy with Rice & Drink',
                        'quantity' => 12,
                        'price' => round(($r2Amount * 0.8) / 12, 2),
                    ],
                    [
                        'name' => 'VM SDR Beverage',
                        'quantity' => 12,
                        'price' => round(($r2Amount * 0.2) / 12, 2),
                    ],
                ],
            ],
            [
                'invoice_number' => "{$invoicePrefix}-R3-9067",
                'vendor_name' => 'Yamachan Japanese Restaurant',
                'file_path' => 'receipts/receipt_3.jpg',
                'file_type' => 'jpeg',
                'file_size' => 204017,
                'tin' => '303-124-202-000',
                'location' => 'Unit 6-1 Makati Cinema Square, Pio Del Pilar, Makati City',
                'transaction_date' => $disbursedAt->copy()->addDays(4)->toDateString(),
                'total_amount' => $r3Amount,
                'vat_amount' => $r3Vat,
                'items' => [
                    [
                        'name' => 'Meals (Sold to: Scientific Biotech Specialties, Inc.)',
                        'quantity' => 1,
                        'price' => 1166.07,
                    ],
                    [
                        'name' => 'Service Charge (SC)',
                        'quantity' => 1,
                        'price' => 116.61,
                    ],
                ],
            ],
        ];

        $receipts = [];
        foreach ($definitions as $def) {
            $hash = hash('sha256', implode('|', [$def['file_path'], $user->id, $def['invoice_number'], $def['total_amount']]));

            $attributes = [
                'uploaded_by' => $user->id,
                'file_path' => [$def['file_path']],
                'file_hash' => [$hash],
                'file_type' => [$def['file_type']],
                'file_size_bytes' => [$def['file_size']],
                'vendor_name' => $def['vendor_name'],
                'transaction_date' => $def['transaction_date'],
                'total_amount' => $def['total_amount'],
                'vat_amount' => $def['vat_amount'],
                'tin' => $def['tin'],
                'invoice_number' => $def['invoice_number'],
                'vat_classification' => 'vat',
                'currency' => 'PHP',
                'location' => $def['location'],
                'ocr_confidence_score' => 98.50,
                'ocr_flagged' => false,
                'is_archived' => false,
                'expense_category_id' => $categoryId,
                'status' => 'approved',
            ];

            $receipt = Receipt::where('invoice_number', $def['invoice_number'])->first();
            if ($receipt) {
                $receipt->update($attributes);
            } else {
                $receipt = Receipt::create($attributes);
            }

            // Sync items
            $receipt->items()->delete();
            foreach ($def['items'] as $item) {
                ReceiptItem::create([
                    'receipt_id' => $receipt->id,
                    'name' => $item['name'],
                    'quantity' => $item['quantity'],
                    'price' => $item['price'],
                ]);
            }

            AuditLogService::log(
                actorId: $user->id,
                actorRole: (string) ($user->role ?? 'admin'),
                actionType: 'SEED_LIQUIDATION_RECEIPT',
                entityType: 'receipt',
                entityId: $receipt->id,
                beforeState: null,
                afterState: $receipt->fresh()->load('items')->toArray()
            );

            $receipts[] = $receipt;
        }

        return $receipts;
    }

    private function ensureReceiptFilesUploaded(): void
    {
        $receiptSourceFiles = [
            'receipts/receipt_1.jpg' => base_path('../../docs/receipts/receipt 1.jpg'),
            'receipts/receipt_2.jpg' => base_path('../../docs/receipts/receipt 2.jpg'),
            'receipts/receipt_3.jpg' => base_path('../../docs/receipts/receipt 3.jpg'),
        ];

        foreach ($receiptSourceFiles as $storagePath => $sourcePath) {
            if (file_exists($sourcePath)) {
                $bytes = file_get_contents($sourcePath);
                try {
                    if (! Storage::disk('supabase')->exists($storagePath)) {
                        Storage::disk('supabase')->put($storagePath, $bytes);
                    }
                } catch (\Throwable $e) {
                    // Suppress remote storage exceptions during tests/offline
                }
                try {
                    if (! Storage::disk('public')->exists($storagePath)) {
                        Storage::disk('public')->put($storagePath, $bytes);
                    }
                } catch (\Throwable $e) {
                }
            }
        }
    }
}
