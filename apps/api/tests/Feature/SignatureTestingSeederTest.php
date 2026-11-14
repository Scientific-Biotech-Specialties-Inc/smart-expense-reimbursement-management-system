<?php

namespace Tests\Feature;

use App\Modules\CashAdvances\Database\Seeders\SignatureTestingSeeder;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SignatureTestingSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_seeds_signatures_cash_advances_and_reimbursement_payout_test_records(): void
    {
        $this->seed(SignatureTestingSeeder::class);

        $employee = User::where('email', SignatureTestingSeeder::EMPLOYEE_EMAIL)->first();
        $admin = User::where('email', SignatureTestingSeeder::ADMIN_EMAIL)->first();

        $this->assertNotNull($employee);
        $this->assertNotNull($admin);

        // 1. Digital signatures on profiles
        $this->assertNotEmpty($employee->signature);
        $this->assertStringStartsWith('data:image/png;base64,', $employee->signature);
        $this->assertNotEmpty($admin->signature);
        $this->assertStringStartsWith('data:image/png;base64,', $admin->signature);

        // 2. Disbursed Cash Advance ready for employee signature acknowledgement
        $disbursedAdvance = CashAdvance::where('user_id', $employee->id)
            ->where('status', 'disbursed')
            ->first();

        $this->assertNotNull($disbursedAdvance);
        $this->assertNull($disbursedAdvance->signature);
        $this->assertNull($disbursedAdvance->acknowledged_at);
        $this->assertNotNull($disbursedAdvance->disbursement);

        // 3. Signed Cash Advance ready for liquidation testing
        $signedAdvance = CashAdvance::where('user_id', $employee->id)
            ->where('status', 'signed')
            ->first();

        $this->assertNotNull($signedAdvance);
        $this->assertNotNull($signedAdvance->signature);
        $this->assertNotNull($signedAdvance->acknowledged_at);

        // 4. Approved Reimbursement ready for Admin Payout Grant with Granter Signature
        $approvedReimbursement = Reimbursement::where('user_id', $employee->id)
            ->where('status', 'approved')
            ->first();

        $this->assertNotNull($approvedReimbursement);
        $this->assertNull($approvedReimbursement->payout);

        // 5. Granted Reimbursement with Payout ready for Employee Acknowledgement Signature
        $grantedReimbursement = Reimbursement::where('user_id', $employee->id)
            ->where('status', 'granted')
            ->first();

        $this->assertNotNull($grantedReimbursement);
        $this->assertNotNull($grantedReimbursement->payout);
        $this->assertNotNull($grantedReimbursement->payout->granter_signature);
        $this->assertNull($grantedReimbursement->payout->employee_signature);
        $this->assertNull($grantedReimbursement->payout->acknowledged_at);
    }

    public function test_it_is_idempotent_and_does_not_duplicate_records(): void
    {
        $this->seed(SignatureTestingSeeder::class);
        $this->seed(SignatureTestingSeeder::class);

        $employee = User::where('email', SignatureTestingSeeder::EMPLOYEE_EMAIL)->first();

        $disbursedCount = CashAdvance::where('user_id', $employee->id)
            ->where('status', 'disbursed')
            ->count();
        $this->assertSame(1, $disbursedCount);

        $signedCount = CashAdvance::where('user_id', $employee->id)
            ->where('status', 'signed')
            ->count();
        $this->assertSame(1, $signedCount);

        $approvedCount = Reimbursement::where('user_id', $employee->id)
            ->where('status', 'approved')
            ->count();
        $this->assertSame(1, $approvedCount);

        $grantedCount = Reimbursement::where('user_id', $employee->id)
            ->where('status', 'granted')
            ->count();
        $this->assertSame(1, $grantedCount);
    }
}

