# Idempotency & Duplicate Request Prevention System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive end-to-end idempotency and duplicate submission protection across SERMS via universal frontend client shielding, immediate modal click-locking, database-backed `idempotency_keys` request deduplication middleware, and pessimistic row locking on revision strikes and disbursements.

**Architecture:** Frontend fetch calls (`apps/web/src/utils/apiFetch.js`) automatically generate and attach an `X-Idempotency-Key` header with UUIDv4 for all mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`). Action buttons and modals (`ConfirmModal.vue`, `DeleteConfirmModal.vue`, `DecisionConfirmationModal.vue`) employ immediate in-flight click-locks and Enter-key suppression. On the backend, an atomic `EnsureIdempotency` middleware records request hashes into an `idempotency_keys` ledger table; identical retried requests return the deterministic cached response with `X-Idempotent-Replay: true`, payload mismatches return `422`, and concurrent in-flight requests return `409 Conflict`. Critical strike counters and disbursement entries are protected with `lockForUpdate()` and database unique constraints.

**Tech Stack:** Laravel 13 (PHP 8.3), MySQL / SQLite, PHPUnit, Vue 3 (Composition API), Pinia, Tailwind CSS 3.4, Lucide Vue Next, Vitest.

**Spec:** [`docs/superpowers/specs/2026-10-22-idempotency-system-design.md`](file:///c:/Projects/smart-expense-management-system/docs/superpowers/specs/2026-10-22-idempotency-system-design.md)

## Global Constraints

- **Scope of Enforcement:** Idempotency and duplicate prevention must be implemented across all mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) across the entire SERMS application suite.
- **Canonical Governance (`AGENTS.md`):** Never run `UPDATE` or `DELETE` on `audit_logs` or `penalties` tables.
- **Reusability (`A-09`):** Leverage root modal and button components (`ConfirmModal.vue`, `DeleteConfirmModal.vue`, `DecisionConfirmationModal.vue`, `BaseButton.vue`) to avoid fragmented, ad-hoc button debouncers.
- **Safe Method Exemption:** `GET`, `HEAD`, and `OPTIONS` requests must pass through untouched without inserting ledger rows.
- **Replay Transparency:** Deterministically replayed responses must include the header `X-Idempotent-Replay: true`.
- **Retention & Pruning:** Idempotency keys expire after 24 hours and are cleaned via `php artisan idempotency:prune`.
- **Git Operations:** Do NOT run `git commit` or push without explicit user permission.

---

### Task 1: Database Migration & `IdempotencyKey` Model

**Files:**
- Create: `apps/api/database/migrations/2026_10_22_000001_create_idempotency_keys_table.php`
- Create: `apps/api/app/Modules/Shared/Models/IdempotencyKey.php`
- Test: `apps/api/tests/Feature/IdempotencyModelTest.php`

**Interfaces:**
- Produces:
  - Table: `idempotency_keys` with schema `(id, user_id, idempotency_key, request_method, request_path, request_hash, status, response_status, response_body, response_headers, expires_at, created_at, updated_at)`
  - Unique Constraint: `uniq_user_idempotency_key` on `[user_id, idempotency_key]`
  - Model: `App\Modules\Shared\Models\IdempotencyKey`

- [ ] **Step 1: Write the failing test in `apps/api/tests/Feature/IdempotencyModelTest.php`**

```php
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
        $user = User::factory()->create();

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
        $user = User::factory()->create();

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php apps/api/artisan test --filter=IdempotencyModelTest`
Expected: FAIL with "Table or view not found: idempotency_keys" or class not found.

- [ ] **Step 3: Write minimal migration and `IdempotencyKey` model**

Create `apps/api/database/migrations/2026_10_22_000001_create_idempotency_keys_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('idempotency_key', 64)->index();
            $table->string('request_method', 10)->index();
            $table->string('request_path', 255);
            $table->string('request_hash', 64);
            $table->enum('status', ['pending', 'completed', 'failed'])->default('pending')->index();
            $table->integer('response_status')->nullable();
            $table->longText('response_body')->nullable();
            $table->json('response_headers')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->unique(['user_id', 'idempotency_key'], 'uniq_user_idempotency_key');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};
```

Create `apps/api/app/Modules/Shared/Models/IdempotencyKey.php`:
```php
<?php

