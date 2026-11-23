<?php

use Illuminate\Support\Facades\Route;
use App\Modules\CashAdvances\Http\Controllers\CashAdvanceController;

Route::middleware(['auth.external', 'throttle:serms-api'])->group(function () {
    Route::get('/', [CashAdvanceController::class, 'index']);
    Route::post('/', [CashAdvanceController::class, 'store']);
    Route::get('/{id}', [CashAdvanceController::class, 'show']);
    Route::get('/{id}/document', [CashAdvanceController::class, 'document']);
    Route::post('/{id}/approve', [CashAdvanceController::class, 'approve'])->middleware('throttle:serms-password');
    Route::post('/{id}/reject', [CashAdvanceController::class, 'reject'])->middleware('throttle:serms-password');
    Route::post('/{id}/disburse', [CashAdvanceController::class, 'disburse'])->middleware('throttle:serms-password');
    Route::post('/{id}/acknowledge', [CashAdvanceController::class, 'acknowledge']);
    Route::put('/{id}', [CashAdvanceController::class, 'update']);
    Route::delete('/{id}', [CashAdvanceController::class, 'destroy'])->middleware('throttle:serms-password');
});
