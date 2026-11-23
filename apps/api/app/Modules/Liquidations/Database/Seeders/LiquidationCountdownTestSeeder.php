<?php

namespace App\Modules\Liquidations\Database\Seeders;

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

/**
 * Seeds liquidation instances on account "summer love" (sum@sbsi.com)
 * with due dates set to 1 month from now and 10 days from now,
 * specifically configured to test the countdown progress tracker (DaysLeftBadge).
 *
 * Run explicitly:
 *   php artisan db:seed --class="App\Modules\Liquidations\Database\Seeders\LiquidationCountdownTestSeeder"
 */
class LiquidationCountdownTestSeeder extends Seeder
{
    public const TARGET_EMAIL = 'sum@sbsi.com';

    public const PURPOSE_10_DAYS = 'Liquidation Countdown QA — 10 Days Remaining';
    public const PURPOSE_1_MONTH = 'Liquidation Countdown QA — 1 Month Remaining';

    /**
     * @var array<int, array{
     *     purpose: string,
     *     amount: float,
     *     reference: string,
     *     due_type: string,
     *     days_ago: int,
     *     vendor: string,
     *     invoice_number: string,
     *     items: array<int, array{0: string, 1: int, 2: float}>
     * }>
     */
    private const CASE_DEFINITIONS = [
        [
            'purpose' => self::PURPOSE_10_DAYS,
            'amount' => 4500.00,
            'reference' => 'SEED-COUNTDOWN-10D',
            'due_type' => '10_days',
            'days_ago' => 10,
            'vendor' => 'National Book Store Supplies',
            'invoice_number' => 'INV-SEED-CD-10D',
            'items' => [
                ['Office Paper & Folders', 5, 500.00],
                ['Printer Toner Cartridges', 1, 2000.00],
            ],
        ],
        [
            'purpose' => self::PURPOSE_1_MONTH,
            'amount' => 8000.00,
            'reference' => 'SEED-COUNTDOWN-1M',
            'due_type' => '1_month',
            'days_ago' => 10,
            'vendor' => 'Grand Horizon Conference Hotel',
            'invoice_number' => 'INV-SEED-CD-1M',
            'items' => [
                ['Executive Meeting Venue Package', 1, 6000.00],
                ['Client Catering and Luncheon', 1, 2000.00],
            ],
        ],
    ];

    public function run(): void
    {
        $user = User::where('email', self::TARGET_EMAIL)->first();

        if (! $user) {
            $user = User::create([
                'name' => 'summer love',
                'email' => self::TARGET_EMAIL,
                'role' => 'admin',
                'grade' => 'L5',
                'department' => 'Accounting',
            ]);
            $this->info("Provisioned user {$user->name} ({$user->email}).");
        }

        ExpenseCategory::ensureDefaults();
        $category = ExpenseCategory::where('name', 'Meals')->first() ?? ExpenseCategory::first();
        $categoryId = $category ? $category->id : 1;

        foreach (self::CASE_DEFINITIONS as $definition) {
            $this->seedLiquidationCase($user, $definition, $categoryId);
        }
    }

