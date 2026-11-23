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
