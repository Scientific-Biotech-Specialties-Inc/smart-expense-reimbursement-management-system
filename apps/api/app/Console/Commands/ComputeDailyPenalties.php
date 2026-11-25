<?php

namespace App\Console\Commands;

use App\Modules\Penalties\Services\PenaltyStrikeService;
use App\Modules\Shared\Services\PenaltySyncService;
use Illuminate\Console\Command;

class ComputeDailyPenalties extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'penalties:calculate';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Calculate and apply daily penalties for overdue cash advances.';

    /**
     * Execute the console command.
     */
    public function handle(PenaltySyncService $penaltySync, PenaltyStrikeService $strikeService)
    {
        $this->info('Starting daily penalty calculation...');

        $summary = $penaltySync->syncPendingOverdueAdvances();
        $strikeSummary = $strikeService->syncAllEligibleStrikes();

        $this->info("Checked {$summary['checked']} cash advances: applied {$summary['applied']} penalties, reverted {$summary['reverted']}.");
        $this->info("Checked {$strikeSummary['users_checked']} users for compliance strikes: issued {$strikeSummary['strikes_created']} strikes.");
        $this->info('Daily penalty calculation complete.');

        $this->call('notifications:check-liquidation-deadlines');

        return Command::SUCCESS;
    }
}
