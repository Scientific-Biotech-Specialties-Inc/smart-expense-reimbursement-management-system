<?php

namespace Tests\Feature;

use App\Modules\Shared\Models\IdempotencyKey;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IdempotencyPruneCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_prunes_expired_records_while_preserving_active_ones(): void
    {
        // Expired record
        IdempotencyKey::create([
            'user_id' => 1,
            'idempotency_key' => 'expired-key-1',
            'request_method' => 'POST',
            'request_path' => 'api/test',
            'request_hash' => 'hash1',
            'status' => 'completed',
            'expires_at' => now()->subMinutes(10),
        ]);

        // Active record
        IdempotencyKey::create([
            'user_id' => 1,
            'idempotency_key' => 'active-key-2',
            'request_method' => 'POST',
            'request_path' => 'api/test',
            'request_hash' => 'hash2',
            'status' => 'completed',
            'expires_at' => now()->addHours(12),
        ]);

        $this->artisan('idempotency:prune')
            ->assertExitCode(0);

        $this->assertDatabaseMissing('idempotency_keys', [
            'idempotency_key' => 'expired-key-1',
        ]);

        $this->assertDatabaseHas('idempotency_keys', [
            'idempotency_key' => 'active-key-2',
        ]);
    }
}
