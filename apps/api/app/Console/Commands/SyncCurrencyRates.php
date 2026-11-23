<?php

namespace App\Console\Commands;

use App\Modules\Shared\Services\CurrencyConversionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class SyncCurrencyRates extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'currencies:sync';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sync foreign exchange rates (to PHP) from the configured exchange rate provider.';

    /**
     * Execute the console command.
     */
    public function handle(CurrencyConversionService $currencyService): int
    {
        $this->info('Starting currency exchange rate sync...');

        try {
            $result = $currencyService->syncRatesFromProvider();

            $this->info("Synced {$result['synced_count']} currency rates to PHP (effective {$result['effective_date']}, source: {$result['source']}).");

            return self::SUCCESS;
        } catch (\Throwable $e) {
            Log::error('SyncCurrencyRates command failed.', [
                'error' => $e->getMessage(),
            ]);
            $this->error("Currency sync failed: {$e->getMessage()}");

            return self::FAILURE;
        }
    }
}
