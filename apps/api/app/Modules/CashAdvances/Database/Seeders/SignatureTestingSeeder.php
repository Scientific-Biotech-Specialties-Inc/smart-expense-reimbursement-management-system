<?php

namespace App\Modules\CashAdvances\Database\Seeders;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Payout;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * Seeds test cases for signature workflows across SERMS:
 *   1. Populates official demo signatures on employee@example.com and sum@sbsi.com.
 *   2. Cash Advance in 'disbursed' status (ready for employee acknowledgement signature).
 *   3. Cash Advance in 'signed' status (ready for liquidation submission).
 *   4. Reimbursement in 'approved' status (ready for admin payout grant with granter signature).
 *   5. Reimbursement in 'granted' status with Payout (ready for employee payout acknowledgement signature).
 *
 * Run explicitly:
 *   php artisan db:seed --class="App\Modules\CashAdvances\Database\Seeders\SignatureTestingSeeder"
 */
class SignatureTestingSeeder extends Seeder
{
    public const EMPLOYEE_EMAIL = 'employee@example.com';
    public const ADMIN_EMAIL = 'sum@sbsi.com';

    public const DEMO_SIGNATURE_EMPLOYEE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAB4CAYAAADfRGj6AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAEt0lEQVR4nO3dTXLjNhAGUCY15/DeZ/D55wzZ5yLOIqWKzJASJRJAd+O9lWtqLAIg8bEF/nhZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDw/hjdgCw+Pr++bz///ddv4wY09+foBmRwH84AvQjoNwhsoAcB/YQwBkYR0ABBudj1wNaFQRcLgV5U0ABBqQB3PKqUVdFADypogKAE9AYVMhCBgH7DfWi7DQ9oRUCvqJ6BKAQ0QFAqxDuvVs+qbaAlFTTwkOss4/wa3YAoVMPw0/2cuP1sbvSlgj7B3RxUtXc8f3x+fTvW+xHQi+oZ7q0DeGtOCOo+hNFyPqAFPBUcDeat33XctzF9BS1c61PpPXcknG///kpwc870AU1tt+DwlXzf0XBe/5+tl4gZ42tNXTFeWT2rxOPxdfyxd4L56Ged/Tz+pYKmnHUlp9L7vyvDee/3jfN5057hrq54VdAxPAseld714fzs81ttZwbTDliLQI0Y0h+fX99R2tLa0eCZNaRbB/Oz7fXYZjVTDlarII0W0NHa09I7fZ0pQHqH86Nt995+Ztagi1pPisprge+eiPbuRLiybRGMDOfb9lwHeM90Z7HWVWWEqnXdhtETtKWrxrtilRdxv1uffs10g1I9oPe2H3GyntGqP1WCOvr+FtTHTLXE0SM8o75AqdJX+ZbhU+EpuejhvCyeSDwq3I5rqVd1O6qKPrrd0VX+GT3DJ1s1nSGY92Qb616mGYCeoTQiAGf4azARTny9t31UhjYeIah/mqbjvSd3hhNCpkk9+oQSOTgy7ccjrE//Z4oOZ6hoR20nw+QeHc57bbmJcLfOyHa0Iqgnu0hYzRXBFfni4bN3aowQ5cJW9XBeFhcSl2WCCnrkBM92S1+kMMwQQKOq6Qxj00Kkby+9lO7cstQN6MqPq2cLoF7tzTYurcwU1CU7dTM6bLKGaJT3NmSadK1DQzj/NMv6dKnOrEWY7FmXIUYEQoT9dVaLoBbO+6oHdYlObIky2a9sx8hbBVtvM8r+usJVIS2Yj6u67JG+A3siTfgr2jLDWnqLzx/TGtUHpeWIs37K5S8za7aThqt1ftFqofQu68zrT4uLe3dmpdVmY7cixbQVz5MEmW55mxbZguhI9X0bGPCc+UOgChhtnbF49gR+nNFiETrU097QS2c2VJyiaOKiEF29snDiH3q6ciTcTOOC9tKHQiRJ3/Ft81V7FNPgplnSh0Q0QOg4vuaj7RVED328TnPX17nNWWWODKFWiXrOzzWYSycnzMm7CkT0FVkPNHsrUsLZzinxITJFGqP2pqpH1uqP3YLvamgg8gezsuy/ZBA1r5ABOknT8ZgW7c5Yx+eceELzlNBD1YxnJelVl9glNQBXTXcAJYleUBntXUycYIB1tIGdKXqOXv7gTZ+jW7ArIQy8EzKkKhUPQPsSbvEAVBduupT9QzMQgUNAAAAAEArLrIBYbz6Ny6vEPlmAw+qQCIjAoxxBDSlCDAqCVva04YAI7LIyw0jGIwVAUZkAmwu4Xe2wOQVAoxKrEFPRoBBHgJ6RYABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACT+wenE9wo2dR9ZgAAAABJRU5ErkJggg==';
    public const DEMO_SIGNATURE_ADMIN = self::DEMO_SIGNATURE_EMPLOYEE;

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

