<?php

namespace Tests\Feature;

use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CmsInternalIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private string $internalSecret = 'cms-serms-shared-secret-test';
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.cms.internal_secret' => $this->internalSecret]);

        $this->employee = User::create([
            'auth_id'    => 101,
            'email'      => 'juan@sbsi.com',
            'name'       => 'Juan Dela Cruz',
            'role'       => 'employee',
            'department' => 'Operations',
        ]);
    }

    private function internalHeaders(?string $secret = null): array
    {
        $headers = ['Accept' => 'application/json'];
        if ($secret !== null) {
            $headers['X-Internal-Secret'] = $secret;
        }
        return $headers;
    }

    public function test_internal_endpoints_return_401_when_secret_is_missing_or_invalid(): void
    {
        $this->getJson('/api/internal/expenses/by-contract', $this->internalHeaders())
            ->assertUnauthorized();

        $this->getJson('/api/internal/expenses/by-contract', $this->internalHeaders('wrong-secret'))
            ->assertUnauthorized();

        $this->getJson('/api/internal/reimbursements/by-vendor?tin=123456789000', $this->internalHeaders())
            ->assertUnauthorized();

        $this->getJson('/api/internal/reimbursements/by-vendor?tin=123456789000', $this->internalHeaders('wrong-secret'))
            ->assertUnauthorized();
    }

    public function test_internal_endpoints_return_401_when_server_secret_is_not_configured(): void
    {
        config(['services.cms.internal_secret' => '']);
        putenv('INTERNAL_SERVICE_SECRET=');
        unset($_ENV['INTERNAL_SERVICE_SECRET'], $_SERVER['INTERNAL_SERVICE_SECRET']);

        $this->getJson('/api/internal/expenses/by-contract', $this->internalHeaders('anything'))
            ->assertUnauthorized();
    }

    public function test_expenses_by_contract_aggregates_approved_and_granted_reimbursements_with_exact_schema(): void
    {
        $travelCat = ExpenseCategory::firstOrCreate(['name' => 'Travel']);
        $suppliesCat = ExpenseCategory::firstOrCreate(['name' => 'Spare Parts']);
        $fieldCat = ExpenseCategory::firstOrCreate(['name' => 'Field Service']);
        $mealsCat = ExpenseCategory::firstOrCreate(['name' => 'Meals']);

        // Contract 10: approved + granted reimbursements
        Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Flight & Hotel',
            'expense_category_id' => $travelCat->id,
            'contract_id'         => 10,
            'client_name'         => 'Acme Biotech Corp',
            'amount'              => 10000.00,
            'date'                => '2026-05-01',
            'status'              => 'approved',
        ]);
        Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Replacement valves',
            'expense_category_id' => $suppliesCat->id,
            'contract_id'         => 10,
            'client_name'         => 'Acme Biotech Corp',
            'amount'              => 10000.00,
            'date'                => '2026-05-02',
            'status'              => 'granted',
        ]);
        Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Onsite calibration',
            'expense_category_id' => $fieldCat->id,
            'contract_id'         => 10,
            'client_name'         => 'Acme Biotech Corp',
            'amount'              => 5000.00,
            'date'                => '2026-05-03',
            'status'              => 'approved',
        ]);

        // Pending and rejected for Contract 10 must be excluded
        Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Pending meal',
            'expense_category_id' => $mealsCat->id,
            'contract_id'         => 10,
            'client_name'         => 'Acme Biotech Corp',
            'amount'              => 2000.00,
            'date'                => '2026-05-04',
            'status'              => 'pending',
        ]);
        Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Rejected meal',
            'expense_category_id' => $mealsCat->id,
            'contract_id'         => 10,
            'client_name'         => 'Acme Biotech Corp',
            'amount'              => 9999.00,
            'date'                => '2026-05-04',
            'status'              => 'rejected',
        ]);

        // Contract 22: Meals -> other
        Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Client lunch',
            'expense_category_id' => $mealsCat->id,
            'contract_id'         => 22,
            'client_name'         => 'Beta Lab',
            'amount'              => 1500.50,
            'date'                => '2026-05-05',
            'status'              => 'granted',
        ]);

        // Unlinked reimbursement (contract_id = null) must be excluded
        Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Internal office',
            'expense_category_id' => $mealsCat->id,
            'contract_id'         => null,
            'amount'              => 500.00,
            'date'                => '2026-05-06',
            'status'              => 'approved',
        ]);

        $response = $this->getJson(
            '/api/internal/expenses/by-contract',
            $this->internalHeaders($this->internalSecret)
        );

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJson([
                'data' => [
                    [
                        'contract_id'    => 10,
                        'total_expenses' => 25000.0,
                        'breakdown'      => [
                            'travel'        => 10000.0,
                            'spare_parts'   => 10000.0,
                            'field_service' => 5000.0,
                            'other'         => 0.0,
                        ],
                    ],
                    [
                        'contract_id'    => 22,
                        'total_expenses' => 1500.5,
                        'breakdown'      => [
                            'travel'        => 0.0,
                            'spare_parts'   => 0.0,
                            'field_service' => 0.0,
                            'other'         => 1500.5,
                        ],
                    ],
                ],
            ]);
    }

    public function test_reimbursements_by_vendor_requires_tin_or_vendor_name(): void
    {
        $this->getJson(
            '/api/internal/reimbursements/by-vendor',
            $this->internalHeaders($this->internalSecret)
        )->assertStatus(422);

        $this->getJson(
            '/api/internal/reimbursements/by-vendor?tin=&vendor_name=%20',
            $this->internalHeaders($this->internalSecret)
        )->assertStatus(422);
    }

    public function test_reimbursements_by_vendor_matches_normalized_tin_and_returns_all_statuses_ordered_newest_first(): void
    {
        $spareParts = ExpenseCategory::firstOrCreate(['name' => 'Spare Parts']);

        $r1 = Receipt::create([
            'uploaded_by'         => $this->employee->id,
            'file_path'           => 'receipts/a.png',
            'file_hash'           => hash('sha256', 'a'),
            'file_type'           => 'png',
            'file_size_bytes'     => 100,
            'vendor_name'         => 'SBSI Lab Supplies Inc.',
            'tin'                 => '123-456-789-000',
            'total_amount'        => 10000.00,
            'transaction_date'    => '2026-05-10',
            'expense_category_id' => $spareParts->id,
            'status'              => 'approved',
        ]);

        $r2 = Receipt::create([
            'uploaded_by'         => $this->employee->id,
            'file_path'           => 'receipts/b.png',
            'file_hash'           => hash('sha256', 'b'),
            'file_type'           => 'png',
            'file_size_bytes'     => 100,
            'vendor_name'         => 'SBSI Lab Supplies Inc.',
            'tin'                 => '123456789000',
            'total_amount'        => 20000.00,
            'transaction_date'    => '2026-05-12',
            'expense_category_id' => $spareParts->id,
            'status'              => 'granted',
        ]);

        $reimbOlder = Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Older pending batch',
            'expense_category_id' => $spareParts->id,
            'contract_id'         => 10,
            'amount'              => 10000.00,
            'date'                => '2026-05-10',
            'status'              => 'pending',
            'submitted_by_name'   => 'Juan Dela Cruz',
        ]);
        $reimbOlder->receipts()->attach($r1->id);

        $reimbNewer = Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Quarterly instrument filter replacement',
            'expense_category_id' => $spareParts->id,
            'contract_id'         => 10,
            'amount'              => 20000.00,
            'date'                => '2026-05-12',
            'status'              => 'granted',
            'submitted_by_name'   => 'Juan Dela Cruz',
        ]);
        $reimbNewer->receipts()->attach($r2->id);

        // Search with unhyphenated TIN — must match both hyphenated and unhyphenated
        $response = $this->getJson(
            '/api/internal/reimbursements/by-vendor?tin=123456789000',
            $this->internalHeaders($this->internalSecret)
        );

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.reimbursement_id', $reimbNewer->id)
            ->assertJsonPath('data.0.reference_no', 'RMB-' . $reimbNewer->id)
            ->assertJsonPath('data.0.status', 'Paid')
            ->assertJsonPath('data.0.vendor_name', 'SBSI Lab Supplies Inc.')
            ->assertJsonPath('data.0.category', 'Spare Parts')
            ->assertJsonPath('data.0.employee_name', 'Juan Dela Cruz')
            ->assertJsonPath('data.0.contract_id', 10)
            ->assertJsonPath('data.0.expense_date', '2026-05-12')
            ->assertJsonPath('data.1.reimbursement_id', $reimbOlder->id)
            ->assertJsonPath('data.1.status', 'Pending');
    }

    public function test_reimbursements_by_vendor_falls_back_to_case_insensitive_vendor_name_and_splits_multi_vendor_amounts(): void
    {
        $cat = ExpenseCategory::firstOrCreate(['name' => 'Field Service']);

        $receiptTarget = Receipt::create([
            'uploaded_by'         => $this->employee->id,
            'file_path'           => 'receipts/target.png',
            'file_hash'           => hash('sha256', 'target'),
            'file_type'           => 'png',
            'file_size_bytes'     => 100,
            'vendor_name'         => 'Metro Calibration Services',
            'tin'                 => null,
            'total_amount'        => 8500.00,
            'transaction_date'    => '2026-06-01',
            'expense_category_id' => $cat->id,
            'status'              => 'approved',
        ]);

        $receiptOther = Receipt::create([
            'uploaded_by'         => $this->employee->id,
            'file_path'           => 'receipts/other.png',
            'file_hash'           => hash('sha256', 'other'),
            'file_type'           => 'png',
            'file_size_bytes'     => 100,
            'vendor_name'         => 'Different Merchant',
            'tin'                 => '999-888-777-000',
            'total_amount'        => 1500.00,
            'transaction_date'    => '2026-06-01',
            'expense_category_id' => $cat->id,
            'status'              => 'approved',
        ]);

        $reimbursement = Reimbursement::create([
            'user_id'             => $this->employee->id,
            'description'         => 'Mixed vendor batch',
            'expense_category_id' => $cat->id,
            'amount'              => 10000.00,
            'date'                => '2026-06-01',
            'status'              => 'approved',
        ]);
        $reimbursement->receipts()->attach([$receiptTarget->id, $receiptOther->id]);

        // Unmatched TIN + matching vendor_name (different casing) -> fallback to vendor_name
        $response = $this->getJson(
            '/api/internal/reimbursements/by-vendor?tin=000-000-000-000&vendor_name=metro%20calibration%20services',
            $this->internalHeaders($this->internalSecret)
        );

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.reimbursement_id', $reimbursement->id)
            ->assertJsonPath('data.0.amount', 8500)
            ->assertJsonPath('data.0.status', 'Approved');
    }
}
