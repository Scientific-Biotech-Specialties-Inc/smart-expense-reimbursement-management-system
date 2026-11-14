<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ReceiptFilteringTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;
    private User $otherEmployee;

    private Receipt $receipt1;
    private Receipt $receipt2;
    private Receipt $receipt3;
    private Receipt $receipt4;
    private Receipt $receipt5;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Create standard employee (matches mock_token_2 in external middleware)
        $this->employee = User::create([
            'email' => 'employee@serms.com',
            'name' => 'John Santos',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'SALES',
            'avatar' => 'JS',
        ]);

        // 2. Create admin user (matches mock_token_1 in external middleware)
        $this->admin = User::create([
            'email' => 'admin@serms.com',
            'name' => 'Alex Reyes',
            'role' => 'admin',
            'grade' => 'EXEC',
            'department' => 'accounting',
            'avatar' => 'AR',
        ]);

        // 3. Create another employee user
        $this->otherEmployee = User::create([
            'email' => 'other@serms.com',
            'name' => 'Jane Smith',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'HR',
            'avatar' => 'JS',
        ]);

        // 4. Create and seed expense categories
        $mealsCategory = \App\Modules\Reimbursements\Models\ExpenseCategory::create(['name' => 'Meals']);
        $travelCategory = \App\Modules\Reimbursements\Models\ExpenseCategory::create(['name' => 'Travel']);
        $suppliesCategory = \App\Modules\Reimbursements\Models\ExpenseCategory::create(['name' => 'Office Supplies']);

        // 5. Seed 5 test receipts with varying categories, dates, amounts, and uploaders
        // Receipt 1: Employee, Meals, 1500.00, 2026-05-10
        $this->receipt1 = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_1.png',
            'file_hash' => hash('sha256', 'data_1'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Restaurant A',
            'expense_category_id' => $mealsCategory->id,
            'total_amount' => 1500.00,
            'transaction_date' => '2026-05-10',
        ]);

        // Receipt 2: Employee, Travel, 500.00, 2026-05-15
        $this->receipt2 = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_2.png',
            'file_hash' => hash('sha256', 'data_2'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Taxi B',
            'expense_category_id' => $travelCategory->id,
            'total_amount' => 500.00,
            'transaction_date' => '2026-05-15',
        ]);

        // Receipt 3: Employee, Meals, 2500.00, 2026-05-20
        $this->receipt3 = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/rcpt_3.png',
            'file_hash' => hash('sha256', 'data_3'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Catering C',
            'expense_category_id' => $mealsCategory->id,
            'total_amount' => 2500.00,
            'transaction_date' => '2026-05-20',
        ]);

        // Receipt 4: Other Employee, Meals, 800.00, 2026-05-12
        $this->receipt4 = Receipt::create([
            'uploaded_by' => $this->otherEmployee->id,
            'file_path' => 'receipts/rcpt_4.png',
            'file_hash' => hash('sha256', 'data_4'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Snacks D',
            'expense_category_id' => $mealsCategory->id,
            'total_amount' => 800.00,
            'transaction_date' => '2026-05-12',
        ]);

        // Receipt 5: Other Employee, Office Supplies, 12000.00, 2026-05-18
        $this->receipt5 = Receipt::create([
            'uploaded_by' => $this->otherEmployee->id,
            'file_path' => 'receipts/rcpt_5.png',
            'file_hash' => hash('sha256', 'data_5'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Computers E',
            'expense_category_id' => $suppliesCategory->id,
            'total_amount' => 12000.00,
            'transaction_date' => '2026-05-18',
        ]);
    }

    /**
     * Verify list defaults (role-scope limits employee to 3 items, admin sees all 5).
     */
    public function test_receipt_list_defaults_without_filters(): void
    {
        // Standard Employee -> sees 3 receipts
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson('/api/expenses');

        $response->assertStatus(200);
        $response->assertJsonCount(3);

        // Admin -> sees 5 receipts
        $responseAdmin = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken(['email' => 'admin@serms.com', 'role' => 'admin', 'department' => 'accounting'])
        ])->getJson('/api/expenses');

        $responseAdmin->assertStatus(200);
        $responseAdmin->assertJsonCount(5);
    }

    /**
     * Test single category filtering.
     */
    public function test_filtering_by_category_succeeds(): void
    {
        // Employee filters by 'Meals' -> should see receipt 1 and 3
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson('/api/expenses?category=Meals');

        $response->assertStatus(200);
        $response->assertJsonCount(2);
        
        $ids = collect($response->json())->pluck('id')->all();
        $this->assertContains($this->receipt1->id, $ids);
        $this->assertContains($this->receipt3->id, $ids);
        $this->assertNotContains($this->receipt2->id, $ids);
    }

    /**
     * Test amount range filtering (min and max).
     */
    public function test_filtering_by_amount_range_succeeds(): void
    {
        // Employee filters for amount >= 1000 and <= 2000 -> should only get receipt 1 (1500)
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson('/api/expenses?min_amount=1000&max_amount=2000');

        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $this->receipt1->id);

        // Employee filters for amount >= 2000 -> should only get receipt 3 (2500)
        $responseMin = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson('/api/expenses?min_amount=2000');

        $responseMin->assertStatus(200);
        $responseMin->assertJsonCount(1);
        $responseMin->assertJsonPath('0.id', $this->receipt3->id);
    }

    /**
     * Test date range filtering.
     */
    public function test_filtering_by_date_range_succeeds(): void
    {
        // Employee filters for date between 2026-05-12 and 2026-05-18 -> should get receipt 2 (2026-05-15)
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson('/api/expenses?start_date=2026-05-12&end_date=2026-05-18');

        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $this->receipt2->id);
    }

    /**
     * Test uploader_id filtering.
     */
    public function test_filtering_by_uploader_id_succeeds_for_admin(): void
    {
        // Admin filters for other employee -> should see receipt 4 and 5
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken(['email' => 'admin@serms.com', 'role' => 'admin', 'department' => 'accounting'])
        ])->getJson("/api/expenses?uploader_id={$this->otherEmployee->id}");

        $response->assertStatus(200);
        $response->assertJsonCount(2);

        $ids = collect($response->json())->pluck('id')->all();
        $this->assertContains($this->receipt4->id, $ids);
        $this->assertContains($this->receipt5->id, $ids);
    }

    /**
     * Test combined filter scenarios.
     */
    public function test_filtering_by_combined_scenarios_returns_correct_subset(): void
    {
        // Employee filters by category 'Meals' AND min_amount 1000 AND max_amount 2000 AND date range 2026-05-08 to 2026-05-12
        // Should return exactly Receipt 1 (Meals, 1500.00, 2026-05-10)
        $url = '/api/expenses?' . http_build_query([
            'category' => 'Meals',
            'min_amount' => 1000,
            'max_amount' => 2000,
            'start_date' => '2026-05-08',
            'end_date' => '2026-05-12'
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson($url);

        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $this->receipt1->id);
    }

    /**
     * Test non-matching combined filter scenario.
     */
    public function test_filtering_by_non_matching_combined_criteria_returns_empty(): void
    {
        // Employee filters by Meals, 1000 to 2000, but wrong date range -> should return 0 items
        $url = '/api/expenses?' . http_build_query([
            'category' => 'Meals',
            'min_amount' => 1000,
            'max_amount' => 2000,
            'start_date' => '2026-05-15', // Receipt 1 is on 2026-05-10
            'end_date' => '2026-05-25'
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson($url);

        $response->assertStatus(200);
        $response->assertJsonCount(0);
    }

    /**
     * Test security constraints in filter logic.
     */
    public function test_filtering_security_scoping_prevents_employee_from_viewing_others(): void
    {
        // Standard employee tries to filter by uploader_id of other employee
        // Since employees are strictly scoped to their own receipts, it should return 0 items
        // instead of exposing other users' files.
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->generateMockToken()
        ])->getJson("/api/expenses?uploader_id={$this->otherEmployee->id}");

        $response->assertStatus(200);
        $response->assertJsonCount(0);
    }

    /**
     * Verify the scope=mine query restricts even managers (accounting) to their own receipts
     * on the SPA's receipts endpoint, while leaving the default manage view untouched.
     */
    public function test_receipt_list_scope_mine_restricts_manager_to_own_receipts(): void
    {
        $adminReceipt = Receipt::create([
            'uploaded_by' => $this->admin->id,
            'file_path' => 'receipts/admin_receipt.png',
            'file_hash' => hash('sha256', 'admin_data'),
            'file_type' => 'png',
            'file_size_bytes' => 100000,
            'vendor_name' => 'Admin Store',
        ]);

        // Accounting department maps to the admin role and grants manage permission.
        $adminToken = $this->generateMockToken([
            'email' => 'admin@serms.com',
            'role' => 'admin',
            'department' => 'accounting',
            'sub' => 9999,
        ]);

        // Default behavior is unchanged: manager sees all receipts.
        $responseAll = $this->withHeaders([
            'Authorization' => 'Bearer ' . $adminToken,
        ])->getJson('/api/reimbursements/receipts');

        $responseAll->assertStatus(200);
        $this->assertCount(6, $responseAll->json('data'));

        // With scope=mine the manager sees only their own receipts.
        $responseMine = $this->withHeaders([
            'Authorization' => 'Bearer ' . $adminToken,
        ])->getJson('/api/reimbursements/receipts?scope=mine');

        $responseMine->assertStatus(200);
        $responseMine->assertJsonCount(1, 'data');
        $this->assertSame($adminReceipt->id, $responseMine->json('data.0.id'));

        // Employees are unaffected: scope=mine still returns their own receipts only.
        $employeeToken = $this->generateMockToken(['sub' => 1000]);
        $responseEmp = $this->withHeaders([
            'Authorization' => 'Bearer ' . $employeeToken,
        ])->getJson('/api/reimbursements/receipts?scope=mine');

        $responseEmp->assertStatus(200);
        $responseEmp->assertJsonCount(3, 'data');
    }

    /**
     * Test sorting receipts by various sort options.
     */
    public function test_receipt_list_sorting_options(): void
    {
        $employeeToken = $this->generateMockToken(['sub' => 1000]);

        // 1. Price Low to High: receipt2 (500), receipt1 (1500), receipt3 (2500)
        $resAsc = $this->withHeaders(['Authorization' => 'Bearer ' . $employeeToken])
            ->getJson('/api/reimbursements/receipts?scope=mine&sort=price-asc');
        $resAsc->assertStatus(200);
        $idsAsc = collect($resAsc->json('data'))->pluck('id')->all();
        $this->assertSame([$this->receipt2->id, $this->receipt1->id, $this->receipt3->id], $idsAsc);

        // 2. Price High to Low: receipt3 (2500), receipt1 (1500), receipt2 (500)
        $resDesc = $this->withHeaders(['Authorization' => 'Bearer ' . $employeeToken])
            ->getJson('/api/reimbursements/receipts?scope=mine&sort=price-desc');
        $resDesc->assertStatus(200);
        $idsDesc = collect($resDesc->json('data'))->pluck('id')->all();
        $this->assertSame([$this->receipt3->id, $this->receipt1->id, $this->receipt2->id], $idsDesc);

        // 3. Name A to Z: Catering C (receipt3), Restaurant A (receipt1), Taxi B (receipt2)
        $resNameAsc = $this->withHeaders(['Authorization' => 'Bearer ' . $employeeToken])
            ->getJson('/api/reimbursements/receipts?scope=mine&sort=name-asc');
        $resNameAsc->assertStatus(200);
        $idsNameAsc = collect($resNameAsc->json('data'))->pluck('id')->all();
        $this->assertSame([$this->receipt3->id, $this->receipt1->id, $this->receipt2->id], $idsNameAsc);

        // 4. Category A to Z: Meals (receipt1, receipt3), Travel (receipt2)
        $resCat = $this->withHeaders(['Authorization' => 'Bearer ' . $employeeToken])
            ->getJson('/api/reimbursements/receipts?scope=mine&sort=category-asc');
        $resCat->assertStatus(200);
        $idsCat = collect($resCat->json('data'))->pluck('id')->all();
        $this->assertSame($this->receipt2->id, $idsCat[2]); // Travel is last
    }
}
