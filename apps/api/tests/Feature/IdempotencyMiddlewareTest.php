<?php

namespace Tests\Feature;

use App\Modules\Shared\Http\Middleware\EnsureIdempotency;
use App\Modules\Shared\Models\IdempotencyKey;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class IdempotencyMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(EnsureIdempotency::class)->group(function () {
            Route::get('/test/idempotency/read', function () {
                return response()->json(['message' => 'read ok']);
            });

            Route::post('/test/idempotency/mutate', function (Request $request) {
                return response()->json([
                    'message' => 'created ok',
                    'item' => $request->input('item', 'default'),
                ], 201);
            });
        });
    }

    public function test_safe_get_method_passes_through_without_creating_ledger_entry(): void
    {
        $response = $this->getJson('/test/idempotency/read', [
            'X-Idempotency-Key' => 'key-get-123',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['message' => 'read ok']);
        $this->assertDatabaseCount('idempotency_keys', 0);
    }

    public function test_first_pass_mutating_request_creates_completed_ledger_record(): void
    {
        $user = User::create([
            'name' => 'Juan Dela Cruz',
            'email' => 'juan.middleware@example.com',
            'role' => 'employee',
        ]);

        $response = $this->actingAs($user)->postJson('/test/idempotency/mutate', [
            'item' => 'desk',
        ], [
            'X-Idempotency-Key' => 'key-mutate-001',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['message' => 'created ok', 'item' => 'desk']);

        $this->assertDatabaseHas('idempotency_keys', [
            'user_id' => $user->id,
            'idempotency_key' => 'key-mutate-001',
            'request_method' => 'POST',
            'status' => 'completed',
            'response_status' => 201,
        ]);
    }

    public function test_replaying_request_with_same_key_and_payload_returns_cached_response_and_replay_header(): void
    {
        $user = User::create([
            'name' => 'Ana Reyes',
            'email' => 'ana.replay@example.com',
            'role' => 'employee',
        ]);

        // Pass 1: Initial call
        $first = $this->actingAs($user)->postJson('/test/idempotency/mutate', [
            'item' => 'monitor',
        ], [
            'X-Idempotency-Key' => 'key-replay-100',
        ]);

        $first->assertStatus(201);
        $first->assertJson(['message' => 'created ok', 'item' => 'monitor']);
        $first->assertHeaderMissing('X-Idempotent-Replay');

        // Pass 2: Replay call
        $second = $this->actingAs($user)->postJson('/test/idempotency/mutate', [
            'item' => 'monitor',
        ], [
            'X-Idempotency-Key' => 'key-replay-100',
        ]);

        $second->assertStatus(201);
        $second->assertJson(['message' => 'created ok', 'item' => 'monitor']);
        $second->assertHeader('X-Idempotent-Replay', 'true');

        // Verify only 1 completed record exists in database
        $this->assertDatabaseCount('idempotency_keys', 1);
    }

    public function test_reusing_key_with_different_payload_returns_422_unprocessable_entity(): void
    {
        $user = User::create([
            'name' => 'Carlos Diaz',
            'email' => 'carlos.mismatch@example.com',
            'role' => 'employee',
        ]);

        // Pass 1
        $this->actingAs($user)->postJson('/test/idempotency/mutate', [
            'item' => 'chair',
        ], [
            'X-Idempotency-Key' => 'key-mismatch-200',
        ])->assertStatus(201);

        // Pass 2 with altered payload
        $second = $this->actingAs($user)->postJson('/test/idempotency/mutate', [
            'item' => 'standing-desk',
        ], [
            'X-Idempotency-Key' => 'key-mismatch-200',
        ]);

        $second->assertStatus(422);
        $second->assertJson([
            'message' => 'Idempotency key reused with different request payload.',
        ]);
    }

    public function test_concurrent_request_hitting_pending_status_returns_409_conflict(): void
    {
        $user = User::create([
            'name' => 'Elena Cruz',
            'email' => 'elena.pending@example.com',
            'role' => 'employee',
        ]);

        IdempotencyKey::create([
            'user_id' => $user->id,
            'idempotency_key' => 'key-pending-300',
            'request_method' => 'POST',
            'request_path' => 'test/idempotency/mutate',
            'request_hash' => hash('sha256', 'POST|test/idempotency/mutate|{"item":"laptop"}'),
            'status' => 'pending',
            'expires_at' => now()->addHours(24),
        ]);

        $response = $this->actingAs($user)->postJson('/test/idempotency/mutate', [
            'item' => 'laptop',
        ], [
            'X-Idempotency-Key' => 'key-pending-300',
        ]);

        $response->assertStatus(409);
        $response->assertJson([
            'message' => 'A request with this idempotency key is currently processing. Please wait.',
        ]);
    }
}
