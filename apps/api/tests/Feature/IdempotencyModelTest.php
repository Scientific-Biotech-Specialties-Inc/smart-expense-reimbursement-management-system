<?php

namespace Tests\Feature;

use App\Modules\Shared\Models\IdempotencyKey;
use App\Modules\Users\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IdempotencyModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_idempotency_key_record_with_fillable_attributes(): void
    {
        $user = User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@example.com',
            'role' => 'employee',
        ]);

        $key = IdempotencyKey::create([
            'user_id' => $user->id,
            'idempotency_key' => 'test-uuid-1234',
            'request_method' => 'POST',
            'request_path' => 'api/serms/cash-advances',
            'request_hash' => hash('sha256', 'POST|api/serms/cash-advances|{}'),
            'status' => 'pending',
            'expires_at' => now()->addHours(24),
        ]);

        $this->assertDatabaseHas('idempotency_keys', [
            'id' => $key->id,
            'idempotency_key' => 'test-uuid-1234',
            'status' => 'pending',
        ]);
        $this->assertEquals($user->id, $key->user_id);
    }

    public function test_enforces_unique_constraint_on_user_id_and_idempotency_key(): void
    {
        $user = User::create([
            'name' => 'Maria Santos',
            'email' => 'maria@example.com',
            'role' => 'employee',
        ]);

        IdempotencyKey::create([
            'user_id' => $user->id,
            'idempotency_key' => 'duplicate-key-xyz',
            'request_method' => 'POST',
            'request_path' => 'api/serms/reimbursements',
            'request_hash' => 'hash1',
            'status' => 'pending',
            'expires_at' => now()->addHours(24),
        ]);

        $this->expectException(QueryException::class);

        IdempotencyKey::create([
            'user_id' => $user->id,
            'idempotency_key' => 'duplicate-key-xyz',
            'request_method' => 'POST',
            'request_path' => 'api/serms/reimbursements',
            'request_hash' => 'hash2',
            'status' => 'pending',
            'expires_at' => now()->addHours(24),
        ]);
    }
}
