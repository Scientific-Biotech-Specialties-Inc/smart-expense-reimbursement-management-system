<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Notifications\Services\NotificationDeliveryService;
use App\Modules\AuditLogs\Services\AuditLogService;
use Illuminate\Support\Facades\DB;

class WarnReceiptDeletion extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'receipts:warn-deletion';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Check for staging receipts nearing deletion and trigger a 30-day warning notification.';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Starting receipt deletion warning check...');

        // 1. Fetch staging receipts nearing deletion.
        // We define nearing deletion as receipts uploaded 60 to 89 days ago (30 days remaining for 90-day retention).
        // Staged receipts means receipts NOT yet linked to any reimbursement.
        $warningThresholdStart = now()->subDays(89)->startOfDay();
        $warningThresholdEnd = now()->subDays(60)->endOfDay();

        $nearingDeletionReceipts = Receipt::query()
            ->whereNull('deleted_at')
            ->where('is_archived', false)
            ->where('deletion_warning_sent', false)
            ->whereBetween('created_at', [$warningThresholdStart, $warningThresholdEnd])
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('reimbursements')
                    ->whereColumn('reimbursements.receipt_id', 'receipts.id');
            })
            ->with('uploader')
            ->get();

        $this->info("Found {$nearingDeletionReceipts->count()} staging receipts nearing deletion.");

        foreach ($nearingDeletionReceipts as $receipt) {
            /** @var \App\Modules\Reimbursements\Models\Receipt $receipt */
            $uploader = $receipt->uploader;
            if (!$uploader || !$uploader->email) {
                $this->warn("Skipping receipt #{$receipt->id} as uploader email could not be found.");
                continue;
            }

            // Calculate days remaining
            $daysSinceUpload = now()->diffInDays($receipt->created_at);
            $daysRemaining = max(0, 90 - $daysSinceUpload);

            // Dispatch warning notification
            $payload = [
                'receipt_id' => $receipt->id,
                'file_name' => basename($receipt->file_path),
                'uploaded_at' => $receipt->created_at->toIso8601String(),
                'days_remaining' => $daysRemaining,
            ];

            $this->info("Sending deletion warning notification for receipt #{$receipt->id} to {$uploader->email}.");

            $sent = NotificationDeliveryService::send(
                $uploader->email,
                'RECEIPT_DELETION_WARNING',
                $payload
            );

            if ($sent) {
                // Update warning flag
                $receipt->update(['deletion_warning_sent' => true]);

                // Audit log of warning dispatched (Compliance Requirement)
                AuditLogService::log(
                    0, // System actor ID
                    'system',
                    'RECEIPT_DELETION_WARNING_SENT',
                    'Receipt',
                    $receipt->id,
                    null,
                    ['warning_sent' => true, 'payload' => $payload]
                );
            }
        }

        // 2. Auto-delete unclaimed staging receipts older than 90 days
        $deleteThreshold = now()->subDays(90)->endOfDay();

        $expiredReceipts = Receipt::query()
            ->whereNull('deleted_at')
            ->where('is_archived', false)
            ->where('created_at', '<=', $deleteThreshold)
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('reimbursements')
                    ->whereColumn('reimbursements.receipt_id', 'receipts.id');
            })
            ->get();

        $this->info("Found {$expiredReceipts->count()} staging receipts past the 90-day retention period.");

        foreach ($expiredReceipts as $receipt) {
            /** @var \App\Modules\Reimbursements\Models\Receipt $receipt */
            $this->info("Automatically soft-deleting expired staged receipt #{$receipt->id} (uploaded {$receipt->created_at->toDateString()}).");

            $beforeState = $receipt->toArray();
            
            // Soft delete
            $receipt->delete();

            // Compliance audit log of deletion
            AuditLogService::log(
                0, // System actor ID
                'system',
                'RECEIPT_SYSTEM_DELETED',
                'Receipt',
                $receipt->id,
                $beforeState,
                ['deleted_at' => now()->toIso8601String(), 'reason' => 'Exceeded 90-day unclaimed retention policy.']
            );
        }

        $this->info('Receipt deletion warning check complete.');
        return Command::SUCCESS;
    }
}
