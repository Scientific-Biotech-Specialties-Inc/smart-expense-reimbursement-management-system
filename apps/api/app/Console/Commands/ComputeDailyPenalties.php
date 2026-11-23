<?php

namespace App\Console\Commands;

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
    public function handle(PenaltySyncService $penaltySync)
    {
        $this->info('Starting daily penalty calculation...');

        $summary = $penaltySync->syncPendingOverdueAdvances();

        $this->info("Checked {$summary['checked']} cash advances: applied {$summary['applied']} penalties, reverted {$summary['reverted']}.");
        $this->info('Daily penalty calculation complete.');

        $this->call('notifications:check-liquidation-deadlines');

        return Command::SUCCESS;
    }
}
