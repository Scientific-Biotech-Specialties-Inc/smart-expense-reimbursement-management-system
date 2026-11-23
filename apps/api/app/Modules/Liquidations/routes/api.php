<?php

use Illuminate\Support\Facades\Route;
use App\Modules\Liquidations\Http\Controllers\LiquidationController;

Route::middleware(['auth.external'])->group(function () {
    Route::get('/', [LiquidationController::class, 'index']);
    Route::post('/', [LiquidationController::class, 'store']);
    Route::post('/scan', [LiquidationController::class, 'scan']);
    Route::get('/receipts/{id}', [LiquidationController::class, 'showReceipt']);
    Route::post('/receipts/{id}/retry-ocr', [LiquidationController::class, 'retryOcr']);
    Route::get('/{id}', [LiquidationController::class, 'show']);
    Route::post('/{id}/audit', [LiquidationController::class, 'audit']);
    Route::put('/{id}', [LiquidationController::class, 'update']);
    Route::delete('/{id}', [LiquidationController::class, 'destroy']);
});
