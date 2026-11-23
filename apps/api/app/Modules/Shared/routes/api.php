<?php

use Illuminate\Support\Facades\Route;
use App\Modules\Shared\Http\Controllers\AuthController;
use App\Modules\Shared\Http\Controllers\CmsController;
use App\Modules\Shared\Http\Controllers\CryptoController;
use App\Modules\Shared\Http\Controllers\CurrencyRateController;
use App\Modules\Shared\Http\Controllers\InternalCmsController;
use App\Modules\Shared\Http\Controllers\InternalPrsController;
use App\Modules\Shared\Http\Controllers\InternalTsController;
use App\Modules\Shared\Http\Controllers\ReportController;
use App\Modules\Shared\Http\Controllers\TsController;

Route::prefix('api')->group(function () {
    // Public: server RSA public key for client-side payload encryption (SDD §5).
    Route::get('/crypto/key', [CryptoController::class, 'publicKey'])
        ->middleware('throttle:serms-api');

    // Internal service-to-service endpoints (protected by X-Internal-Secret).
    Route::middleware('auth.internal')->prefix('internal')->group(function () {
        Route::get('/expenses/by-contract', [InternalCmsController::class, 'expensesByContract']);
        Route::get('/reimbursements/by-vendor', [InternalCmsController::class, 'reimbursementsByVendor']);

        Route::post('/ts/reimbursements', [InternalTsController::class, 'storeReimbursement']);
        Route::get('/ts/reimbursements/by-ticket/{ticketId}', [InternalTsController::class, 'reimbursementByTicket'])
            ->whereNumber('ticketId');

        Route::post('/prs/reimbursements', [InternalPrsController::class, 'storeReimbursement']);
        Route::get('/prs/reimbursements/by-activity/{activityId}', [InternalPrsController::class, 'reimbursementByActivity'])
            ->whereNumber('activityId');

        Route::post('/prs/cash-advances', [InternalPrsController::class, 'storeCashAdvance']);
        Route::get('/prs/cash-advances/by-itinerary/{itineraryId}', [InternalPrsController::class, 'cashAdvanceByItinerary'])
            ->whereNumber('itineraryId');
        Route::delete('/prs/cash-advances/by-itinerary/{itineraryId}', [InternalPrsController::class, 'removeCashAdvanceByItinerary'])
            ->whereNumber('itineraryId');
    });

    Route::middleware(['auth.external', 'throttle:serms-api'])->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);

        Route::post('/auth/verify-password', [AuthController::class, 'verifyPassword'])
            ->middleware('throttle:serms-password');

        Route::get('/reports/{type}/{id}', [ReportController::class, 'download'])
            ->middleware('throttle:serms-exports-ocr');

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
