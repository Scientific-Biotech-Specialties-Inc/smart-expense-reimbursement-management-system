<?php

namespace App\Modules\Shared\Http\Controllers;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Reimbursements\Jobs\UpdateTsReimbursementStatusJob;
use App\Modules\Reimbursements\Services\TsReimbursementImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class InternalTsController extends Controller
{
    public function __construct(
        protected TsReimbursementImportService $importService
    ) {}

    /**
     * POST /api/internal/ts/reimbursements
     */
    public function storeReimbursement(Request $request): JsonResponse
    {
        try {
            $result = $this->importService->importFromRequest($request);
            $reimbursement = $result['reimbursement'];
            $created = $result['created'];

            return response()->json([
                'reimbursement_id' => (int) $reimbursement->id,
                'reference_no'     => $reimbursement->reference_no,
                'status'           => $reimbursement->status,
                'message'          => $created
                    ? 'TS reimbursement request received and queued for OCR processing.'
                    : 'Reimbursement already exists for this ticket.',
                'data'             => $reimbursement,
            ], $created ? 201 : 200);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            Log::error('InternalTsController::storeReimbursement failed.', [
                'ticket_id' => $request->input('ticket_id'),
                'error'     => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to import TS reimbursement.',
            ], 500);
        }
    }

    /**
     * GET /api/internal/ts/reimbursements/by-ticket/{ticketId}
     */
    public function reimbursementByTicket(int $ticketId): JsonResponse
    {
        try {
            $reimbursement = $this->importService->findLatestByTicketId($ticketId);

            if (!$reimbursement) {
                return response()->json([
                    'message' => 'No reimbursement found for the specified ticket.',
                ], 404);
            }

            AuditLogService::enrichReimbursement($reimbursement, false);

            return response()->json([
                'reimbursement_id'  => (int) $reimbursement->id,
                'reference_no'      => $reimbursement->reference_no,
                'status'            => $reimbursement->status,
                'message'           => UpdateTsReimbursementStatusJob::statusMessage((string) $reimbursement->status),
                'ticket_id'         => $reimbursement->ticket_id ? (int) $reimbursement->ticket_id : $ticketId,
                'ticket_number'     => $reimbursement->ticket_number,
                'amount'            => (float) $reimbursement->amount,
                'rejection_comment' => $reimbursement->rejection_comment,
                'approved_at'       => $reimbursement->approved_at?->toIso8601String(),
                'updated_at'        => $reimbursement->updated_at?->toIso8601String(),
                'history'           => $reimbursement->getAttribute('audit_trail') ?? [],
            ]);
        } catch (\Throwable $e) {
            Log::error('InternalTsController::reimbursementByTicket failed.', [
                'ticket_id' => $ticketId,
                'error'     => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Failed to fetch ticket reimbursement status.',
            ], 500);
        }
    }
}
