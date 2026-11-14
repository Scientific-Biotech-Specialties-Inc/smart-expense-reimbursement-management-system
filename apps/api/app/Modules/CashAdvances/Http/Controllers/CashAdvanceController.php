<?php

namespace App\Modules\CashAdvances\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Services\CashAdvanceService;
use App\Modules\CashAdvances\Http\Requests\StoreCashAdvanceRequest;
use App\Modules\CashAdvances\Http\Requests\UpdateCashAdvanceRequest;
use App\Modules\CashAdvances\Http\Requests\ApproveCashAdvanceRequest;
use App\Modules\CashAdvances\Http\Requests\RejectCashAdvanceRequest;
use App\Modules\CashAdvances\Http\Requests\DisburseCashAdvanceRequest;
use App\Modules\CashAdvances\Http\Requests\AcknowledgeCashAdvanceRequest;
use App\Modules\Shared\Services\CashAdvanceEnrichmentService;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\Access\AuthorizationException;
use App\Modules\AuditLogs\Services\AuditLogService;

class CashAdvanceController extends Controller
{
    protected CashAdvanceService $service;
    protected CashAdvanceEnrichmentService $enrichmentService;

    public function __construct(CashAdvanceService $service, CashAdvanceEnrichmentService $enrichmentService)
    {
        $this->service = $service;
        $this->enrichmentService = $enrichmentService;
    }

    private const ADVANCE_WITH = [
        'requester',
        'approvalActions.approver',
        'statusHistory.changedBy',
        'statusHistory.user',
        'disbursement.disbursedBy',
        'penalties',
        'liquidations',
        'document',
    ];

    /**
     * Enrich a single CashAdvance model with Unified Roadmap computed fields.
     * Keeps SQL aggregate for penalties_total but falls back to collection sum if not eager-summed.
     */
    private function enrichAdvance(CashAdvance $advance): CashAdvance
    {
        $this->enrichmentService->enrich($advance, true);

        if ($advance->getAttribute('audit_trail') === null) {
            $canManage = request()?->user()?->can('serms.cash_advances.manage') ?? false;
            AuditLogService::enrichCashAdvance($advance, $canManage);
        }

        return $advance;
    }

    /**
     * List all cash advances.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', CashAdvance::class);

        $user = $request->user();

        $query = CashAdvance::with(self::ADVANCE_WITH)
            ->withSum('penalties as penalties_total', 'penalty_amount')
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if (!$user->can('serms.cash_advances.manage')) {
            $query->where('user_id', $user->id);
        }

        $advances = $query->get();
        AuditLogService::enrichCashAdvances($advances, $user->can('serms.cash_advances.manage'));
        $enriched = $advances->map(fn (CashAdvance $a) => $this->enrichAdvance($a));

        return response()->json($enriched);
    }

    /**
     * Request a new cash advance.
     */
    public function store(StoreCashAdvanceRequest $request)
    {
        Gate::authorize('create', CashAdvance::class);

        $advance = $this->service->createAdvance(
            $request->user(),
            $request->validated(),
            $request->file('documents', [])
        );

        $advance->load(self::ADVANCE_WITH);
        $advance->loadSum('penalties as penalties_total', 'penalty_amount');
        $this->enrichAdvance($advance);

        return response()->json([
            'message' => 'Cash advance request created successfully.',
            'data' => $advance,
        ], 201);
    }

    /**
     * View detailed cash advance.
     */
    public function show(Request $request, $id)
    {
        $advance = CashAdvance::with(self::ADVANCE_WITH)
            ->withSum('penalties as penalties_total', 'penalty_amount')
            ->findOrFail($id);

        Gate::authorize('view', $advance);

        $this->enrichAdvance($advance);

        return response()->json($advance);
    }

    /**
     * Get the document for a cash advance.
     */
    public function document(Request $request, $id)
    {
        $advance = CashAdvance::findOrFail($id);

        Gate::authorize('view', $advance);

        return response()->json($advance->document);
    }

