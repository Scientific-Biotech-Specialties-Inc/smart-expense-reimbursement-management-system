<?php

namespace App\Modules\Shared\Http\Controllers;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\CashAdvances\Services\PrsCashAdvanceService;
use App\Modules\Reimbursements\Services\PrsActivityReimbursementService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class InternalPrsController extends Controller
{
    public function __construct(
        protected PrsActivityReimbursementService $reimbursementService,
        protected PrsCashAdvanceService $cashAdvanceService,
    ) {}

    /**
     * POST /api/internal/prs/reimbursements
     */
    public function storeReimbursement(Request $request): JsonResponse
    {
        try {
            $result = $this->reimbursementService->importFromRequest($request);
            $reimbursement = $result['reimbursement'];
            $created = (bool) $result['created'];

            return response()->json([
                'reimbursement_id'   => (int) $reimbursement->id,
                'external_reference' => $reimbursement->reference_no,
                'reference_no'       => $reimbursement->reference_no,
                'status'             => $reimbursement->status,
                'message'            => $created
                    ? 'PRS reimbursement request received and queued for OCR processing.'
                    : 'Reimbursement already exists for this activity.',
                'data'               => $reimbursement,
            ], $created ? 201 : 200);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            Log::error('InternalPrsController::storeReimbursement failed.', [
                'activity_id' => $request->input('activity_id') ?? $request->input('activity_submission_id'),
                'error'       => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to import PRS reimbursement.',
            ], 500);
        }
    }

    /**
     * GET /api/internal/prs/reimbursements/by-activity/{activityId}
     */
    public function reimbursementByActivity(int $activityId): JsonResponse
    {
        try {
            $reimbursement = $this->reimbursementService->findLatestByActivityId($activityId);

            if (!$reimbursement) {
                return response()->json([
                    'message' => 'No reimbursement found for the specified activity.',
                ], 404);
            }

            AuditLogService::enrichReimbursement($reimbursement, false);

            $status = (string) $reimbursement->status;
            $isReimbursed = in_array(strtolower(trim($status)), ['granted', 'paid'], true);

            return response()->json([
                'reimbursement_id'     => (int) $reimbursement->id,
                'external_reference'   => $reimbursement->reference_no,
                'reference_no'         => $reimbursement->reference_no,
                'activity_id'          => $reimbursement->prs_activity_id ? (int) $reimbursement->prs_activity_id : $activityId,
                'source_submission_id' => $reimbursement->source_submission_id,
                'status'               => $status,
                'serms_status'         => $status,
                'is_reimbursed'        => $isReimbursed,
                'amount'               => (float) $reimbursement->amount,
                'rejection_comment'    => $reimbursement->rejection_comment,
                'approved_at'          => $reimbursement->approved_at?->toIso8601String(),
                'updated_at'           => $reimbursement->updated_at?->toIso8601String(),
                'history'              => $reimbursement->getAttribute('audit_trail') ?? [],
            ]);
        } catch (\Throwable $e) {
            Log::error('InternalPrsController::reimbursementByActivity failed.', [
                'activity_id' => $activityId,
                'error'       => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to fetch activity reimbursement status.',
            ], 500);
        }
    }

    /**
     * POST /api/internal/prs/cash-advances
     */
    public function storeCashAdvance(Request $request): JsonResponse
    {
        try {
            $result = $this->cashAdvanceService->createOrGetForItinerary($request->all(), $request->ip());
            $advance = $result['cash_advance'];
            $created = (bool) $result['created'];
            $gating = $this->cashAdvanceService->formatGatingPayload($advance);

            return response()->json([
                'cash_advance_id'    => (int) $advance->id,
                'external_reference' => $advance->reference_no,
                'reference_no'       => $advance->reference_no,
                'itinerary_id'       => $advance->itinerary_id ? (int) $advance->itinerary_id : null,
                'status'             => $advance->status,
                'amount'             => (float) $advance->amount,
                'is_done'            => $gating['is_done'],
                'can_proceed'        => $gating['can_proceed'],
                'can_remove'         => $gating['can_remove'],
                'message'            => $created
                    ? 'PRS cash advance request created.'
                    : 'Cash advance already exists for this itinerary.',
                'data'               => $advance,
            ], $created ? 201 : 200);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            Log::error('InternalPrsController::storeCashAdvance failed.', [
                'itinerary_id' => $request->input('itinerary_id') ?? $request->input('planned_activity_id'),
                'error'        => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to create PRS cash advance.',
            ], 500);
        }
    }

    /**
     * GET /api/internal/prs/cash-advances/by-itinerary/{itineraryId}
     */
    public function cashAdvanceByItinerary(int $itineraryId): JsonResponse
    {
        try {
            $advance = $this->cashAdvanceService->findLatestByItineraryId($itineraryId);

            if (!$advance) {
                return response()->json([
                    'message' => 'No cash advance found for the specified itinerary.',
                ], 404);
            }

            AuditLogService::enrichCashAdvance($advance, false);
            $gating = $this->cashAdvanceService->formatGatingPayload($advance);

            $latestRejection = $advance->approvalActions
                ->sortByDesc('id')
                ->first(fn ($action) => in_array((string) $action->action, ['rejected', 'revised'], true));

            return response()->json([
                'cash_advance_id'    => (int) $advance->id,
                'external_reference' => $advance->reference_no,
                'reference_no'       => $advance->reference_no,
                'itinerary_id'       => $advance->itinerary_id ? (int) $advance->itinerary_id : $itineraryId,
                'status'             => $advance->status,
                'amount'             => (float) $advance->amount,
                'is_done'            => $gating['is_done'],
                'can_proceed'        => $gating['can_proceed'],
                'can_remove'         => $gating['can_remove'],
                'rejection_comment'  => $latestRejection?->comment,
                'updated_at'         => $advance->updated_at?->toIso8601String(),
                'history'            => $advance->getAttribute('audit_trail') ?? [],
                'data'               => $advance,
            ]);
        } catch (\Throwable $e) {
            Log::error('InternalPrsController::cashAdvanceByItinerary failed.', [
                'itinerary_id' => $itineraryId,
                'error'        => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to fetch itinerary cash advance status.',
            ], 500);
        }
    }

    /**
     * DELETE /api/internal/prs/cash-advances/by-itinerary/{itineraryId}
     */
    public function removeCashAdvanceByItinerary(Request $request, int $itineraryId): JsonResponse
    {
        try {
            $result = $this->cashAdvanceService->removeByItineraryId($itineraryId, $request->ip());

            return response()->json([
                'removed'         => $result['removed'],
                'cash_advance_id' => $result['cash_advance_id'],
                'reference_no'    => $result['reference_no'],
                'itinerary_id'    => $result['itinerary_id'],
                'status'          => $result['status'],
                'message'         => 'Cash advance removed successfully.',
            ]);
        } catch (ModelNotFoundException) {
            return response()->json([
                'message' => 'No cash advance found for the specified itinerary.',
            ], 404);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'Cash advance cannot be removed in its current status.',
                'errors'  => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            Log::error('InternalPrsController::removeCashAdvanceByItinerary failed.', [
                'itinerary_id' => $itineraryId,
                'error'        => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to remove PRS cash advance.',
            ], 500);
        }
    }
}
