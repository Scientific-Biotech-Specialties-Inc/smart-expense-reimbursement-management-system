<?php

namespace App\Modules\Shared\Http\Controllers;

use App\Modules\Shared\Models\CurrencyRate;
use App\Modules\Shared\Services\CurrencyConversionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;

class CurrencyRateController extends Controller
{
    public function __construct(
        protected CurrencyConversionService $currencyService
    ) {}

    /**
     * GET /api/currencies/rates
     */
    public function index(Request $request): JsonResponse
    {
        $currency = $request->query('currency');

        if ($currency !== null && trim((string) $currency) !== '') {
            try {
                $this->currencyService->resolveRateToPhp((string) $currency);
            } catch (ValidationException $e) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'errors'  => $e->errors(),
                ], 422);
            }
        }

        return response()->json([
            'base'  => 'PHP',
            'rates' => CurrencyRate::orderBy('currency_code')->get(),
        ]);
    }
}
