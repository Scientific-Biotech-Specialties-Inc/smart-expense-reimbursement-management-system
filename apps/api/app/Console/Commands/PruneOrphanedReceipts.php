<?php

namespace App\Console\Commands;

use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Services\ReceiptService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PruneOrphanedReceipts extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'receipts:prune-orphans {--hours=24 : Retention period in hours for uncommitted draft receipts}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Prune abandoned draft receipts, deleting storage files, vector embeddings, and DB records.';

    /**
     * Execute the console command.
     */
    public function handle(ReceiptService $receiptService): int
    {
        $hours = (int) $this->option('hours');
        $cutoff = now()->subHours($hours);

        $orphans = Receipt::where('is_draft', true)
            ->where('created_at', '<', $cutoff)
            ->whereDoesntHave('reimbursements')
            ->get();

        $count = 0;
        foreach ($orphans as $receipt) {
            try {
                // 1. Purge physical files from Supabase and vector embedding from ocr-pipeline
                $receiptService->purgeReceiptArtifacts($receipt);

                // 2. Permanently delete child items and receipt record
                $receipt->items()->delete();
                $receipt->forceDelete();
                $count++;
            } catch (\Throwable $e) {
                Log::error('PruneOrphanedReceipts: failed to prune receipt', [
                    'receipt_id' => $receipt->id,
                    'error'      => $e->getMessage(),
                ]);
            }
        }

        $this->info("Pruned {$count} abandoned draft receipt(s) older than {$hours} hour(s).");
        return self::SUCCESS;
    }
}
