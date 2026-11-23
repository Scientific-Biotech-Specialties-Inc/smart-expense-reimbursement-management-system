<?php

namespace App\Modules\Shared\Http\Controllers;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Shared\Services\CmsClientService;
use App\Modules\Shared\Services\CmsRecurringExpenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CmsController extends Controller
{
    public function __construct(
        protected CmsClientService $cmsClient,
        protected CmsRecurringExpenseService $recurringExpenseService
    ) {}

    /**
     * GET /api/cms/contracts/active
     */
    public function activeContracts(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:120',
            'limit'  => 'nullable|integer|min:1|max:200',
        ]);

        $result = $this->cmsClient->getActiveContracts(
            $validated['search'] ?? null,
            (int) ($validated['limit'] ?? 100)
        );

        return response()->json($result);
    }

    /**
     * POST /api/cms/vendors/suggest
     */
    public function suggestVendor(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->hasAdminPrivileges()) {
            return response()->json(['message' => 'Forbidden. Accounting privileges required.'], 403);
        }

        $validated = $request->validate([
            'receipt_id'               => 'nullable|integer|exists:receipts,id',
            'vendor_name'              => 'required|string|max:255',
            'tin_number'               => 'nullable|string|max:64',
            'industry'                 => 'nullable|string|max:120',
            'contact_person'           => 'nullable|string|max:120',
            'contact_number'           => 'nullable|string|max:64',
            'email'                    => 'nullable|email|max:255',
            'address'                  => 'nullable|string|max:500',
            'region'                   => 'nullable|string|max:120',
            'default_expense_category' => 'nullable|string|max:120',
        ]);

        $payload = array_filter([
            'vendor_name'              => $validated['vendor_name'],
            'tin_number'               => $validated['tin_number'] ?? null,
            'industry'                 => $validated['industry'] ?? null,
            'contact_person'           => $validated['contact_person'] ?? null,
            'contact_number'           => $validated['contact_number'] ?? null,
            'email'                    => $validated['email'] ?? null,
            'address'                  => $validated['address'] ?? null,
            'region'                   => $validated['region'] ?? null,
            'default_expense_category' => $validated['default_expense_category'] ?? null,
            'source_receipt_id'        => $validated['receipt_id'] ?? null,
            'submitted_by'             => (int) ($user->auth_id ?: $user->id),
        ], fn ($v) => $v !== null && $v !== '');

        try {
            $result = $this->cmsClient->suggestVendor($payload);
        } catch (\RuntimeException $e) {
            Log::warning('CmsController::suggestVendor failed.', [
                'error'   => $e->getMessage(),
                'user_id' => $user->id,
            ]);

            return response()->json(['message' => $e->getMessage()], 502);
        }

        $suggestedAt = null;
        if (in_array($result['status'], [200, 201], true)) {
            $suggestedAt = now();
            DB::transaction(function () use ($user, $validated, $result, $suggestedAt, $request) {
                $entityType = 'cms_vendor_suggestion';
                $entityId = 0;
                $beforeState = null;
                $afterState = [
                    'vendor_name' => $validated['vendor_name'],
                    'tin_number'  => $validated['tin_number'] ?? null,
                    'cms_status'  => $result['status'],
                ];

                if (!empty($validated['receipt_id'])) {
                    $receipt = Receipt::find($validated['receipt_id']);
                    if ($receipt) {
                        $beforeState = $receipt->toArray();
                        $receipt->update(['vendor_suggested_at' => $suggestedAt]);
                        $entityType = 'receipt';
                        $entityId = $receipt->id;
                        $afterState = $receipt->fresh()->toArray();
                    }
                }

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: $user->role ?? 'admin',
                    actionType: 'CMS_VENDOR_SUGGESTED',
                    entityType: $entityType,
                    entityId: $entityId,
                    beforeState: $beforeState,
                    afterState: $afterState,
                    ipAddress: $request->ip()
                );
            });
        }

        return response()->json([
            'data'                => $result['data'],
            'message'             => $result['message'],
            'vendor_suggested_at' => $suggestedAt?->toIso8601String(),
        ], $result['status']);
    }

    /**
     * GET /api/cms/recurring-expenses
     */
    public function recurringExpenses(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->hasAdminPrivileges()) {
            return response()->json(['message' => 'Forbidden. Accounting privileges required.'], 403);
        }

        return response()->json([
            'data' => $this->recurringExpenseService->detectRecurringVendors(),
        ]);
    }

    /**
     * POST /api/cms/contract-requests
     */
    public function forwardContractRequest(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->hasAdminPrivileges()) {
            return response()->json(['message' => 'Forbidden. Accounting privileges required.'], 403);
        }

        $validated = $request->validate([
            'vendor_name'         => 'required|string|max:255',
            'tin_number'          => 'nullable|string|max:64',
            'service_description' => 'required|string|max:1000',
            'category'            => 'required|string|max:120',
            'region'              => 'nullable|string|max:120',
            'occurrence_count'    => 'required|integer|min:1',
            'total_spend'         => 'required|numeric|min:0',
            'period_start'        => 'required|date',
            'period_end'          => 'required|date',
            'source_reference_id' => 'required|string|max:100',
            'expense_items'       => 'required|array|min:1',
        ]);

        try {
            $record = $this->recurringExpenseService->forwardToCms($user, $validated, $request->ip());

            return response()->json([
                'data'    => $record,
                'message' => 'Contract request forwarded to CMS.',
            ], 201);
        } catch (\RuntimeException $e) {
            Log::warning('CmsController::forwardContractRequest failed.', [
                'error'   => $e->getMessage(),
                'user_id' => $user->id,
            ]);

            return response()->json(['message' => $e->getMessage()], 502);
        }
    }
}
