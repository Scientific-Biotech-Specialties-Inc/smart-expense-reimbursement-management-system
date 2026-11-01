<?php

namespace Tests\Feature;

use App\Modules\Ai\Contracts\AsyncOcrEngineInterface;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class ReceiptOrphanPrunerTest extends TestCase
{
    use RefreshDatabase;

    public function test_prunes_abandoned_draft_receipts_older_than_cutoff(): void
    {
        Storage::fake('supabase');
        Storage::disk('supabase')->put('receipts/orphan.jpg', 'fake-image-bytes');
        Storage::disk('supabase')->put('receipts/active.jpg', 'fake-image-bytes');

        $mockOcrEngine = Mockery::mock(AsyncOcrEngineInterface::class);
        $mockOcrEngine->shouldReceive('deleteReceiptEmbedding')->once();
        $this->app->instance(AsyncOcrEngineInterface::class, $mockOcrEngine);

        $user = User::create([
            'name'       => 'Test Employee',
            'email'      => 'test.employee@example.com',
            'role'       => 'employee',
            'grade'      => 'L1',
            'department' => 'IT',
        ]);

        // 1. Abandoned draft older than 24 hours -> MUST be pruned
        $orphan = Receipt::create([
            'uploaded_by'     => $user->id,
            'file_path'       => ['receipts/orphan.jpg'],
            'file_hash'       => ['hash-orphan'],
            'is_draft'        => true,
            'status'          => 'processed',
        ]);
        \Illuminate\Support\Facades\DB::table('receipts')
            ->where('id', $orphan->id)
            ->update(['created_at' => now()->subHours(25)]);

        // 2. Fresh draft under 24 hours -> MUST NOT be pruned
        $freshDraft = Receipt::create([
            'uploaded_by'     => $user->id,
            'file_path'       => ['receipts/active.jpg'],
            'file_hash'       => ['hash-active'],
            'is_draft'        => true,
            'status'          => 'processed',
        ]);

        // 3. Committed non-draft -> MUST NOT be pruned
        $committed = Receipt::create([
            'uploaded_by'     => $user->id,
            'file_path'       => ['receipts/committed.jpg'],
            'file_hash'       => ['hash-committed'],
            'is_draft'        => false,
            'status'          => 'processed',
        ]);
        \Illuminate\Support\Facades\DB::table('receipts')
            ->where('id', $committed->id)
            ->update(['created_at' => now()->subDays(5)]);

        $this->artisan('receipts:prune-orphans', ['--hours' => 24])
            ->assertExitCode(0);

        // Orphan must be deleted from DB and S3
        $this->assertDatabaseMissing('receipts', ['id' => $orphan->id]);
        Storage::disk('supabase')->assertMissing('receipts/orphan.jpg');

        // Fresh draft and committed must remain
        $this->assertDatabaseHas('receipts', ['id' => $freshDraft->id]);
        $this->assertDatabaseHas('receipts', ['id' => $committed->id]);
        Storage::disk('supabase')->assertExists('receipts/active.jpg');
    }
}
