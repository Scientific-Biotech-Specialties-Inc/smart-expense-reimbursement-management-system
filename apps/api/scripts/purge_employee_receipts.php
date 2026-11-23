<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\ReceiptItem;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\CashAdvances\Models\CashAdvance;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

$email = $argv[1] ?? 'employee@example.com';

$user = User::where('email', $email)->first();
if (!$user) {
    echo json_encode(['error' => "User {$email} not found."]) . PHP_EOL;
    exit(1);
}

$receipts = Receipt::withTrashed()->where('uploaded_by', $user->id)->get();
$receiptIds = $receipts->pluck('id')->values()->all();

// 1. Delete physical files from Supabase S3 storage
$deletedFiles = [];
$failedFiles = [];

foreach ($receipts as $receipt) {
    $paths = is_array($receipt->file_path) ? $receipt->file_path : (array) $receipt->file_path;
    foreach ($paths as $path) {
        if ($path && !str_starts_with($path, 'http://') && !str_starts_with($path, 'https://')) {
            try {
                if (Storage::disk('supabase')->exists($path)) {
                    Storage::disk('supabase')->delete($path);
                    $deletedFiles[] = $path;
                }
            } catch (\Throwable $e) {
                $failedFiles[] = ['path' => $path, 'error' => $e->getMessage()];
            }
        }
    }
}

// 2. Detach or delete user's reimbursements and pivot records
$deletedReimbursementPivot = DB::table('reimbursement_receipts')
    ->whereIn('receipt_id', $receiptIds)
    ->delete();

$userReimbursements = Reimbursement::where('user_id', $user->id)->get();
$reimbursementIds = $userReimbursements->pluck('id')->all();
DB::table('reimbursement_receipts')->whereIn('reimbursement_id', $reimbursementIds)->delete();
Reimbursement::where('user_id', $user->id)->delete();

// 3. Reset user's liquidations and cash advance statuses
$userLiquidations = Liquidation::where('user_id', $user->id)->get();
foreach ($userLiquidations as $liq) {
    if ($liq->cash_advance_id) {
        CashAdvance::where('id', $liq->cash_advance_id)->update(['status' => 'incomplete']);
    }
    $liq->delete();
}

// 4. Delete items and force delete receipts
$deletedItemsCount = ReceiptItem::whereIn('receipt_id', $receiptIds)->delete();
$deletedReceiptsCount = Receipt::withTrashed()->where('uploaded_by', $user->id)->forceDelete();

echo json_encode([
    'status' => 'success',
    'user_id' => $user->id,
    'user_email' => $user->email,
    'receipt_ids' => $receiptIds,
    'deleted_receipts_count' => $deletedReceiptsCount,
    'deleted_items_count' => $deletedItemsCount,
    'deleted_files_count' => count($deletedFiles),
    'deleted_files' => $deletedFiles,
    'failed_files' => $failedFiles,
    'deleted_reimbursements_count' => count($reimbursementIds),
    'deleted_liquidations_count' => $userLiquidations->count(),
    'all_active_receipt_ids' => Receipt::withTrashed()->pluck('id')->values()->all(),
], JSON_PRETTY_PRINT) . PHP_EOL;
