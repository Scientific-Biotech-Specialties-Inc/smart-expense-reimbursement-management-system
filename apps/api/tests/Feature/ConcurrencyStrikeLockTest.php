<?php

namespace Tests\Feature;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceDisbursement;
use App\Modules\Users\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConcurrencyStrikeLockTest extends TestCase
{
    use RefreshDatabase;

    public function test_cash_advance_disbursements_enforces_unique_cash_advance_id(): void
    {
        $employee = User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan.concurrency@example.com',
            'role' => 'employee',
        ]);

        $advance = CashAdvance::create([
            'user_id' => $employee->id,
            'amount' => 5000,
            'purpose' => 'Conference travel',
            'expected_disbursement_date' => now()->toDateString(),
            'expected_liquidation_date' => now()->addDays(5)->toDateString(),
            'status' => 'approved',
        ]);

        CashAdvanceDisbursement::create([
            'cash_advance_id' => $advance->id,
            'disbursed_by_id' => $employee->id,
            'disbursement_date' => now()->toDateString(),
            'channel' => 'bank_transfer',
            'reference_number' => 'REF-001',
        ]);

        $this->expectException(QueryException::class);

        CashAdvanceDisbursement::create([
            'cash_advance_id' => $advance->id,
            'disbursed_by_id' => $employee->id,
            'disbursement_date' => now()->toDateString(),
            'channel' => 'cash',
            'reference_number' => 'REF-002',
        ]);
    }
}
