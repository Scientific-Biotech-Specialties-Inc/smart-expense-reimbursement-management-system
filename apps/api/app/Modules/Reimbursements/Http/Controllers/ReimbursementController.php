<?php

namespace App\Modules\Reimbursements\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Modules\Reimbursements\Services\ReimbursementService;
use App\Modules\Reimbursements\Http\Requests\StoreReimbursementRequest;
use App\Modules\Reimbursements\Http\Requests\ApproveReimbursementRequest;
use App\Modules\Reimbursements\Http\Requests\RejectReimbursementRequest;
use App\Modules\Reimbursements\Http\Requests\GrantReimbursementRequest;
use App\Modules\Reimbursements\Http\Requests\UpdateReimbursementRequest;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\Access\AuthorizationException;

class ReimbursementController extends Controller
{
    protected ReimbursementService $service;

    public function __construct(ReimbursementService $service)
    {
        $this->service = $service;
    }

    /**
     * List all reimbursements.
     */
    public function index(Request $request)
    {
        $canManage = $request->user()->can('serms.reimbursements.manage');
        $claims = $this->service->listReimbursements($request->user(), $canManage);

        return response()->json($claims);
    }

    /**
     * Submit a new reimbursement request.
     */
    public function store(StoreReimbursementRequest $request)
    {
        $reimbursement = $this->service->storeReimbursement(
            $request->user(),
            $request->validated(),
            $request->file('report_file')
        );

        return response()->json([
            'message' => 'Reimbursement request submitted successfully.',
            'data' => $reimbursement,
        ], 201);
    }

    /**
     * View detailed claim.
     */
    public function show(Request $request, $id)
    {
        try {
            $canManage = $request->user()->can('serms.reimbursements.manage');
            $reimbursement = $this->service->showReimbursement($request->user(), (int)$id, $canManage);

            return response()->json($reimbursement);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    /**
     * Approve claim.
     */
    public function approve(ApproveReimbursementRequest $request, $id)
    {
        try {
            $reimbursement = $this->service->approveReimbursement(
                $request->user(),
                (int)$id,
                $request->validated('password'),
                $request->ip(),
                $request,
                (bool) $request->validated('secondary_audit_confirmed', false),
                $request->validated('secondary_audit_note')
            );

            return response()->json([
                'message' => 'Reimbursement request approved.',
                'data' => $reimbursement,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $e->errors(),
            ], 422);
        }
    }

    /**
     * Reject / Revise claim — dropdown action.
     */
    public function reject(RejectReimbursementRequest $request, $id)
    {
        try {
            $action = $request->validated('action', 'reject');
            $reimbursement = $this->service->rejectReimbursement(
                $request->user(),
                (int)$id,
                $request->validated('comment'),
                $request->validated('password'),
                $request->ip(),
                $request,
                $action
            );

            $isRejected = $reimbursement->status === 'rejected';
            return response()->json([
                'message' => $isRejected ? ($action === 'reject' ? 'Reimbursement request rejected.' : 'Reimbursement request rejected (exceeded revision limit).') : 'Reimbursement returned for revision.',
                'data' => $reimbursement,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $e->errors(),
            ], 422);
        }
    }

    /**
     * Grant (disburse) a previously approved claim.
     */
    public function grant(GrantReimbursementRequest $request, $id)
    {
        try {
            $reimbursement = $this->service->grantReimbursement(
                $request->user(),
                (int)$id,
                $request->validated('password'),
                $request->ip(),
                $request,
                $request->validated()
            );

            return response()->json([
                'message' => 'Reimbursement granted.',
                'data' => $reimbursement,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $e->errors(),
            ], 422);
        }
    }

    /**
     * Employee acknowledges their granted payout.
     */
    public function acknowledge(\App\Modules\Reimbursements\Http\Requests\AcknowledgePayoutRequest $request, $id)
    {
        try {
            $reimbursement = $this->service->acknowledgePayout(
                $request->user(),
                (int)$id,
                $request->validated('employee_signature'),
                $request->ip()
            );

            return response()->json([
                'message' => 'Payout acknowledged successfully.',
                'data' => $reimbursement,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    /**
     * Update reimbursement details (admin notes or employee self-edit).
     */
    public function update(UpdateReimbursementRequest $request, $id)
    {
        try {
            $canManage = $request->user()->can('serms.reimbursements.manage');
            
            $reimbursement = $this->service->updateReimbursement(
                $request->user(),
                (int)$id,
                $request->validated(),
                $canManage,
                $request->file('report_file')
            );

            return response()->json([
                'message' => 'Reimbursement updated successfully.',
                'data' => $reimbursement,
            ]);
        } catch (\Illuminate\Auth\Access\AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    /**
     * Delete a pending reimbursement request.
     */
    public function destroy(Request $request, $id)
    {
        try {
            $this->service->deleteReimbursement(
                $request->user(),
                (int)$id,
                $request->input('password', ''),
                $request
            );

            return response()->json([
                'message' => 'Reimbursement request deleted successfully.',
            ]);
        } catch (\Illuminate\Auth\Access\AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $e->errors(),
            ], 422);
        }
    }
}