    /**
     * @param array{
     *     purpose: string,
     *     amount: float,
     *     reference: string,
     *     due_type: string,
     *     days_ago: int,
     *     vendor: string,
     *     invoice_number: string,
     *     items: array<int, array{0: string, 1: int, 2: float}>
     * } $definition
     */
    private function seedLiquidationCase(User $user, array $definition, int $categoryId): void
    {
        $dueDate = $definition['due_type'] === '1_month'
            ? Carbon::today()->addMonth()
            : Carbon::today()->addDays(10);

        $disbursedAt = Carbon::today()->subDays($definition['days_ago']);
        $submittedAt = Carbon::now()->subDays($definition['days_ago'] + 4);

        $advance = CashAdvance::where('user_id', $user->id)
            ->where('purpose', $definition['purpose'])
            ->first();

        if (! $advance) {
            $advance = CashAdvance::create([
                'user_id' => $user->id,
                'purpose' => $definition['purpose'],
                'amount' => $definition['amount'],
                'outstanding_balance' => $definition['amount'],
                'expected_disbursement_date' => $disbursedAt,
                'expected_liquidation_date' => $dueDate,
                'status' => 'under-review',
                'signature' => 'SEEDED-SIGNATURE',
                'acknowledged_at' => $disbursedAt,
            ]);

            $advance->forceFill([
                'created_at' => $disbursedAt->copy()->subDays(4),
                'submitted_at' => $submittedAt,
            ])->save();

            $this->seedStatusHistory($advance, $user, $submittedAt, $disbursedAt);

            CashAdvanceDisbursement::create([
                'cash_advance_id' => $advance->id,
                'disbursed_by_id' => $user->id,
                'disbursement_date' => $disbursedAt,
                'channel' => 'bank-transfer',
                'reference_number' => $definition['reference'],
            ]);
        } else {
            $advance->forceFill([
                'amount' => $definition['amount'],
                'outstanding_balance' => $definition['amount'],
                'expected_disbursement_date' => $disbursedAt,
                'expected_liquidation_date' => $dueDate,
                'status' => 'under-review',
                'acknowledged_at' => $disbursedAt,
                'created_at' => $disbursedAt->copy()->subDays(4),
                'submitted_at' => $submittedAt,
            ])->save();

            CashAdvanceDisbursement::updateOrCreate(
                ['cash_advance_id' => $advance->id],
                [
                    'disbursed_by_id' => $user->id,
                    'disbursement_date' => $disbursedAt,
                    'channel' => 'bank-transfer',
                    'reference_number' => $definition['reference'],
                ]
            );
        }

        // Ensure receipt and items exist
        $receipt = Receipt::where('invoice_number', $definition['invoice_number'])->first();
        if (! $receipt) {
            $path = 'receipts/mock_receipt.png';
            $hash = hash('sha256', implode('|', [$path, $user->id, $definition['vendor'], $definition['amount']]));
            $receipt = Receipt::create([
                'uploaded_by' => $user->id,
                'file_path' => [$path],
                'file_hash' => [$hash],
                'file_type' => ['png'],
                'file_size_bytes' => [125000],
                'vendor_name' => $definition['vendor'],
                'transaction_date' => $disbursedAt->toDateString(),
                'total_amount' => $definition['amount'],
                'vat_amount' => round($definition['amount'] * 0.12 / 1.12, 2),
                'tin' => '123-456-789-000',
                'invoice_number' => $definition['invoice_number'],
                'vat_classification' => 'vat',
                'currency' => 'PHP',
                'location' => 'Metro Manila',
                'ocr_confidence_score' => 95.00,
                'ocr_flagged' => false,
                'is_archived' => false,
                'expense_category_id' => $categoryId,
                'status' => 'approved',
            ]);

            foreach ($definition['items'] as $item) {
                ReceiptItem::create([
                    'receipt_id' => $receipt->id,
                    'name' => $item[0],
                    'quantity' => $item[1],
                    'price' => $item[2],
                ]);
            }
        }

        // Ensure liquidation exists and points to this advance
        $liquidation = Liquidation::where('cash_advance_id', $advance->id)->first();
        if ($liquidation) {
            $liquidation->update([
                'status' => 'pending',
                'reimbursement_ids' => [$receipt->id],
                'total_expense_amount' => $definition['amount'],
                'outstanding_balance' => $definition['amount'],
            ]);
        } else {
            $liquidation = Liquidation::create([
                'cash_advance_id' => $advance->id,
                'user_id' => $user->id,
                'status' => 'pending',
                'reimbursement_ids' => [$receipt->id],
                'total_expense_amount' => $definition['amount'],
                'outstanding_balance' => $definition['amount'],
                'shortfall_explanation' => null,
                'admin_note' => null,
            ]);
        }

        AuditLogService::log(
            actorId: $user->id,
            actorRole: (string) ($user->role ?? 'admin'),
            actionType: 'SEED_LIQUIDATION_COUNTDOWN',
            entityType: 'liquidation',
            entityId: $liquidation->id,
            beforeState: null,
            afterState: $liquidation->toArray()
        );

        $this->info(
            "Seeded liquidation #{$liquidation->id} (Advance #{$advance->id}) for {$user->name} ({$user->email}) with due date {$dueDate->toDateString()}."
        );
    }

    private function seedStatusHistory(
        CashAdvance $advance,
        User $user,
        Carbon $submittedAt,
        Carbon $disbursedAt
    ): void {
        $transitions = [
            ['from' => null, 'to' => 'pending', 'at' => $submittedAt->copy()],
            ['from' => 'pending', 'to' => 'approved', 'at' => $submittedAt->copy()->addDay()],
            ['from' => 'approved', 'to' => 'disbursed', 'at' => $disbursedAt->copy()],
            ['from' => 'disbursed', 'to' => 'signed', 'at' => $disbursedAt->copy()],
            ['from' => 'signed', 'to' => 'under-review', 'at' => $disbursedAt->copy()->addDays(2)],
        ];

        foreach ($transitions as $transition) {
            $advance->statusHistory()->create([
                'from_status' => $transition['from'],
                'to_status' => $transition['to'],
                'changed_by' => $user->id,
                'changed_at' => $transition['at'],
            ]);
        }
    }

    private function info(string $message): void
    {
        $this->command?->info($message);
    }
}
