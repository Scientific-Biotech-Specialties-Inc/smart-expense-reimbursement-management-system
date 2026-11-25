<?php

namespace Tests\Feature;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceDisbursement;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Liquidations\Models\PenaltyRecord;
use App\Modules\Penalties\Models\PenaltyAppeal;
use App\Modules\Penalties\Models\PenaltyStrike;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PenaltyModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $otherEmployee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('supabase');

        $this->employee = User::create([
            'name' => 'Maria Employee',
            'email' => 'maria.employee@example.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Sales',
        ]);

        $this->otherEmployee = User::create([
            'name' => 'Carlos Employee',
            'email' => 'carlos.employee@example.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Operations',
        ]);

        $this->admin = User::create([
            'name' => 'Elena Admin',
            'email' => 'elena.admin@example.com',
            'role' => 'admin',
            'grade' => 'L5',
            'department' => 'accounting',
        ]);
    }

    private function employeeHeaders(?User $user = null): array
    {
        $target = $user ?? $this->employee;
        $token = $this->generateMockToken([
            'email' => $target->email,
            'role' => $target->role,
            'department' => $target->department,
            'first_name' => explode(' ', $target->name)[0],
            'last_name' => explode(' ', $target->name)[1] ?? 'User',
        ]);

        return [
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ];
    }

    private function adminHeaders(): array
    {
        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => $this->admin->role,
            'department' => 'accounting',
            'first_name' => 'Elena',
            'last_name' => 'Admin',
        ]);

        return [
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
        ];
    }

    private function createStrike(User $user, int $index, array $overrides = []): PenaltyStrike
    {
        $ca = CashAdvance::create([
            'user_id' => $user->id,
            'purpose' => "Advance {$index}",
            'amount' => 1000.00,
            'outstanding_balance' => 1000.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(10)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(10)->toDateString(),
            'acknowledged_at' => Carbon::now()->subDays(9),
        ]);

        return PenaltyStrike::create(array_merge([
            'user_id' => $user->id,
            'cycle_number' => 1,
            'source_module' => 'cash_advance',
            'source_id' => $ca->id,
            'source_reference' => $ca->reference_no,
            'trigger_type' => 'manual_admin',
            'reason' => "Compliance strike #{$index}",
            'status' => 'active',
            'issued_by_id' => $this->admin->id,
            'issued_by_name' => $this->admin->name,
        ], $overrides));
    }

    public function test_me_returns_clear_standing_and_overdue_monetary_penalties(): void
    {
        $ca = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Overdue travel',
            'amount' => 1500.00,
            'outstanding_balance' => 1550.00,
            'status' => 'overdue',
            'expected_disbursement_date' => Carbon::now()->subDays(15)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(5)->toDateString(),
            'acknowledged_at' => Carbon::now()->subDays(14),
        ]);

        PenaltyRecord::create([
            'cash_advance_id' => $ca->id,
            'days_overdue' => 1,
            'penalty_amount' => 50.00,
        ]);

        $response = $this->withHeaders($this->employeeHeaders())
            ->getJson('/api/penalties/me');

        $response->assertOk()
            ->assertJsonPath('data.active_strikes_count', 0)
            ->assertJsonPath('data.strike_limit', 3)
            ->assertJsonPath('data.standing', 'clear')
            ->assertJsonPath('data.is_penalized', false)
            ->assertJsonPath('data.current_cycle', 1)
            ->assertJsonPath('data.pending_appeal', null)
            ->assertJsonPath('data.overdue_monetary_penalties.total_amount', 50);

        $this->assertCount(1, $response->json('data.overdue_monetary_penalties.records'));
        $this->assertEquals($ca->reference_no, $response->json('data.overdue_monetary_penalties.records.0.reference_no'));
    }

    public function test_sync_user_strikes_triggers_ca_unsigned_overdue_and_liquidation_overdue_idempotently(): void
    {
        // 1. Disbursed 4 days ago, unsigned -> SHOULD trigger ca_unsigned_overdue
        $unsignedOverdue = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Unsigned overdue CA',
            'amount' => 2000.00,
            'outstanding_balance' => 2000.00,
            'status' => 'disbursed',
            'expected_disbursement_date' => Carbon::now()->subDays(4)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(5)->toDateString(),
            'acknowledged_at' => null,
        ]);
        CashAdvanceDisbursement::create([
            'cash_advance_id' => $unsignedOverdue->id,
            'disbursed_by_id' => $this->admin->id,
            'granted_by' => $this->admin->name,
            'disbursement_date' => Carbon::now()->subDays(4)->toDateString(),
            'channel' => 'Cash',
            'payout_method' => 'Cash',
            'reference_number' => 'REF-UNSIGNED-4D',
        ]);

        // 2. Disbursed exactly 3 days ago, unsigned -> should NOT trigger (must be strictly > 3 days)
        $unsignedBoundary = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Unsigned 3-day boundary CA',
            'amount' => 1000.00,
            'outstanding_balance' => 1000.00,
            'status' => 'disbursed',
            'expected_disbursement_date' => Carbon::now()->subDays(3)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(5)->toDateString(),
            'acknowledged_at' => null,
        ]);
        CashAdvanceDisbursement::create([
            'cash_advance_id' => $unsignedBoundary->id,
            'disbursed_by_id' => $this->admin->id,
            'granted_by' => $this->admin->name,
            'disbursement_date' => Carbon::now()->subDays(3)->toDateString(),
            'channel' => 'Cash',
            'payout_method' => 'Cash',
            'reference_number' => 'REF-UNSIGNED-3D',
        ]);

        // 3. Signed CA with liquidation past due and no active/settled liquidation -> SHOULD trigger liquidation_overdue
        $liquidationOverdue = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Overdue liquidation CA',
            'amount' => 3000.00,
            'outstanding_balance' => 3000.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(10)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->subDay()->toDateString(),
            'acknowledged_at' => Carbon::now()->subDays(9),
        ]);

        // 4. Signed CA past due BUT has pending liquidation -> should NOT trigger liquidation_overdue
        $pausedAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Paused liquidation CA',
            'amount' => 2500.00,
            'outstanding_balance' => 2500.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(10)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->subDay()->toDateString(),
            'acknowledged_at' => Carbon::now()->subDays(9),
        ]);
        Liquidation::create([
            'cash_advance_id' => $pausedAdvance->id,
            'user_id' => $this->employee->id,
            'status' => 'pending',
            'reimbursement_ids' => [],
            'total_expense_amount' => 2500.00,
            'outstanding_balance' => 2500.00,
        ]);

        // Hit /me twice to verify idempotency
        $first = $this->withHeaders($this->employeeHeaders())->getJson('/api/penalties/me');
        $second = $this->withHeaders($this->employeeHeaders())->getJson('/api/penalties/me');

        $first->assertOk()
            ->assertJsonPath('data.active_strikes_count', 2)
            ->assertJsonPath('data.standing', 'warning')
            ->assertJsonPath('data.is_penalized', false);

        $second->assertOk()
            ->assertJsonPath('data.active_strikes_count', 2);

        $this->assertDatabaseCount('penalty_strikes', 2);
        $this->assertDatabaseHas('penalty_strikes', [
            'user_id' => $this->employee->id,
            'source_module' => 'cash_advance',
            'source_id' => $unsignedOverdue->id,
            'trigger_type' => 'ca_unsigned_overdue',
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('penalty_strikes', [
            'user_id' => $this->employee->id,
            'source_module' => 'cash_advance',
            'source_id' => $liquidationOverdue->id,
            'trigger_type' => 'liquidation_overdue',
            'status' => 'active',
        ]);

        $strikes = collect($second->json('data.active_strikes'));
        $this->assertTrue($strikes->contains('redirect_path', "/cash-advances?view={$unsignedOverdue->id}"));
        $this->assertTrue($strikes->contains('redirect_path', "/cash-advances?view={$liquidationOverdue->id}"));
    }

    public function test_penalties_calculate_command_also_syncs_compliance_strikes(): void
    {
        $ca = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Overdue via command',
            'amount' => 1000.00,
            'outstanding_balance' => 1000.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(12)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->subDays(2)->toDateString(),
            'acknowledged_at' => Carbon::now()->subDays(11),
        ]);

        $this->artisan('penalties:calculate')->assertSuccessful();

        $this->assertDatabaseHas('penalty_strikes', [
            'user_id' => $this->employee->id,
            'source_module' => 'cash_advance',
            'source_id' => $ca->id,
            'trigger_type' => 'liquidation_overdue',
            'status' => 'active',
        ]);
    }

    public function test_three_strikes_blocks_reimbursement_and_cash_advance_creation_but_allows_signing_and_liquidation(): void
    {
        $this->createStrike($this->employee, 1);
        $this->createStrike($this->employee, 2);
        $this->createStrike($this->employee, 3);

        $category = ExpenseCategory::firstOrCreate(['name' => 'Meals']);
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/hold_test.png',
            'file_hash' => str_repeat('b', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Hold Vendor',
            'total_amount' => 250.00,
        ]);

        // 1. Blocked: POST /api/reimbursements -> 403 PENALTY_HOLD_ACTIVE
        $reimbRes = $this->withHeaders($this->employeeHeaders())
            ->post('/api/reimbursements', [
                'description' => 'Blocked lunch claim',
                'expense_category_id' => $category->id,
                'event_type' => 'Client Meeting',
                'amount' => 250.00,
                'date' => Carbon::now()->toDateString(),
                'receipt_ids' => [$receipt->id],
                'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
            ]);

        $reimbRes->assertStatus(403)
            ->assertJsonPath('code', 'PENALTY_HOLD_ACTIVE')
            ->assertJsonPath('active_strikes_count', 3);

        // 2. Blocked: POST /api/cash-advances -> 403 PENALTY_HOLD_ACTIVE
        $caRes = $this->withHeaders($this->employeeHeaders())
            ->post('/api/cash-advances', [
                'purpose' => 'Blocked cash advance',
                'amount' => 1500.00,
                'expected_disbursement_date' => Carbon::now()->addDay()->toDateString(),
                'expected_liquidation_date' => Carbon::now()->addDays(5)->toDateString(),
                'documents' => [UploadedFile::fake()->create('ca.pdf', 100, 'application/pdf')],
            ]);

        $caRes->assertStatus(403)
            ->assertJsonPath('code', 'PENALTY_HOLD_ACTIVE')
            ->assertJsonPath('active_strikes_count', 3);

        // 3. Allowed (no deadlock): POST /api/cash-advances/{id}/acknowledge
        $disbursedAdvance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Must still allow signing',
            'amount' => 1000.00,
            'outstanding_balance' => 1000.00,
            'status' => 'disbursed',
            'expected_disbursement_date' => Carbon::now()->subDays(5)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(5)->toDateString(),
            'acknowledged_at' => null,
        ]);

        $ackRes = $this->withHeaders($this->employeeHeaders())
            ->postJson("/api/cash-advances/{$disbursedAdvance->id}/acknowledge", [
                'signature' => 'data:image/png;base64,signaturePayload',
            ]);
        $ackRes->assertOk();

        // 4. Allowed (no deadlock): POST /api/liquidations
        $liqReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => 'receipts/liq_hold_ok.png',
            'file_hash' => str_repeat('c', 64),
            'file_type' => 'png',
            'file_size_bytes' => 512,
            'vendor_name' => 'Liq Vendor',
            'total_amount' => 1000.00,
        ]);

        $liqRes = $this->withHeaders($this->employeeHeaders())
            ->postJson('/api/liquidations', [
                'cash_advance_id' => $disbursedAdvance->id,
                'receipts' => [[
                    'id' => $liqReceipt->id,
                    'vendor_name' => 'Liq Vendor',
                    'transaction_date' => Carbon::now()->toDateString(),
                    'total_amount' => 1000.00,
                ]],
                'total_expense_amount' => 1000.00,
            ]);
        $liqRes->assertStatus(210);
    }

    public function test_employee_appeal_submission_validation_and_duplicate_conflict(): void
    {
        // Cannot submit appeal with < 3 strikes
        $this->createStrike($this->employee, 1);

        $tooEarly = $this->withHeaders($this->employeeHeaders())
            ->post('/api/penalties/appeals', [
                'explanation' => 'I was traveling in an area without internet access.',
                'letter_file' => UploadedFile::fake()->create('letter.pdf', 200, 'application/pdf'),
            ]);
        $tooEarly->assertStatus(422);

        // Reach 3 strikes
        $this->createStrike($this->employee, 2);
        $this->createStrike($this->employee, 3);

        // Reject invalid mime type
        $badFile = $this->withHeaders($this->employeeHeaders())
            ->post('/api/penalties/appeals', [
                'explanation' => 'Please accept my compliance appeal letter.',
                'letter_file' => UploadedFile::fake()->create('letter.exe', 100, 'application/octet-stream'),
            ]);
        $badFile->assertStatus(422);

        // Valid appeal succeeds (201)
        $file = UploadedFile::fake()->create('appeal-letter.pdf', 300, 'application/pdf');
        $created = $this->withHeaders($this->employeeHeaders())
            ->post('/api/penalties/appeals', [
                'explanation' => 'I delayed the liquidation due to extended fieldwork.',
                'letter_file' => $file,
            ]);

        $created->assertStatus(201)
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.letter_file_name', 'appeal-letter.pdf')
            ->assertJsonPath('data.cycle_number', 1);

        $this->assertArrayNotHasKey('letter_type', $created->json('data'));

        $appeal = PenaltyAppeal::firstOrFail();
        $this->assertStringStartsWith('penalties/appeals/', $appeal->letter_file_path);
        $this->assertEquals(64, strlen($appeal->letter_file_hash));
        Storage::disk('supabase')->assertExists($appeal->letter_file_path);

        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'PENALTY_APPEAL_SUBMITTED',
            'entity_type' => 'penalty_appeal',
            'entity_id' => $appeal->id,
        ]);

        // Duplicate pending appeal in same cycle -> 409 Conflict
        $duplicate = $this->withHeaders($this->employeeHeaders())
            ->post('/api/penalties/appeals', [
                'explanation' => 'Submitting another duplicate appeal in the same cycle.',
                'letter_file' => UploadedFile::fake()->create('second.pdf', 100, 'application/pdf'),
            ]);
        $duplicate->assertStatus(409);
    }

    public function test_admin_endpoints_reject_non_admin_with_403(): void
    {
        $this->withHeaders($this->employeeHeaders())->getJson('/api/penalties/admin/overview')->assertStatus(403);
        $this->withHeaders($this->employeeHeaders())->getJson('/api/penalties/admin/strikes')->assertStatus(403);
        $this->withHeaders($this->employeeHeaders())->postJson('/api/penalties/admin/appeals/1/review', ['decision' => 'approve'])->assertStatus(403);
        $this->withHeaders($this->employeeHeaders())->postJson('/api/penalties/admin/strikes', [])->assertStatus(403);
        $this->withHeaders($this->employeeHeaders())->postJson('/api/penalties/admin/strikes/1/waive', ['reason' => 'test'])->assertStatus(403);
        $this->withHeaders($this->employeeHeaders())->postJson('/api/penalties/admin/users/1/reset', ['reason' => 'test'])->assertStatus(403);
        $this->withHeaders($this->employeeHeaders())->getJson('/api/penalties/admin/users/1/records')->assertStatus(403);
    }

    public function test_admin_overview_and_strikes_filters(): void
    {
        $this->createStrike($this->employee, 1);
        $this->createStrike($this->employee, 2);
        $this->createStrike($this->employee, 3);
        $this->createStrike($this->otherEmployee, 1);

        PenaltyAppeal::create([
            'user_id' => $this->employee->id,
            'cycle_number' => 1,
            'explanation' => 'Detailed explanation for delayed liquidation.',
            'letter_file_path' => 'penalties/appeals/test.pdf',
            'letter_file_name' => 'test.pdf',
            'letter_mime_type' => 'application/pdf',
            'letter_file_hash' => str_repeat('d', 64),
            'status' => 'pending',
        ]);

        $zeroStrikeEmployee = User::create([
            'name' => 'Zoe Clean',
            'email' => 'zoe.clean@example.com',
            'role' => 'employee',
            'grade' => 'L1',
            'department' => 'Marketing',
        ]);

        $overview = $this->withHeaders($this->adminHeaders())
            ->getJson('/api/penalties/admin/overview');

        $overview->assertOk()
            ->assertJsonPath('data.kpis.penalized_count', 1)
            ->assertJsonPath('data.kpis.warning_count', 1)
            ->assertJsonPath('data.kpis.pending_appeals_count', 1)
            ->assertJsonPath('data.kpis.resolved_cycles_count', 0);

        $this->assertCount(1, $overview->json('data.pending_appeals'));
        $this->assertCount(3, $overview->json('data.pending_appeals.0.active_strikes'));
        $this->assertCount(2, $overview->json('data.standings'));
        $this->assertSame(1, $overview->json('data.standings.0.current_cycle'));

        $employeeIds = collect($overview->json('data.employees'))->pluck('id')->all();
        $this->assertContains($zeroStrikeEmployee->id, $employeeIds);

        $filteredStanding = $this->withHeaders($this->adminHeaders())
            ->getJson('/api/penalties/admin/overview?standing=penalized&search=Maria');
        $filteredStanding->assertOk();
        $this->assertCount(1, $filteredStanding->json('data.standings'));
        $this->assertEquals($this->employee->id, $filteredStanding->json('data.standings.0.id'));
        $filteredEmployeeIds = collect($filteredStanding->json('data.employees'))->pluck('id')->all();
        $this->assertContains($zeroStrikeEmployee->id, $filteredEmployeeIds);

        $strikesRes = $this->withHeaders($this->adminHeaders())
            ->getJson('/api/penalties/admin/strikes?status=active&module=cash_advance&search=Carlos');
        $strikesRes->assertOk();
        $this->assertCount(1, $strikesRes->json('data'));
    }

    public function test_admin_appeal_review_reject_then_resubmit_and_approve_resets_strikes_and_lifts_hold(): void
    {
        // Setup monetary PenaltyRecord to confirm it remains untouched
        $caForMonetary = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Monetary penalty preservation',
            'amount' => 1000.00,
            'outstanding_balance' => 0.00,
            'status' => 'liquidated',
            'expected_disbursement_date' => Carbon::now()->subDays(10)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->subDays(8)->toDateString(),
            'acknowledged_at' => Carbon::now()->subDays(9),
        ]);
        $monetaryRecord = PenaltyRecord::create([
            'cash_advance_id' => $caForMonetary->id,
            'days_overdue' => 1,
            'penalty_amount' => 50.00,
        ]);

        $this->createStrike($this->employee, 1);
        $this->createStrike($this->employee, 2);
        $this->createStrike($this->employee, 3);

        // Self-approval check: admin has an appeal on their own user_id -> 403
        $selfAppeal = PenaltyAppeal::create([
            'user_id' => $this->admin->id,
            'cycle_number' => 1,
            'explanation' => 'Self appeal should be blocked.',
            'letter_file_path' => 'penalties/appeals/self.pdf',
            'letter_file_name' => 'self.pdf',
            'letter_mime_type' => 'application/pdf',
            'letter_file_hash' => str_repeat('e', 64),
            'status' => 'pending',
        ]);

        $this->withHeaders($this->adminHeaders())
            ->postJson("/api/penalties/admin/appeals/{$selfAppeal->id}/review", [
                'decision' => 'approve',
            ])
            ->assertStatus(403);

        // Employee submits appeal
        $this->withHeaders($this->employeeHeaders())
            ->post('/api/penalties/appeals', [
                'explanation' => 'Initial appeal explanation with details.',
                'letter_file' => UploadedFile::fake()->create('initial.pdf', 100, 'application/pdf'),
            ])->assertStatus(201);

        $firstAppeal = PenaltyAppeal::where('user_id', $this->employee->id)->latest('id')->firstOrFail();

        // Reject without comment -> 422
        $this->withHeaders($this->adminHeaders())
            ->postJson("/api/penalties/admin/appeals/{$firstAppeal->id}/review", [
                'decision' => 'reject',
                'comment' => '   ',
            ])->assertStatus(422);

        // Reject with comment -> 200
        $this->withHeaders($this->adminHeaders())
            ->postJson("/api/penalties/admin/appeals/{$firstAppeal->id}/review", [
                'decision' => 'reject',
                'comment' => 'Please attach supervisor endorsement.',
            ])->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        // Employee can resubmit after rejection
        $this->withHeaders($this->employeeHeaders())
            ->post('/api/penalties/appeals', [
                'explanation' => 'Updated appeal with supervisor endorsement attached.',
                'letter_file' => UploadedFile::fake()->create('endorsed.pdf', 100, 'application/pdf'),
            ])->assertStatus(201);

        $secondAppeal = PenaltyAppeal::where('user_id', $this->employee->id)->latest('id')->firstOrFail();

        // Admin approves second appeal -> resets strikes to 0/3, increments cycle, lifts hold
        $approveRes = $this->withHeaders($this->adminHeaders())
            ->postJson("/api/penalties/admin/appeals/{$secondAppeal->id}/review", [
                'decision' => 'approve',
                'comment' => 'Approved. Keep liquidation dates on track.',
            ]);
        $approveRes->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $meAfter = $this->withHeaders($this->employeeHeaders())->getJson('/api/penalties/me');
        $meAfter->assertOk()
            ->assertJsonPath('data.active_strikes_count', 0)
            ->assertJsonPath('data.standing', 'clear')
            ->assertJsonPath('data.is_penalized', false)
            ->assertJsonPath('data.current_cycle', 2);

        $overviewAfter = $this->withHeaders($this->adminHeaders())->getJson('/api/penalties/admin/overview?search=Maria');
        $overviewAfter->assertOk()
            ->assertJsonPath('data.standings.0.current_cycle', 2)
            ->assertJsonPath('data.standings.0.active_strikes_count', 0)
            ->assertJsonPath('data.standings.0.standing', 'clear');

        $this->assertCount(3, $meAfter->json('data.history_strikes'));
        $this->assertDatabaseMissing('penalty_strikes', [
            'user_id' => $this->employee->id,
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('penalty_strikes', [
            'user_id' => $this->employee->id,
            'status' => 'reset',
            'appeal_id' => $secondAppeal->id,
            'resolved_by_id' => $this->admin->id,
        ]);

        // Monetary penalties table untouched
        $this->assertDatabaseHas('penalties', ['id' => $monetaryRecord->id, 'penalty_amount' => 50.00]);

        // Hold lifted: employee can now create a new Cash Advance
        $caAfter = $this->withHeaders($this->employeeHeaders())
            ->post('/api/cash-advances', [
                'purpose' => 'Post-approval CA',
                'amount' => 1200.00,
                'expected_disbursement_date' => Carbon::now()->addDay()->toDateString(),
                'expected_liquidation_date' => Carbon::now()->addDays(5)->toDateString(),
                'documents' => [UploadedFile::fake()->create('ca.pdf', 100, 'application/pdf')],
            ]);
        $caAfter->assertStatus(201);
    }

    public function test_admin_manual_strike_waive_reset_and_user_records(): void
    {
        $ca = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'Manual strike CA',
            'amount' => 1000.00,
            'outstanding_balance' => 1000.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(5)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(5)->toDateString(),
            'acknowledged_at' => Carbon::now()->subDays(4),
        ]);

        $otherCa = CashAdvance::create([
            'user_id' => $this->otherEmployee->id,
            'purpose' => 'Other user CA',
            'amount' => 500.00,
            'outstanding_balance' => 500.00,
            'status' => 'signed',
            'expected_disbursement_date' => Carbon::now()->subDays(5)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->addDays(5)->toDateString(),
            'acknowledged_at' => Carbon::now()->subDays(4),
        ]);

        $reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Manual strike claim',
            'amount' => 450.00,
            'date' => Carbon::now()->toDateString(),
            'status' => 'pending',
            'submitted_by_name' => $this->employee->name,
        ]);

        // Record picker endpoint
        $recordsRes = $this->withHeaders($this->adminHeaders())
            ->getJson("/api/penalties/admin/users/{$this->employee->id}/records");
        $recordsRes->assertOk();
        $this->assertCount(1, $recordsRes->json('data.cash_advances'));
        $this->assertCount(1, $recordsRes->json('data.reimbursements'));

        // Record belonging to another user -> 422
        $this->withHeaders($this->adminHeaders())
            ->postJson('/api/penalties/admin/strikes', [
                'user_id' => $this->employee->id,
                'source_module' => 'cash_advance',
                'source_id' => $otherCa->id,
                'reason' => 'Wrong user record test',
            ])->assertStatus(422);

        // Issue manual strike on CA -> 201
        $manualCa = $this->withHeaders($this->adminHeaders())
            ->postJson('/api/penalties/admin/strikes', [
                'user_id' => $this->employee->id,
                'source_module' => 'cash_advance',
                'source_id' => $ca->id,
                'reason' => 'Policy non-compliance on cash advance.',
            ]);
        $manualCa->assertStatus(201)
            ->assertJsonPath('data.trigger_type', 'manual_admin')
            ->assertJsonPath('data.source_reference', $ca->reference_no);

        // Duplicate manual strike in same cycle -> 409
        $this->withHeaders($this->adminHeaders())
            ->postJson('/api/penalties/admin/strikes', [
                'user_id' => $this->employee->id,
                'source_module' => 'cash_advance',
                'source_id' => $ca->id,
                'reason' => 'Duplicate attempt',
            ])->assertStatus(409);

        // Issue manual strike on Reimbursement -> 201
        $manualRmb = $this->withHeaders($this->adminHeaders())
            ->postJson('/api/penalties/admin/strikes', [
                'user_id' => $this->employee->id,
                'source_module' => 'reimbursement',
                'source_id' => $reimbursement->id,
                'reason' => 'Improper reimbursement filing.',
            ]);
        $manualRmb->assertStatus(201)
            ->assertJsonPath('data.redirect_path', "/reimbursements?view={$reimbursement->id}");

        $strikeIdToWaive = $manualCa->json('data.id');

        // Waive requires reason -> 422
        $this->withHeaders($this->adminHeaders())
            ->postJson("/api/penalties/admin/strikes/{$strikeIdToWaive}/waive", ['reason' => ''])
            ->assertStatus(422);

        // Waive -> 200
        $this->withHeaders($this->adminHeaders())
            ->postJson("/api/penalties/admin/strikes/{$strikeIdToWaive}/waive", ['reason' => 'Verified valid exception.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'waived');

        // Reset user -> 200
        $this->withHeaders($this->adminHeaders())
            ->postJson("/api/penalties/admin/users/{$this->employee->id}/reset", ['reason' => 'Quarterly compliance amnesty.'])
            ->assertOk()
            ->assertJsonPath('data.reset_count', 1)
            ->assertJsonPath('data.current_cycle', 2);

        $this->assertDatabaseHas('audit_logs', ['action_type' => 'PENALTY_STRIKE_ISSUED']);
        $this->assertDatabaseHas('audit_logs', ['action_type' => 'PENALTY_STRIKE_WAIVED']);
        $this->assertDatabaseHas('audit_logs', ['action_type' => 'PENALTY_CYCLE_RESET']);
    }

    public function test_penalty_strikes_and_appeals_block_hard_deletes(): void
    {
        $strike = $this->createStrike($this->employee, 1);
        $appeal = PenaltyAppeal::create([
            'user_id' => $this->employee->id,
            'cycle_number' => 1,
            'explanation' => 'Immutability check appeal.',
            'letter_file_path' => 'penalties/appeals/immut.pdf',
            'letter_file_name' => 'immut.pdf',
            'letter_mime_type' => 'application/pdf',
            'letter_file_hash' => str_repeat('a', 64),
            'status' => 'pending',
        ]);

        $this->expectException(\Exception::class);
        $strike->delete();
    }

    public function test_penalty_appeals_block_hard_deletes(): void
    {
        $appeal = PenaltyAppeal::create([
            'user_id' => $this->employee->id,
            'cycle_number' => 1,
            'explanation' => 'Immutability check appeal.',
            'letter_file_path' => 'penalties/appeals/immut2.pdf',
            'letter_file_name' => 'immut2.pdf',
            'letter_mime_type' => 'application/pdf',
            'letter_file_hash' => str_repeat('a', 64),
            'status' => 'pending',
        ]);

        $this->expectException(\Exception::class);
        $appeal->delete();
    }
}
