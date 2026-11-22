<?php

use Illuminate\Support\Facades\Route;
use App\Modules\Shared\Http\Controllers\AuthController;
use App\Modules\Shared\Http\Controllers\CmsController;
use App\Modules\Shared\Http\Controllers\CryptoController;
use App\Modules\Shared\Http\Controllers\CurrencyRateController;
use App\Modules\Shared\Http\Controllers\InternalCmsController;
use App\Modules\Shared\Http\Controllers\InternalTsController;
use App\Modules\Shared\Http\Controllers\ReportController;
use App\Modules\Shared\Http\Controllers\TsController;

Route::prefix('api')->group(function () {
    // Public: server RSA public key for client-side payload encryption (SDD §5).
    Route::get('/crypto/key', [CryptoController::class, 'publicKey']);

    // Internal service-to-service endpoints (protected by X-Internal-Secret).
    Route::middleware('auth.internal')->prefix('internal')->group(function () {
        Route::get('/expenses/by-contract', [InternalCmsController::class, 'expensesByContract']);
        Route::get('/reimbursements/by-vendor', [InternalCmsController::class, 'reimbursementsByVendor']);

        Route::post('/ts/reimbursements', [InternalTsController::class, 'storeReimbursement']);
        Route::get('/ts/reimbursements/by-ticket/{ticketId}', [InternalTsController::class, 'reimbursementByTicket'])
            ->whereNumber('ticketId');
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

        // Ticketing System (TS) integration proxy
        Route::get('/ts/tickets', [TsController::class, 'tickets']);

        // Multi-currency FX rates (PHP base)
        Route::get('/currencies/rates', [CurrencyRateController::class, 'index']);
    });
});
