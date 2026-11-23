<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\AuditLogs\Models\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

class ReimbursementPasswordVerificationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $approver;
    private User $employee;
    private Reimbursement $reimbursement;

    protected function setUp(): void
    {
        parent::setUp();

        // Create Admin User
        $this->admin = User::create([
            'email' => 'admin@serms.com',
            'name' => 'Alex Reyes',
            'role' => 'admin',
            'grade' => 'EXEC',
            'department' => 'ACCOUNTING',
        ]);

        // Create Approver User
        $this->approver = User::create([
            'email' => 'approver@serms.com',
            'name' => 'Sarah Connor',
            'role' => 'approver',
            'grade' => 'L3',
            'department' => 'ACCOUNTING',
        ]);

        // Create Employee User
        $this->employee = User::create([
            'email' => 'employee@serms.com',
            'name' => 'John Santos',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'SALES',
        ]);

        // Seed a pending reimbursement claim owned by standard employee
        $this->reimbursement = Reimbursement::create([
            'user_id' => $this->employee->id,
            'description' => 'Travel Expense',
            'category' => 'Travel',
            'amount' => 1250.00,
            'date' => '2026-06-01',
            'status' => 'submitted',
            'submitted_by_name' => $this->employee->name,
        ]);
    }

    public function test_admin_can_approve_reimbursement_with_correct_password(): void
    {
        // Fake the password verification call to external auth module
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => 'admin',
            'department' => 'ACCOUNTING',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$this->reimbursement->id}/approve", [
            'password' => 'correct-password',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'approved');

        // Check if DB was updated
        $this->reimbursement->refresh();
        $this->assertEquals('approved', $this->reimbursement->status);

        // Assert audit log was recorded
        $this->assertTrue(AuditLog::where('action_type', 'CLAIM_APPROVED')
            ->where('entity_type', 'reimbursement')
            ->where('entity_id', $this->reimbursement->id)
            ->where('actor_id', $this->admin->id)
            ->exists());
    }

    public function test_admin_cannot_approve_reimbursement_with_incorrect_password(): void
    {
        // Fake the password verification to fail
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => false], 200),
        ]);

        $token = $this->generateMockToken([
            'email' => $this->admin->email,
            'role' => 'admin',
            'department' => 'ACCOUNTING',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$this->reimbursement->id}/approve", [
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['password']);

        // Check if DB was NOT updated
        $this->reimbursement->refresh();
        $this->assertEquals('submitted', $this->reimbursement->status);

        // Assert audit log was NOT recorded
        $this->assertFalse(AuditLog::where('action_type', 'CLAIM_APPROVED')
            ->where('entity_id', $this->reimbursement->id)
            ->exists());
    }

    public function test_approver_can_reject_reimbursement_with_correct_password_and_comment(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $token = $this->generateMockToken([
            'email' => $this->approver->email,
            'role' => 'approver',
            'department' => 'ACCOUNTING',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$this->reimbursement->id}/reject", [
            'password' => 'correct-password',
            'comment' => 'Missing original receipt attachment.',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.status', 'rejected');

        $this->reimbursement->refresh();
        $this->assertEquals('rejected', $this->reimbursement->status);
        $this->assertEquals('Missing original receipt attachment.', $this->reimbursement->rejection_comment);

        // Assert audit log was recorded
        $this->assertTrue(AuditLog::where('action_type', 'CLAIM_REJECTED')
            ->where('entity_type', 'reimbursement')
            ->where('entity_id', $this->reimbursement->id)
            ->where('actor_id', $this->approver->id)
            ->exists());
    }

    public function test_approver_cannot_reject_reimbursement_with_incorrect_password(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => false], 200),
        ]);

        $token = $this->generateMockToken([
            'email' => $this->approver->email,
            'role' => 'approver',
            'department' => 'ACCOUNTING',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$this->reimbursement->id}/reject", [
            'password' => 'wrong-password',
            'comment' => 'Missing original receipt attachment.',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['password']);

        $this->reimbursement->refresh();
        $this->assertEquals('submitted', $this->reimbursement->status);
    }

    public function test_reject_requires_comment_of_min_5_characters(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $token = $this->generateMockToken([
            'email' => $this->approver->email,
            'role' => 'approver',
            'department' => 'ACCOUNTING',
        ]);

        // Missing comment and missing password
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$this->reimbursement->id}/reject", [
            'comment' => 'Bad', // too short
            'password' => 'password',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['comment']);
    }

    public function test_reject_rejects_comment_exceeding_255_characters(): void
    {
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        $token = $this->generateMockToken([
            'email' => $this->approver->email,
            'role' => 'approver',
            'department' => 'ACCOUNTING',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$this->reimbursement->id}/reject", [
            'comment' => str_repeat('a', 256), // too long
            'password' => 'password',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['comment']);
    }

    public function test_self_approval_is_forbidden(): void
    {
        // Fake password verification as correct
        Http::fake([
            '*/api/verify-password' => Http::response(['valid' => true], 200),
        ]);

        // John Santos trying to self-approve
        $token = $this->generateMockToken([
            'email' => $this->employee->email,
            'role' => 'approver',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson("/api/reimbursements/{$this->reimbursement->id}/approve", [
            'password' => 'correct-password',
        ]);

        $response->assertStatus(403);
        $response->assertJsonPath('message', 'Conflict. Self-approval is strictly prohibited.');
    }
}
