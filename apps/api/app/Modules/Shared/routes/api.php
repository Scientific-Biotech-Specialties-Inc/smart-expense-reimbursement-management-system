<?php

use Illuminate\Support\Facades\Route;
use App\Modules\Shared\Http\Controllers\AuthController;
use App\Modules\Shared\Http\Controllers\CmsController;
use App\Modules\Shared\Http\Controllers\CryptoController;
use App\Modules\Shared\Http\Controllers\InternalCmsController;
use App\Modules\Shared\Http\Controllers\ReportController;

Route::prefix('api')->group(function () {
    // Public: server RSA public key for client-side payload encryption (SDD §5).
    Route::get('/crypto/key', [CryptoController::class, 'publicKey']);

    // Internal service-to-service endpoints (protected by X-Internal-Secret).
    Route::middleware('auth.internal')->prefix('internal')->group(function () {
        Route::get('/expenses/by-contract', [InternalCmsController::class, 'expensesByContract']);
        Route::get('/reimbursements/by-vendor', [InternalCmsController::class, 'reimbursementsByVendor']);
    });

    Route::middleware('auth.external')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);

        Route::post('/auth/verify-password', [AuthController::class, 'verifyPassword']);

        Route::get('/reports/{type}/{id}', [ReportController::class, 'download']);

        // CMS integration proxies & Accounting actions
        Route::get('/cms/contracts/active', [CmsController::class, 'activeContracts']);
        Route::post('/cms/vendors/suggest', [CmsController::class, 'suggestVendor']);
        Route::get('/cms/recurring-expenses', [CmsController::class, 'recurringExpenses']);
        Route::post('/cms/contract-requests', [CmsController::class, 'forwardContractRequest']);
    });
});