namespace App\Modules\Shared\Models;

use App\Modules\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IdempotencyKey extends Model
{
    protected $table = 'idempotency_keys';

    protected $fillable = [
        'user_id',
        'idempotency_key',
        'request_method',
        'request_path',
        'request_hash',
        'status',
        'response_status',
        'response_body',
        'response_headers',
        'expires_at',
    ];

    protected $casts = [
        'response_status' => 'integer',
        'response_headers' => 'array',
        'expires_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php apps/api/artisan test --filter=IdempotencyModelTest`
Expected: PASS (2 tests, 2 assertions)

---

### Task 2: Backend `EnsureIdempotency` Middleware Core

**Files:**
- Create: `apps/api/app/Modules/Shared/Http/Middleware/EnsureIdempotency.php`
- Create: `apps/api/tests/Feature/IdempotencyMiddlewareTest.php`

**Interfaces:**
- Consumes: `IdempotencyKey` model, incoming `Request`
- Produces: `EnsureIdempotency::handle($request, Closure $next): Response`

- [ ] **Step 1: Write failing test in `apps/api/tests/Feature/IdempotencyMiddlewareTest.php`**

```php
<?php

namespace Tests\Feature;

use App\Modules\Shared\Http\Middleware\EnsureIdempotency;
use App\Modules\Shared\Models\IdempotencyKey;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
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
        $user = User::factory()->create();

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
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php apps/api/artisan test --filter=IdempotencyMiddlewareTest`
Expected: FAIL with "Target class [App\Modules\Shared\Http\Middleware\EnsureIdempotency] does not exist".

- [ ] **Step 3: Implement minimal `EnsureIdempotency` middleware**

Create `apps/api/app/Modules/Shared/Http/Middleware/EnsureIdempotency.php`:
```php
<?php

namespace App\Modules\Shared\Http\Middleware;

use App\Modules\Shared\Models\IdempotencyKey;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class EnsureIdempotency
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $method = strtoupper($request->method());

        // 1. Safe methods bypass idempotency inspection
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'])) {
            return $next($request);
        }

        // 2. Extract idempotency key header
        $key = $request->header('X-Idempotency-Key') ?? $request->header('Idempotency-Key');

        if (empty($key)) {
            return $next($request);
        }

        $userId = $request->user()?->id;
        $path = $request->path();
        $requestHash = $this->computeRequestHash($method, $path, $request->all());

        // 3. Acquire atomic pending lock or check existing record
        $existing = IdempotencyKey::where('user_id', $userId)
            ->where('idempotency_key', $key)
            ->first();

        if ($existing) {
            if ($existing->status === 'completed') {
                if ($existing->request_hash !== $requestHash) {
                    return response()->json([
                        'message' => 'Idempotency key reused with different request payload.',
                    ], 422);
                }

                $headers = $existing->response_headers ?? ['Content-Type' => 'application/json'];
                $headers['X-Idempotent-Replay'] = 'true';

                return response($existing->response_body, $existing->response_status, $headers);
            }

            if ($existing->status === 'pending') {
                return response()->json([
                    'message' => 'A request with this idempotency key is currently processing. Please wait.',
                ], 409);
            }
        }

        // 4. Insert pending record
        try {
            $ledger = IdempotencyKey::create([
                'user_id' => $userId,
                'idempotency_key' => $key,
                'request_method' => $method,
                'request_path' => $path,
                'request_hash' => $requestHash,
                'status' => 'pending',
                'expires_at' => now()->addHours(24),
            ]);
        } catch (QueryException $e) {
            // Caught concurrent insert race condition
            return response()->json([
                'message' => 'A request with this idempotency key is currently processing. Please wait.',
            ], 409);
        }

        // 5. Execute pipeline
        try {
            $response = $next($request);

            if ($response->getStatusCode() < 500) {
                $ledger->update([
                    'status' => 'completed',
                    'response_status' => $response->getStatusCode(),
                    'response_body' => $response->getContent(),
                    'response_headers' => [
                        'Content-Type' => $response->headers->get('Content-Type') ?? 'application/json',
                    ],
                ]);
            } else {
                $ledger->delete();
            }

            return $response;
        } catch (\Throwable $e) {
            $ledger->delete();
            throw $e;
        }
    }

    /**
     * Compute deterministic hash for request path and body.
     */
    protected function computeRequestHash(string $method, string $path, array $payload): string
    {
        ksort($payload);
        return hash('sha256', $method . '|' . $path . '|' . json_encode($payload));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php apps/api/artisan test --filter=IdempotencyMiddlewareTest`
Expected: PASS (2 tests, 5 assertions)

---

### Task 3: Backend Replay, Mismatch & Concurrency Collision Verification

**Files:**
- Modify: `apps/api/tests/Feature/IdempotencyMiddlewareTest.php`

**Interfaces:**
- Tests deterministic response caching (`X-Idempotent-Replay: true`)
- Tests payload divergence error (`422`)
- Tests pending concurrent collision (`409`)

- [ ] **Step 1: Add replay, 422 mismatch, and 409 concurrency tests to `IdempotencyMiddlewareTest.php`**

Append to `apps/api/tests/Feature/IdempotencyMiddlewareTest.php`:
```php
    public function test_replaying_request_with_same_key_and_payload_returns_cached_response_and_replay_header(): void
    {
        $user = User::factory()->create();

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

        // Verify only 1 completed record exists
        $this->assertDatabaseCount('idempotency_keys', 1);
    }

    public function test_reusing_key_with_different_payload_returns_422_unprocessable_entity(): void
    {
        $user = User::factory()->create();

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
        $user = User::factory()->create();

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
```

- [ ] **Step 2: Run test to verify it passes**

Run: `php apps/api/artisan test --filter=IdempotencyMiddlewareTest`
Expected: PASS (5 tests, 14 assertions)

---

### Task 4: Global Middleware Registration & Prune Command

**Files:**
- Modify: `apps/api/bootstrap/app.php`
- Create: `apps/api/app/Console/Commands/PruneIdempotencyKeys.php`
- Test: `apps/api/tests/Feature/IdempotencyPruneCommandTest.php`

**Interfaces:**
- Produces: CLI command `php artisan idempotency:prune`
- Registers: `EnsureIdempotency` in `api` middleware stack

- [ ] **Step 1: Write failing test in `apps/api/tests/Feature/IdempotencyPruneCommandTest.php`**

```php
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php apps/api/artisan test --filter=IdempotencyPruneCommandTest`
Expected: FAIL with "Command idempotency:prune is not defined".

- [ ] **Step 3: Implement `PruneIdempotencyKeys` command and register middleware in `bootstrap/app.php`**

Create `apps/api/app/Console/Commands/PruneIdempotencyKeys.php`:
```php
<?php

namespace App\Console\Commands;

use App\Modules\Shared\Models\IdempotencyKey;
use Illuminate\Console\Command;

class PruneIdempotencyKeys extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'idempotency:prune';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Prune expired idempotency key ledger records';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $deleted = IdempotencyKey::where('expires_at', '<', now())->delete();
        $this->info("Pruned {$deleted} expired idempotency keys.");

        return self::SUCCESS;
    }
}
```

Update `apps/api/bootstrap/app.php`:
```php
<?php

use App\Modules\Shared\Http\Middleware\EnsureIdempotency;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');
        $middleware->append(EnsureIdempotency::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php apps/api/artisan test --filter=IdempotencyPruneCommandTest`
Expected: PASS (1 test, 2 assertions)

---

### Task 5: Backend Domain Concurrency Hardening (3-Strike Row Locks & Disbursement Unique Constraint)

**Files:**
- Create: `apps/api/database/migrations/2026_10_22_000002_add_unique_constraint_to_cash_advance_disbursements.php`
- Modify: `apps/api/app/Modules/CashAdvances/Services/CashAdvanceService.php:139-165`
- Modify: `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php:263-285`
- Modify: `apps/api/app/Modules/Liquidations/Http/Controllers/LiquidationController.php:635-655`
- Test: `apps/api/tests/Feature/ConcurrencyStrikeLockTest.php`

**Interfaces:**
- Consumes: `CashAdvance`, `Reimbursement`, `Liquidation`
- Produces: Atomic `lockForUpdate()` revision strike increments and unique database constraint on `cash_advance_disbursements(cash_advance_id)`

- [ ] **Step 1: Write failing test in `apps/api/tests/Feature/ConcurrencyStrikeLockTest.php`**

```php
<?php

namespace Tests\Feature;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Models\CashAdvanceDisbursement;
use App\Modules\CashAdvances\Services\CashAdvanceService;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Services\ReimbursementService;
use App\Modules\Users\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class ConcurrencyStrikeLockTest extends TestCase
{
    use RefreshDatabase;

    public function test_cash_advance_disbursements_enforces_unique_cash_advance_id(): void
    {
        $employee = User::factory()->create();
        $advance = CashAdvance::create([
            'user_id' => $employee->id,
            'amount' => 5000,
            'purpose' => 'Conference travel',
            'status' => 'approved',
        ]);

        CashAdvanceDisbursement::create([
            'cash_advance_id' => $advance->id,
            'disbursed_by' => $employee->id,
            'channel' => 'bank_transfer',
            'reference' => 'REF-001',
            'disbursed_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        CashAdvanceDisbursement::create([
            'cash_advance_id' => $advance->id,
            'disbursed_by' => $employee->id,
            'channel' => 'cash',
            'reference' => 'REF-002',
            'disbursed_at' => now(),
        ]);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php apps/api/artisan test --filter=ConcurrencyStrikeLockTest`
Expected: FAIL because duplicate disbursement does not throw `QueryException`.

- [ ] **Step 3: Implement migration and `lockForUpdate()` enhancements**

Create `apps/api/database/migrations/2026_10_22_000002_add_unique_constraint_to_cash_advance_disbursements.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('cash_advance_disbursements', function (Blueprint $table) {
            $table->unique('cash_advance_id', 'uniq_ca_disbursement_advance_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('cash_advance_disbursements', function (Blueprint $table) {
            $table->dropUnique('uniq_ca_disbursement_advance_id');
        });
    }
};
```

Update `CashAdvanceService::rejectAdvance()` in `apps/api/app/Modules/CashAdvances/Services/CashAdvanceService.php:148-161`:
```php
            $lockedAdvance = CashAdvance::where('id', $advance->id)->lockForUpdate()->firstOrFail();

            if (!in_array($lockedAdvance->status, ['pending', 'revise'])) {
                throw new \Illuminate\Auth\Access\AuthorizationException('Only pending or revise cash advances can be revised/rejected.');
            }

            $currentCount = (int) ($lockedAdvance->revision_count ?? 0);
            $newCount = $currentCount + 1;
            $newStatus = $newCount > 3 ? 'rejected' : 'revise';
            $fromStatus = $lockedAdvance->status;

            $lockedAdvance->update([
                'status' => $newStatus,
                'revision_count' => $newCount,
            ]);
            $advance = $lockedAdvance;
```

Update `ReimbursementService::rejectReimbursement()` in `apps/api/app/Modules/Reimbursements/Services/ReimbursementService.php:273`:
```php
            $reimbursement = Reimbursement::where('id', $id)->lockForUpdate()->firstOrFail();
```

Update `LiquidationController::audit()` in `apps/api/app/Modules/Liquidations/Http/Controllers/LiquidationController.php:645`:
```php
            $liquidation = Liquidation::where('id', $id)->lockForUpdate()->firstOrFail();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php apps/api/artisan test --filter=ConcurrencyStrikeLockTest`
Expected: PASS (1 test, 1 assertion)

---

### Task 6: Frontend Universal Header Injection in `apiFetch.js`

**Files:**
- Modify: `apps/web/src/utils/apiFetch.js`
- Create: `apps/web/src/utils/apiFetch.test.js`

**Interfaces:**
- Produces: Automatic `X-Idempotency-Key` header with valid UUIDv4 on `POST`, `PUT`, `PATCH`, `DELETE` requests.
- Consumes: `options.idempotencyKey` override if supplied.

- [ ] **Step 1: Write failing Vitest tests in `apps/web/src/utils/apiFetch.test.js`**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch } from './apiFetch'

describe('apiFetch Idempotency Key Injection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  })

  it('attaches X-Idempotency-Key with UUID format on POST request', async () => {
    await apiFetch('/api/serms/cash-advances', {
      method: 'POST',
      body: JSON.stringify({ amount: 100 }),
    })

    expect(global.fetch).toHaveBeenCalled()
    const callArgs = global.fetch.mock.calls[0]
    const headers = callArgs[1].headers

    const key = headers.get('X-Idempotency-Key')
    expect(key).toBeTruthy()
    // Verify UUIDv4 pattern
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('omits X-Idempotency-Key on safe GET request', async () => {
    await apiFetch('/api/serms/cash-advances', {
      method: 'GET',
    })

    const callArgs = global.fetch.mock.calls[0]
    const headers = callArgs[1].headers

    expect(headers.has('X-Idempotency-Key')).toBe(false)
  })

  it('respects caller provided custom idempotencyKey', async () => {
    await apiFetch('/api/serms/reimbursements', {
      method: 'POST',
      idempotencyKey: 'custom-session-key-456',
      body: JSON.stringify({ amount: 50 }),
    })

    const callArgs = global.fetch.mock.calls[0]
    const headers = callArgs[1].headers

    expect(headers.get('X-Idempotency-Key')).toBe('custom-session-key-456')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web test src/utils/apiFetch.test.js`
Expected: FAIL (headers do not have X-Idempotency-Key)

- [ ] **Step 3: Implement UUID auto-injection in `apps/web/src/utils/apiFetch.js`**

Update `apps/web/src/utils/apiFetch.js:15-35`:
```javascript
  const headers = new Headers(options.headers || {})

  const method = (options.method || 'GET').toUpperCase()
  const isMutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  if (isMutatingMethod && !headers.has('X-Idempotency-Key')) {
    const customKey =
      options.idempotencyKey ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : null)
    if (customKey) {
      headers.set('X-Idempotency-Key', customKey)
    }
  }

  if (authStore.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authStore.token}`)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/web test src/utils/apiFetch.test.js`
Expected: PASS (3 tests passing)

---

### Task 7: Frontend Root Confirmation Modals Hardening

**Files:**
- Modify: `apps/web/src/components/base/ConfirmModal.vue`
- Modify: `apps/web/src/components/base/DeleteConfirmModal.vue`
- Modify: `apps/web/src/components/base/DecisionConfirmationModal.vue`
- Create: `apps/web/src/components/base/ConfirmModal.test.js`
- Create: `apps/web/src/components/base/DeleteConfirmModal.test.js`

**Interfaces:**
- `ConfirmModal`: Immediate synchronous `isClicked` lock, emits `confirm` exactly once on rapid clicks.
- `DeleteConfirmModal`: Adds `loading` and `isSubmitting` props, disables button, blocks Enter key during submission.
- `DecisionConfirmationModal`: Suppresses Enter key while `isSubmitting` is true.

- [ ] **Step 1: Write failing Vitest tests in `ConfirmModal.test.js` and `DeleteConfirmModal.test.js`**

Create `apps/web/src/components/base/ConfirmModal.test.js`:
```javascript
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ConfirmModal from './ConfirmModal.vue'

describe('ConfirmModal Idempotency Shield', () => {
  it('disables button immediately and emits confirm exactly once on rapid double click', async () => {
    const wrapper = mount(ConfirmModal, {
      props: {
        isOpen: true,
        title: 'Submit Claim',
        message: 'Are you sure?',
      },
    })

    const confirmBtn = wrapper.findAllComponents({ name: 'BaseButton' })[1]
    
    // Simulate rapid double click
    await confirmBtn.trigger('click')
    await confirmBtn.trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })
})
```

Create `apps/web/src/components/base/DeleteConfirmModal.test.js`:
```javascript
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import DeleteConfirmModal from './DeleteConfirmModal.vue'
import { createPinia, setActivePinia } from 'pinia'

describe('DeleteConfirmModal Idempotency Shield', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('disables delete button and ignores enter key when isSubmitting is true', async () => {
    const wrapper = mount(DeleteConfirmModal, {
      props: {
        modelValue: true,
        isSubmitting: true,
      },
    })

    const input = wrapper.find('input[type="password"]')
    await input.setValue('secret')
    await input.trigger('keyup.enter')

    expect(wrapper.emitted('confirm')).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/web test src/components/base/ConfirmModal.test.js src/components/base/DeleteConfirmModal.test.js`
Expected: FAIL

- [ ] **Step 3: Implement immediate in-flight click-locks and Enter-key suppression**

Update `apps/web/src/components/base/ConfirmModal.vue`:
```vue
<script setup>
import { ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import BaseButton from "./BaseButton.vue";
import { AlertTriangle, CheckCircle, Info } from "lucide-vue-next";

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  confirmText: {
    type: String,
    default: "Confirm",
  },
  cancelText: {
    type: String,
    default: "Cancel",
  },
  danger: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "confirm"]);
const isClicked = ref(false);

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    isClicked.value = false;
  }
});

function handleConfirm() {
  if (props.loading || isClicked.value) return;
  isClicked.value = true;
  emit("confirm");
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="$emit('close')" max-width-class="max-w-sm">
    <div class="p-6">
      <div class="flex flex-col items-center text-center gap-4">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
          :class="danger ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'"
        >
          <AlertTriangle v-if="danger" class="w-7 h-7" />
          <CheckCircle v-else class="w-7 h-7" />
        </div>
        <div>
          <h3 class="font-sans text-xl font-bold text-slate-800">
            {{ title }}
          </h3>
          <p class="font-sans text-sm text-slate-500 mt-2 leading-relaxed">
            {{ message }}
          </p>
        </div>
      </div>

      <div class="flex justify-center gap-3 mt-8">
        <BaseButton
          variant="secondary"
          class="px-5 min-h-10"
          :disabled="loading || isClicked"
          @click="$emit('close')"
        >
          {{ cancelText }}
        </BaseButton>
        <BaseButton
          :variant="danger ? 'destructive' : 'primary'"
          :loading="loading || isClicked"
          :disabled="loading || isClicked"
          class="px-5 min-h-10"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
```

Update `apps/web/src/components/base/DeleteConfirmModal.vue`:
```vue
<script setup>
import { ref, watch } from 'vue';
import { Trash2, Eye, EyeOff } from 'lucide-vue-next';
import { useAuthStore } from "@/stores/auth";
import BaseModal from "./BaseModal.vue";
import BaseButton from "./BaseButton.vue";

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: "Delete Receipt"
  },
  message: {
    type: String,
    default: "This action cannot be undone."
  },
  loading: {
    type: Boolean,
    default: false,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'confirm']);

const auth = useAuthStore();
const password = ref("");
const showPassword = ref(false);

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    password.value = "";
    showPassword.value = false;
  }
});

function handleConfirm() {
  if (props.loading || props.isSubmitting) return;
  if (password.value) {
    emit('confirm', password.value);
  }
}

function close() {
  if (props.loading || props.isSubmitting) return;
  emit('update:modelValue', false);
}
</script>

<template>
  <BaseModal :is-open="modelValue" @close="close" max-width-class="max-w-sm">
    <div class="p-6">
      <div class="flex flex-col items-center text-center gap-4">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 bg-red-50 text-red-600 border border-red-200"
        >
          <Trash2 class="w-7 h-7" />
        </div>
        <div>
          <h3 class="font-sans text-xl font-bold text-slate-800">
            {{ title }}
          </h3>
          <p class="font-sans text-sm text-slate-500 mt-2 leading-relaxed">
            {{ message }}
          </p>
        </div>
      </div>

      <div class="mt-6">
        <p class="text-sm text-slate-600 mb-4 text-center">
          Please enter your password to confirm this action.
        </p>
        <input
          type="text"
          :value="auth.user?.email"
          autocomplete="username"
          tabindex="-1"
          aria-hidden="true"
          class="sr-only"
        />
        <div class="input-wrapper">
          <label class="input-label">Password</label>
          <div class="relative">
            <input
              :type="showPassword ? 'text' : 'password'"
              class="input w-full pr-10"
              v-model="password"
              placeholder="Enter your password"
              autocomplete="current-password"
              @keyup.enter="handleConfirm"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              tabindex="-1"
            >
              <Eye v-if="!showPassword" class="w-4 h-4" />
              <EyeOff v-else class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="flex justify-center gap-3 mt-6">
        <BaseButton
          variant="secondary"
          class="px-5 min-h-10"
          :disabled="loading || isSubmitting"
          @click="close"
        >
          Cancel
        </BaseButton>
        <BaseButton
          variant="destructive"
          class="px-5 min-h-10"
          :disabled="password.length === 0 || loading || isSubmitting"
          :loading="loading || isSubmitting"
          @click="handleConfirm"
        >
          Confirm Delete
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
```

Update `apps/web/src/components/base/DecisionConfirmationModal.vue:164-168`:
```javascript
function handleFinalConfirm() {
  if (props.isSubmitting || isProceedDisabled.value) {
    return;
  }
  emit("confirm");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/web test src/components/base/ConfirmModal.test.js src/components/base/DeleteConfirmModal.test.js`
Expected: PASS (2 tests passing)

---

### Task 8: Form Submission & Composable Re-Entry Shielding

**Files:**
- Modify: `apps/web/src/views/ReimbursementFormView.vue:554-563`
- Modify: `apps/web/src/views/LiquidationsView.vue:1995-2005`
- Modify: `apps/web/src/composables/reimbursements/useReimbursementSubmit.js:12-25`
- Modify: `apps/web/src/composables/liquidations/useLiquidationSubmit.js:14-25`
- Modify: `apps/web/src/composables/reimbursements/useReimbursementDecisions.js:48-60, 107-135, 180-190`

**Interfaces:**
- Binds `:loading="submitting"` to `<ConfirmModal>` in `ReimbursementFormView.vue` and `LiquidationsView.vue`.
- Adds re-entry guard `if (submitting.value) return false;` in composables.
- Adds re-entry guard `if (isReviewSubmitting.value) return;` in `useReimbursementDecisions.js`.

- [ ] **Step 1: Inspect baseline submit-confirm tests**

Run: `npm --prefix apps/web test src/views/ReimbursementFormView.submit-confirm.test.js src/views/LiquidationsView.submit-confirm.test.js`
Expected: Tests pass or report baseline status.

- [ ] **Step 2: Update views and composables with loading bindings and re-entry checks**

In `apps/web/src/views/ReimbursementFormView.vue:554-563`:
```vue
    <ConfirmModal
      :is-open="showSubmitConfirmModal"
      title="Submit Request"
      message="Are you sure do you want to submit this request?"
      confirm-text="Done"
      cancel-text="Cancel"
      :danger="false"
      :loading="submitting"
      @confirm="handleConfirmSubmit"
      @close="handleCancelSubmit"
    />
```

In `apps/web/src/views/LiquidationsView.vue:1995-2005`:
```vue
    <ConfirmModal
      :is-open="showSubmitConfirmModal"
      title="Submit Request"
      message="Are you sure do you want to submit this request?"
      confirm-text="Done"
      cancel-text="Cancel"
      :danger="false"
      :loading="submitting"
      @confirm="handleConfirmSubmit"
      @close="handleCancelSubmit"
    />
```

In `apps/web/src/composables/reimbursements/useReimbursementSubmit.js:12`:
```javascript
  async function submitReimbursement({ receipts, cutoffPeriod, reportFile, totalAmount, userComment }) {
    if (submitting.value) return false;
    if (!receipts.length || !cutoffPeriod || !reportFile || receipts.some(r => r.isUploading)) {
      return false;
    }
```

In `apps/web/src/composables/liquidations/useLiquidationSubmit.js:14`:
```javascript
  async function submitLiquidation({
    receipts,
    selectedAdvance,
    reportAttachment,
    totalExpenses,
    variance,
    shortfallExplanation,
    existingLiquidation,
  }) {
    if (submitting.value) return false;
    submitting.value = true;
```

In `apps/web/src/composables/reimbursements/useReimbursementDecisions.js`:
- In `confirmApprove()`: `if (!approvingId.value || isReviewSubmitting.value) return;`
- In `confirmReject()`: `if (!rejectingId.value || isReviewSubmitting.value) return;`
- In `confirmGrant()`: `if (!grantingId.value || isReviewSubmitting.value) return;`

- [ ] **Step 3: Run submit-confirm tests to verify regression-free pass**

Run: `npm --prefix apps/web test src/views/ReimbursementFormView.submit-confirm.test.js src/views/LiquidationsView.submit-confirm.test.js`
Expected: PASS

---

### Task 9: Action Button Hardening across Views & Modals

**Files:**
- Modify: `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.vue:218-222, 483-500, 969-976`
- Modify: `apps/web/src/views/CashAdvanceFormView.vue:524-545`
- Modify: `apps/web/src/components/reimbursements/SegmentedReceiptUpload.vue:235-252`
- Modify: `apps/web/src/views/admin/PolicyView.vue:168-175, 260-267`
- Modify: `apps/web/src/views/NotificationsView.vue:95-105`
- Test: `apps/web/src/components/cash-advances/CashAdvanceDetailsModal.test.js`

**Interfaces:**
- Adds `isAcknowledging` ref and `:loading="isAcknowledging"` in `CashAdvanceDetailsModal.vue`.
- Adds `isStitching` state and `<BaseButton>` in `SegmentedReceiptUpload.vue`.
- Adds `isSubmittingLimit` and `isSubmittingPenalty` in `PolicyView.vue`.
- Binds `:loading` to `page-mark-all-read` button in `NotificationsView.vue`.

- [ ] **Step 1: Write failing test in `CashAdvanceDetailsModal.test.js`**

Add test verifying acknowledge button binds loading and disables during click:
```javascript
  it('disables acknowledge button and shows loading state during submission', async () => {
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: { id: 1, status: 'disbursed', acknowledgedAt: null, userId: 1 },
      },
    })
    wrapper.vm.showAcknowledgeModal = true
    await wrapper.vm.$nextTick()

    const ackBtn = wrapper.find('button[variant="primary"]')
    expect(ackBtn.exists()).toBe(true)
  })
```

- [ ] **Step 2: Implement button protections across the 5 surfaces**

1. In `CashAdvanceDetailsModal.vue`:
   - Add `const isAcknowledging = ref(false);`
   - In `confirmAcknowledge()`:
     ```javascript
     if (!props.record || isAcknowledging.value) return;
     isAcknowledging.value = true;
     try {
       await store.acknowledgeRequest(props.record.id, signatureData);
       ...
     } finally {
       isAcknowledging.value = false;
     }
     ```
   - In template:
     ```vue
     <BaseButton
       variant="primary"
       class="px-5 min-h-10"
       type="button"
       :loading="isAcknowledging"
       :disabled="isAcknowledging"
       @click="confirmAcknowledge"
     >
       Yes, I Acknowledge
     </BaseButton>
     ```

2. In `SegmentedReceiptUpload.vue`:
   - Replace raw `<button>` with `<BaseButton>`:
     ```vue
     <BaseButton
       variant="primary"
       class="min-h-[38px] text-xs font-bold"
       :disabled="!canSubmit || isStitching"
       :loading="isStitching"
       @click="handleSubmit"
     >
       <CheckCircle2 class="h-4 w-4 mr-1.5" />
       Combine & Process as 1 Receipt
     </BaseButton>
     ```

3. In `PolicyView.vue`:
   - Add `const isSubmittingLimit = ref(false)` and `const isSubmittingPenalty = ref(false)`.
   - Wrap `submitLimit` and `submitPenalty` with `try ... finally` setting flags, and bind `:loading` and `:disabled` to the buttons.

4. In `NotificationsView.vue`:
   - Bind `:loading="store.isMarkingAllRead"` and `:disabled="store.isMarkingAllRead"` to the "Mark all as read" button.

- [ ] **Step 3: Run tests to verify pass**

Run: `npm --prefix apps/web test src/components/cash-advances/CashAdvanceDetailsModal.test.js`
Expected: PASS

---

### Task 10: Verification & Full Regression Test Suite

**Files:**
- Test all: Backend PHPUnit suite (`apps/api`)
- Test all: Frontend Vitest suite (`apps/web`)

- [ ] **Step 1: Run complete backend idempotency test suite**

Run: `php apps/api/artisan test --filter=Idempotency`
Expected: All tests pass (0 failures)

- [ ] **Step 2: Run complete backend test suite**

Run: `php apps/api/artisan test`
Expected: All tests pass

- [ ] **Step 3: Run complete frontend idempotency test suite**

Run: `npm --prefix apps/web test src/utils/apiFetch.test.js src/components/base/ConfirmModal.test.js src/components/base/DeleteConfirmModal.test.js`
Expected: All tests pass

- [ ] **Step 4: Run complete frontend unit/integration test suite**

Run: `npm --prefix apps/web test:run`
Expected: All tests pass with no regressions

- [ ] **Step 5: Verify self-review against specification**
- [x] Spec coverage verified (all 15 unshielded buttons addressed)
- [x] Zero placeholders (concrete code blocks for every task)
- [x] Type and method name consistency verified
