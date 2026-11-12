<?php

namespace Tests\Feature;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('supabase');

        $this->employee = User::create([
            'auth_id' => 101,
            'name' => 'Sara Smith',
            'first_name' => 'Sara',
            'last_name' => 'Smith',
            'email' => 'sara.smith@sbsi.com',
            'role' => 'employee',
            'department' => 'Operations',
            'grade' => 'L2',
            'contact_number' => '+63 917 123 4567',
        ]);

        $this->admin = User::create([
            'auth_id' => 102,
            'name' => 'Admin User',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'admin@sbsi.com',
            'role' => 'admin',
            'department' => 'Accounting',
            'grade' => 'L5',
            'contact_number' => '+63 918 987 6543',
        ]);
    }

    public function test_user_model_exposes_employee_id_and_profile_attributes(): void
    {
        $user = User::create([
            'auth_id' => 42,
            'name' => 'Sara Smith',
            'first_name' => 'Sara',
            'middle_name' => 'Marie',
            'last_name' => 'Smith',
            'email' => 'sara.m.smith@sbsi.com',
            'role' => 'employee',
            'department' => 'Operations',
            'grade' => 'L2',
            'contact_number' => '+63 917 123 4567',
            'avatar' => 'avatars/user-42.png',
            'signature' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'signature_path' => 'signatures/user-42.png',
        ]);

        $array = $user->toArray();

        $this->assertSame('EMP-0042', $array['employee_id']);
        $this->assertSame('Sara', $array['first_name']);
        $this->assertSame('Marie', $array['middle_name']);
        $this->assertSame('Smith', $array['last_name']);
        $this->assertSame('+63 917 123 4567', $array['contact_number']);
        $this->assertTrue($array['has_signature']);
        $this->assertNotNull($array['avatar_url']);
        $this->assertStringContainsString('avatars/user-42.png', $array['avatar_url']);
    }

    public function test_get_profile_returns_authenticated_user_details(): void
    {
        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->getJson('/api/profile');

        $response->assertOk()
            ->assertJsonPath('id', $this->employee->id)
            ->assertJsonPath('email', 'sara.smith@sbsi.com')
            ->assertJsonPath('first_name', 'Sara')
            ->assertJsonPath('last_name', 'Smith')
            ->assertJsonPath('role', 'employee')
            ->assertJsonPath('department', 'Operations')
            ->assertJsonPath('employee_id', 'EMP-0101');
    }

    public function test_update_profile_saves_name_and_contact_and_keeps_email_and_role_readonly(): void
    {
        Http::fake([
            '*/api/me/profile' => Http::response(['message' => 'Profile details updated successfully.'], 200),
        ]);

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->putJson('/api/profile', [
                'first_name' => 'Sara Jane',
                'middle_name' => 'Cruz',
                'last_name' => 'Smith-Doe',
                'contact_number' => '+63 919 555 4321',
                // Maliciously attempt to override read-only email and role
                'email' => 'hacked@sbsi.com',
                'role' => 'admin',
            ]);

        $response->assertOk()
            ->assertJsonPath('user.first_name', 'Sara Jane')
            ->assertJsonPath('user.middle_name', 'Cruz')
            ->assertJsonPath('user.last_name', 'Smith-Doe')
            ->assertJsonPath('user.name', 'Sara Jane Cruz Smith-Doe')
            ->assertJsonPath('user.contact_number', '+63 919 555 4321')
            ->assertJsonPath('user.email', 'sara.smith@sbsi.com') // unchanged
            ->assertJsonPath('user.role', 'employee'); // unchanged

        $this->assertDatabaseHas('users', [
            'id' => $this->employee->id,
            'name' => 'Sara Jane Cruz Smith-Doe',
            'first_name' => 'Sara Jane',
            'middle_name' => 'Cruz',
            'last_name' => 'Smith-Doe',
            'contact_number' => '+63 919 555 4321',
            'email' => 'sara.smith@sbsi.com',
            'role' => 'employee',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'action_type' => 'PROFILE_UPDATED',
        ]);
    }

    public function test_update_profile_validates_required_name_and_contact_format(): void
    {
        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->putJson('/api/profile', [
                'first_name' => '',
                'last_name' => '',
                'contact_number' => 'invalid-phone',
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name', 'contact_number']);
    }

    public function test_upload_and_remove_profile_photo_stores_in_supabase_and_logs_audit(): void
    {
        $file = UploadedFile::fake()->image('avatar.png', 200, 200);

        $uploadResponse = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/profile/photo', [
                'photo' => $file,
            ]);

        $uploadResponse->assertOk()
            ->assertJsonPath('message', 'Profile photo updated successfully.');

        $this->employee->refresh();
        $this->assertNotNull($this->employee->avatar);
        $this->assertTrue(Storage::disk('supabase')->exists($this->employee->avatar));

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'action_type' => 'PROFILE_PHOTO_UPDATED',
        ]);

        // Remove photo
        $removeResponse = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->deleteJson('/api/profile/photo');

        $removeResponse->assertOk()
            ->assertJsonPath('message', 'Profile photo removed.');

        $this->employee->refresh();
        $this->assertNull($this->employee->avatar);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'action_type' => 'PROFILE_PHOTO_REMOVED',
        ]);
    }

    public function test_upload_profile_photo_rejects_non_image_or_oversized_file(): void
    {
        $pdfFile = UploadedFile::fake()->create('doc.pdf', 500, 'application/pdf');

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/profile/photo', [
                'photo' => $pdfFile,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['photo']);
    }

    public function test_save_and_remove_signature_stores_hybrid_base64_and_supabase_file(): void
    {
        $validPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        $saveResponse = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/profile/signature', [
                'signature' => $validPngBase64,
            ]);

        $saveResponse->assertOk()
            ->assertJsonPath('message', 'Signature saved to your profile.');

        $this->employee->refresh();
        $this->assertSame($validPngBase64, $this->employee->signature);
        $this->assertNotNull($this->employee->signature_path);
        $this->assertTrue(Storage::disk('supabase')->exists($this->employee->signature_path));

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'action_type' => 'SIGNATURE_UPDATED',
        ]);

        // Remove signature
        $removeResponse = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->deleteJson('/api/profile/signature');

        $removeResponse->assertOk()
            ->assertJsonPath('message', 'Saved signature removed.');

        $this->employee->refresh();
        $this->assertNull($this->employee->signature);
        $this->assertNull($this->employee->signature_path);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'action_type' => 'SIGNATURE_REMOVED',
        ]);
    }

    public function test_change_password_validates_rules_and_proxies_to_auth_module(): void
    {
        // 1. Validation failure (password too short, no special character)
        $invalidResponse = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->postJson('/api/profile/password', [
                'current_password' => 'oldpassword',
                'new_password' => 'short1',
                'new_password_confirmation' => 'short1',
            ]);

        $invalidResponse->assertStatus(422)
            ->assertJsonValidationErrors(['new_password']);

        // 2. Successful change with valid complex password
        Http::fake([
            '*/api/encryption-key' => Http::response(['public_key' => null, 'key_id' => null], 200),
            '*/api/me/password' => Http::response(['message' => 'Password has been successfully updated.'], 200),
        ]);

        $validResponse = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->withHeaders(['Authorization' => 'Bearer test-token'])
            ->postJson('/api/profile/password', [
                'current_password' => 'OldPassword123!',
                'new_password' => 'NewPassword2026!#',
                'new_password_confirmation' => 'NewPassword2026!#',
            ]);

        $validResponse->assertOk()
            ->assertJsonPath('message', 'Password changed successfully.');

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $this->employee->id,
            'action_type' => 'PASSWORD_CHANGED',
        ]);
    }

    public function test_profile_activity_returns_only_logged_in_user_logins_and_account_changes(): void
    {
        // Employee activity
        AuditLogService::log($this->employee->id, 'employee', 'USER_LOGIN', 'user', $this->employee->id, null, ['login' => 'ok']);
        AuditLogService::log($this->employee->id, 'employee', 'PROFILE_UPDATED', 'user', $this->employee->id, ['name' => 'Old'], ['name' => 'New']);

        // Admin activity (should NOT be returned in employee activity)
        AuditLogService::log($this->admin->id, 'admin', 'USER_LOGIN', 'user', $this->admin->id, null, ['login' => 'admin']);

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($this->employee)
            ->getJson('/api/profile/activity');

        $response->assertOk()
            ->assertJsonStructure([
                'last_login_at',
                'recent_logins',
                'account_changes',
            ]);

        $recentLogins = $response->json('recent_logins');
        $this->assertCount(1, $recentLogins);
        $this->assertSame('USER_LOGIN', $recentLogins[0]['action_type']);

        $accountChanges = $response->json('account_changes');
        $this->assertCount(1, $accountChanges);
        $this->assertSame('PROFILE_UPDATED', $accountChanges[0]['action_type']);
    }

    public function test_updating_user_with_virtual_permissions_and_is_admin_does_not_fail_sql(): void
    {
        $user = $this->employee;
        $user->permissions = ['serms.reimbursements.manage', 'serms.cash_advances.manage'];
        $user->is_admin = true;
        $user->setAttribute('permissions', ['serms.reimbursements.manage']);
        $user->setAttribute('is_admin', true);

        // Upload photo through service / controller without SQL column errors
        $file = UploadedFile::fake()->image('avatar.png', 200, 200);

        $response = $this
            ->withoutMiddleware(\App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class)
            ->actingAs($user)
            ->postJson('/api/profile/photo', [
                'photo' => $file,
            ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Profile photo updated successfully.');

        $this->assertNotNull($user->fresh()->avatar);
    }
}