    /**
     * Approve a cash advance.
     */
    public function approve(ApproveCashAdvanceRequest $request, $id)
    {
        $advance = CashAdvance::findOrFail($id);

        Gate::authorize('approve', $advance);

        if ($advance->status !== 'pending') {
            return response()->json(['message' => 'Conflict. Cash advance is not pending.'], 409);
        }

        try {
            $advance = $this->service->approveAdvance(
                $advance,
                $request->user(),
                $request->validated('comment'),
                $request->validated('password'),
                $request
            );

            $advance->load(self::ADVANCE_WITH);
            $advance->loadSum('penalties as penalties_total', 'penalty_amount');
            $this->enrichAdvance($advance);

            return response()->json([
                'message' => 'Cash advance approved successfully.',
                'data' => $advance,
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $e->errors(),
            ], 422);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    /**
     * Reject a cash advance.
     */
    public function reject(RejectCashAdvanceRequest $request, $id)
    {
        $advance = CashAdvance::findOrFail($id);

        Gate::authorize('reject', $advance);

        if (!in_array($advance->status, ['pending', 'revise'])) {
            return response()->json(['message' => 'Conflict. Cash advance is not pending or revise.'], 409);
        }

        try {
            $advance = $this->service->rejectAdvance(
                $advance,
                $request->user(),
                $request->validated('comment'),
                $request->validated('action', 'revise'),
                $request->validated('password'),
                $request
            );

            $isRejected = $advance->status === 'rejected';
            $advance->load(self::ADVANCE_WITH);
            $advance->loadSum('penalties as penalties_total', 'penalty_amount');
            $this->enrichAdvance($advance);

            return response()->json([
                'message' => $isRejected ? 'Cash advance rejected (exceeded revision limit).' : 'Cash advance returned for revision.',
                'data' => $advance,
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $e->errors(),
            ], 422);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    /**
     * Disburse an approved cash advance.
     */
    public function disburse(DisburseCashAdvanceRequest $request, $id)
    {
        $advance = CashAdvance::findOrFail($id);

        Gate::authorize('disburse', $advance);

        if ($advance->status !== 'approved') {
            return response()->json(['message' => 'Conflict. Cash advance is not in an approved state.'], 409);
        }

        try {
            $validated = $request->validated();
            $password = $validated['password'];
            unset($validated['password']);

            $advance = $this->service->disburseAdvance(
                $advance,
                $request->user(),
                $validated,
                $password,
                $request
            );

            $advance->load(self::ADVANCE_WITH);
            $advance->loadSum('penalties as penalties_total', 'penalty_amount');
            $this->enrichAdvance($advance);

            return response()->json([
                'message' => 'Cash advance disbursed successfully.',
                'data' => $advance,
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $e->errors(),
            ], 422);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    /**
     * Acknowledge cash advance receipt.
     */
    public function acknowledge(AcknowledgeCashAdvanceRequest $request, $id)
    {
        $advance = CashAdvance::findOrFail($id);

        Gate::authorize('acknowledge', $advance);

        if (!in_array($advance->status, ['approved', 'disbursed'])) {
            return response()->json(['message' => 'Conflict. Cash advance is not in a valid state for acknowledgement.'], 409);
        }

        if ($advance->acknowledged_at !== null) {
            return response()->json(['message' => 'Conflict. Cash advance has already been acknowledged.'], 409);
        }

        $advance = $this->service->acknowledgeAdvance(
            $advance,
            $request->validated()
        );

        $advance->load(self::ADVANCE_WITH);
        $advance->loadSum('penalties as penalties_total', 'penalty_amount');
        $this->enrichAdvance($advance);

        return response()->json([
            'message' => 'Cash advance acknowledged successfully.',
            'data' => $advance,
        ]);
    }

    /**
     * Update a pending or revise cash advance (employee self-edit).
     */
    public function update(UpdateCashAdvanceRequest $request, $id)
    {
        $advance = CashAdvance::findOrFail($id);

        // Only the owner can edit
        if ($advance->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden. You do not own this cash advance.'], 403);
        }

        if ($advance->status === 'rejected') {
            return response()->json(['message' => 'Rejected cash advances (exceeded revision limit) cannot be edited.'], 409);
        }

        if (!in_array($advance->status, ['pending', 'revise'])) {
            return response()->json(['message' => 'Only pending or revise cash advances can be edited.'], 409);
        }

        $advance = $this->service->updateAdvance(
            $advance,
            $request->user(),
            $request->validated(),
            $request->file('documents', [])
        );

        $advance->load(self::ADVANCE_WITH);
        $advance->loadSum('penalties as penalties_total', 'penalty_amount');
        $this->enrichAdvance($advance);

        return response()->json([
            'message' => 'Cash advance updated successfully.',
            'data' => $advance,
        ]);
    }

    /**
     * Delete a pending cash advance request.
     */
    public function destroy(Request $request, $id)
    {
        $advance = CashAdvance::findOrFail($id);

        // Only the owner can delete
        if ($advance->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden. You do not own this cash advance.'], 403);
        }

        if ($advance->status !== 'pending') {
            return response()->json(['message' => 'Only pending cash advances can be deleted.'], 409);
        }

        try {
            $this->service->deleteAdvance(
                $advance,
                $request->user(),
                $request->input('password', ''),
                $request
            );

            return response()->json([
                'message' => 'Cash advance request deleted successfully.',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $e->errors(),
            ], 422);
        }
    }
}
