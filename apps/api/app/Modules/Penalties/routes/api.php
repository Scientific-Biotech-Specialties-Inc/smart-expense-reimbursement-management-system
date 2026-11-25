<?php

use App\Modules\Penalties\Http\Controllers\PenaltyController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth.external', 'throttle:serms-api'])->group(function () {
    Route::get('/me', [PenaltyController::class, 'me']);
    Route::post('/appeals', [PenaltyController::class, 'submitAppeal']);

    Route::prefix('admin')->group(function () {
        Route::get('/overview', [PenaltyController::class, 'adminOverview']);
        Route::get('/strikes', [PenaltyController::class, 'adminStrikes']);
        Route::post('/appeals/{id}/review', [PenaltyController::class, 'reviewAppeal']);
        Route::post('/strikes', [PenaltyController::class, 'issueManualStrike']);
        Route::post('/strikes/{id}/waive', [PenaltyController::class, 'waiveStrike']);
        Route::post('/users/{userId}/reset', [PenaltyController::class, 'resetUserStrikes']);
        Route::get('/users/{userId}/records', [PenaltyController::class, 'userRecords']);
    });
});
