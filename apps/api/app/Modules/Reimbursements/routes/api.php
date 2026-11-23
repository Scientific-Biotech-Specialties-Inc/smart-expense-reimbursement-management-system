<?php

use Illuminate\Support\Facades\Route;
use App\Modules\Reimbursements\Http\Controllers\ReimbursementController;
use App\Modules\Reimbursements\Http\Controllers\ReceiptController;
use App\Modules\Reimbursements\Http\Controllers\ExpenseCategoryController;
use App\Modules\Reimbursements\Http\Controllers\PrsReimbursementRequestController;
use App\Modules\Reimbursements\Http\Controllers\PrsWebhookController;
use App\Modules\Reimbursements\Http\Controllers\OcrCallbackController;

Route::post('/prs-requests', PrsReimbursementRequestController::class)->middleware('auth.prs-reimbursement-api');
Route::post('/webhooks/prs', PrsWebhookController::class);

// AI OCR service callback — authenticated by the AI service API key (bearer token).
// This route is outside auth.external because the caller is the AI service, not a user.
Route::post('/receipts/{id}/ocr-callback', OcrCallbackController::class)->middleware('auth.ai-service-api');

Route::middleware(['auth.external'])->group(function () {
    Route::get('/', [ReimbursementController::class, 'index']);
    Route::post('/', [ReimbursementController::class, 'store']);

    // Receipts
    Route::get('/receipts', [ReceiptController::class, 'index']);
    Route::get('/receipts/{id}', [ReceiptController::class, 'show']);
    Route::post('/receipts', [ReceiptController::class, 'store']);
    Route::post('/receipts/segmented', [ReceiptController::class, 'storeSegmented']);
    Route::post('/receipts/{id}/resubmit', [ReceiptController::class, 'resubmit']);
    Route::post('/receipts/{id}/retry-ocr', [ReceiptController::class, 'retryOcr']);
    Route::patch('/receipts/{id}', [ReceiptController::class, 'update']);
    Route::delete('/receipts/{id}', [ReceiptController::class, 'destroy']);

    // Expense Categories
    Route::get('/categories', [ExpenseCategoryController::class, 'index']);

    // Specific actions must be BEFORE dynamic {id} routes
    Route::post('/{id}/approve', [ReimbursementController::class, 'approve']);
    Route::post('/{id}/reject', [ReimbursementController::class, 'reject']);
    Route::post('/{id}/grant', [ReimbursementController::class, 'grant']);
    Route::post('/{id}/acknowledge', [ReimbursementController::class, 'acknowledge']);

    // Dynamic routes must be at the bottom
    Route::get('/{id}', [ReimbursementController::class, 'show']);
    Route::patch('/{id}', [ReimbursementController::class, 'update']);
    Route::delete('/{id}', [ReimbursementController::class, 'destroy']);
});
