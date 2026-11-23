<?php

use App\Modules\Users\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->middleware('auth.external')->group(function () {
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::post('/profile/photo', [ProfileController::class, 'uploadPhoto']);
    Route::delete('/profile/photo', [ProfileController::class, 'removePhoto']);
    Route::post('/profile/signature', [ProfileController::class, 'updateSignature']);
    Route::delete('/profile/signature', [ProfileController::class, 'removeSignature']);
    Route::post('/profile/password', [ProfileController::class, 'changePassword']);
    Route::get('/profile/activity', [ProfileController::class, 'activity']);
});