        // Ensure both users have profile signatures
        if ($employee->signature !== self::DEMO_SIGNATURE_EMPLOYEE) {
            $employee->signature = self::DEMO_SIGNATURE_EMPLOYEE;
            $employee->save();
            $this->info("Assigned demo profile signature to {$employee->email}.");
        }

        if ($admin->signature !== self::DEMO_SIGNATURE_ADMIN) {
            $admin->signature = self::DEMO_SIGNATURE_ADMIN;
            $admin->save();
            $this->info("Assigned demo profile signature to {$admin->email}.");
        }

        ExpenseCategory::ensureDefaults();
        $category = ExpenseCategory::first() ?? ExpenseCategory::create(['name' => 'Meals']);

        $this->seedDisbursedCashAdvance($employee, $admin);
        $this->seedSignedCashAdvance($employee, $admin);
        $this->seedApprovedReimbursement($employee, $admin, $category);
        $this->seedGrantedPayoutReimbursement($employee, $admin, $category);
    }

    /**
     * Cash Advance ready for Employee Signature Acknowledgement (disbursed status).
     */
    private function seedDisbursedCashAdvance(User $employee, User $admin): void
    {
        $purpose = 'Regional Field Equipment & Logistics — Disbursed (Ready for Signature)';
        $advance = CashAdvance::where('user_id', $employee->id)->where('purpose', $purpose)->first();

        if (! $advance) {
            $submittedAt = Carbon::now()->subDays(3);
            $disbursedAt = Carbon::now()->subDays(1);

            $advance = CashAdvance::create([
                'user_id' => $employee->id,
                'purpose' => $purpose,
                'amount' => 7500.00,
                'outstanding_balance' => 7500.00,
                'expected_disbursement_date' => $disbursedAt,
                'expected_liquidation_date' => Carbon::today()->addDays(12),
                'status' => 'disbursed',
                'signature' => null,
                'acknowledged_at' => null,
            ]);

            $advance->submitted_at = $submittedAt;
            $advance->save();

            $advance->disbursement()->create([
                'disbursed_by_id' => $admin->id,
                'disbursement_date' => $disbursedAt,
                'channel' => 'bank-transfer',
                'reference_number' => 'SEED-SIG-DISB-001',
            ]);

            $advance->statusHistory()->create([
                'from_status' => null,
                'to_status' => 'pending',
                'changed_by' => $employee->id,
                'changed_at' => $submittedAt,
            ]);

            $advance->statusHistory()->create([
                'from_status' => 'pending',
                'to_status' => 'approved',
                'changed_by' => $admin->id,
                'changed_at' => $disbursedAt->copy()->subDay(),
            ]);

            $advance->statusHistory()->create([
                'from_status' => 'approved',
                'to_status' => 'disbursed',
                'changed_by' => $admin->id,
                'changed_at' => $disbursedAt,
            ]);

            $this->info("Created Disbursed Cash Advance #{$advance->id} awaiting employee signature.");
        } else {
            $advance->forceFill([
                'status' => 'disbursed',
                'signature' => null,
                'acknowledged_at' => null,
            ])->save();
            $this->info("Reset Disbursed Cash Advance #{$advance->id} to awaiting signature.");
        }
    }

    /**
     * Cash Advance already signed & acknowledged, eligible for Liquidation testing.
     */
    private function seedSignedCashAdvance(User $employee, User $admin): void
    {
        $purpose = 'Quarterly Logistics & Client Outreach — Signed (Ready for Liquidation)';
        $advance = CashAdvance::where('user_id', $employee->id)->where('purpose', $purpose)->first();

        if (! $advance) {
            $submittedAt = Carbon::now()->subDays(6);
            $disbursedAt = Carbon::now()->subDays(4);
            $signedAt = Carbon::now()->subDays(3);

            $advance = CashAdvance::create([
                'user_id' => $employee->id,
                'purpose' => $purpose,
                'amount' => 5500.00,
                'outstanding_balance' => 5500.00,
                'expected_disbursement_date' => $disbursedAt,
                'expected_liquidation_date' => Carbon::today()->addDays(9),
                'status' => 'signed',
                'signature' => self::DEMO_SIGNATURE_EMPLOYEE,
                'acknowledged_at' => $signedAt,
            ]);

            $advance->submitted_at = $submittedAt;
            $advance->save();

            $advance->disbursement()->create([
                'disbursed_by_id' => $admin->id,
                'disbursement_date' => $disbursedAt,
                'channel' => 'bank-transfer',
                'reference_number' => 'SEED-SIG-SIGNED-002',
            ]);

            $this->info("Created Signed Cash Advance #{$advance->id} ready for liquidation testing.");
        } else {
            $advance->forceFill([
                'status' => 'signed',
                'signature' => self::DEMO_SIGNATURE_EMPLOYEE,
                'acknowledged_at' => Carbon::now()->subDays(2),
            ])->save();
            $this->info("Refreshed Signed Cash Advance #{$advance->id}.");
        }
    }

    /**
     * Reimbursement approved and ready for Admin Payout Grant (with granter signature).
     */
    private function seedApprovedReimbursement(User $employee, User $admin, ExpenseCategory $category): void
    {
        $description = 'Client Dinner & Project Briefing (Approved — Ready for Payout Grant)';
        $reimbursement = Reimbursement::where('user_id', $employee->id)->where('description', $description)->first();

        if (! $reimbursement) {
            $reimbursement = Reimbursement::create([
                'user_id' => $employee->id,
                'description' => $description,
                'user_comment' => 'Project kickoff dinner with client stakeholder.',
                'expense_category_id' => $category->id,
                'amount' => 3850.00,
                'date' => Carbon::today()->subDays(3),
                'status' => 'approved',
                'submitted_by_name' => $employee->name,
                'approved_by' => $admin->name,
                'approved_at' => Carbon::now()->subDays(1),
                'is_request' => true,
            ]);

            $this->info("Created Approved Reimbursement #{$reimbursement->id} ready for Admin Payout Grant.");
        } else {
            $reimbursement->forceFill([
                'status' => 'approved',
                'approved_by' => $admin->name,
                'approved_at' => Carbon::now()->subDays(1),
            ])->save();

            // Clear payout if any so it can be granted again
            if ($reimbursement->payout) {
                $reimbursement->payout->delete();
            }
            $this->info("Reset Approved Reimbursement #{$reimbursement->id}.");
        }
    }

    /**
     * Reimbursement granted and awaiting Employee Payout Acknowledgement Signature.
     */
    private function seedGrantedPayoutReimbursement(User $employee, User $admin, ExpenseCategory $category): void
    {
        $description = 'Field Site Internet & SIM Supplies (Granted — Ready for Employee Signature)';
        $reimbursement = Reimbursement::where('user_id', $employee->id)->where('description', $description)->first();

        if (! $reimbursement) {
            $reimbursement = Reimbursement::create([
                'user_id' => $employee->id,
                'description' => $description,
                'user_comment' => 'Purchased high-speed field backup modem and data packs.',
                'expense_category_id' => $category->id,
                'amount' => 2400.00,
                'date' => Carbon::today()->subDays(5),
                'status' => 'granted',
                'submitted_by_name' => $employee->name,
                'approved_by' => $admin->name,
                'approved_at' => Carbon::now()->subDays(3),
                'is_request' => true,
            ]);

            Payout::create([
                'reimbursement_id' => $reimbursement->id,
                'request_date' => Carbon::today()->subDays(5),
                'approved_at' => Carbon::now()->subDays(3),
                'granted_at' => Carbon::now()->subDays(1),
                'approved_by' => $admin->name,
                'granted_by' => $admin->name,
                'payout_method' => 'Cash',
                'amount' => 2400.00,
                'granter_signature' => self::DEMO_SIGNATURE_ADMIN,
                'employee_signature' => null,
                'acknowledged_at' => null,
            ]);

            $this->info("Created Granted Reimbursement #{$reimbursement->id} with Payout awaiting employee signature.");
        } else {
            $reimbursement->forceFill([
                'status' => 'granted',
                'approved_by' => $admin->name,
                'approved_at' => Carbon::now()->subDays(3),
            ])->save();

            Payout::updateOrCreate(
                ['reimbursement_id' => $reimbursement->id],
                [
                    'request_date' => Carbon::today()->subDays(5),
                    'approved_at' => Carbon::now()->subDays(3),
                    'granted_at' => Carbon::now()->subDays(1),
                    'approved_by' => $admin->name,
                    'granted_by' => $admin->name,
                    'payout_method' => 'Cash',
                    'amount' => 2400.00,
                    'granter_signature' => self::DEMO_SIGNATURE_ADMIN,
                    'employee_signature' => null,
                    'acknowledged_at' => null,
                ]
            );

            $this->info("Reset Granted Reimbursement #{$reimbursement->id} awaiting employee signature.");
        }
    }

    private function info(string $message): void
    {
        $this->command?->info($message);
    }
}
