<?php

namespace App\Modules\Shared\Http\Controllers;

use App\Modules\Shared\Services\CmsContractExpenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class InternalCmsController extends Controller
{
    public function __construct(
        protected CmsContractExpenseService $contractExpenseService
    ) {}

    /**
     * GET /api/internal/expenses/by-contract
     */
    public function expensesByContract(): JsonResponse
    {
        try {
            $data = $this->contractExpenseService->expensesByContract();

            return response()->json(['data' => $data]);
        } catch (\Throwable $e) {
            Log::error('InternalCmsController::expensesByContract failed.', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to aggregate contract expenses.',
            ], 500);
        }
    }

    /**
     * GET /api/internal/reimbursements/by-vendor
     */
    public function reimbursementsByVendor(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tin'         => 'nullable|string|max:64',
            'vendor_name' => 'nullable|string|max:255',
            'status'      => 'nullable|string|max:64',
            'since'       => 'nullable|date',
            'limit'       => 'nullable|integer|min:1|max:200',
        ]);

        $tin = trim((string) ($validated['tin'] ?? ''));
        $vendorName = trim((string) ($validated['vendor_name'] ?? ''));

        if ($tin === '' && $vendorName === '') {
            throw ValidationException::withMessages([
                'tin' => ['At least one of tin or vendor_name is required.'],
            ]);
        }

        try {
            $data = $this->contractExpenseService->reimbursementsByVendor($validated);

            return response()->json(['data' => $data]);
        } catch (\Throwable $e) {
            Log::error('InternalCmsController::reimbursementsByVendor failed.', [
                'error'       => $e->getMessage(),
                'tin'         => $tin,
                'vendor_name' => $vendorName,
            ]);

            return response()->json([
                'message' => 'Failed to fetch vendor reimbursements.',
            ], 500);
        }
    }
}
