<?php

namespace App\Modules\Reimbursements\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Modules\Reimbursements\Services\ReceiptService;
use App\Modules\Reimbursements\Http\Requests\StoreReceiptRequest;
use App\Modules\Reimbursements\Http\Requests\UpdateReceiptRequest;
use App\Modules\Reimbursements\Http\Requests\ResubmitReceiptRequest;
use App\Modules\Shared\Traits\HydratesSplitReceipts;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\Access\AuthorizationException;

class ReceiptController extends Controller
{
    use HydratesSplitReceipts;

    protected ReceiptService $service;

    public function __construct(ReceiptService $service)
    {
        $this->service = $service;
    }

    /**
     * List all receipts for the authenticated user.
     * Admins and approvers can see all receipts.
     */
    public function index(Request $request)
    {
        $canManage = $request->user()->can('serms.reimbursements.manage');
        $receipts = $this->service->listReceipts($request->user(), $canManage, [
            'search' => $request->query('search'),
            'status' => $request->query('status'),
            'category' => $request->query('category'),
            'scope' => $request->query('scope'),
            'sort' => $request->query('sort'),
            'per_page' => $request->query('per_page', 10),
        ]);

        return response()->json([
            'data' => $receipts->items(),
            'meta' => [
                'current_page' => $receipts->currentPage(),
                'last_page' => $receipts->lastPage(),
                'per_page' => $receipts->perPage(),
                'total' => $receipts->total(),
                'from' => $receipts->firstItem(),
                'to' => $receipts->lastItem(),
            ],
        ]);
    }

    /**
     * Get a specific receipt for the authenticated user.
     */
    public function show(Request $request, $id)
    {
        try {
            $canManage = $request->user()->can('serms.reimbursements.manage');
            
            $receipt = $this->service->getReceipt(
                $request->user(),
                (int)$id,
                $canManage
            );

            return response()->json([
                'data' => $this->hydrateSplitMetadata($receipt),
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    /**
     * Store a newly uploaded receipt in the database.
     */
    public function store(StoreReceiptRequest $request)
    {
        $fileInput = $request->file('files') ?: $request->file('file');

        $receipt = $this->service->storeReceipt(
            $request->user(),
            $request->validated(),
            $fileInput
        );

        return response()->json([
            'message' => 'Receipt uploaded and stored successfully.',
            'data' => $receipt,
        ], 201);
    }

    /**
     * Store a multi-page (segmented) receipt in the database.
     */
    public function storeSegmented(Request $request)
    {
        $request->validate([
            'files' => 'required|array|min:1',
            'files.*' => 'required|file|mimes:jpeg,png,pdf|max:2048',
        ]);

        $receipt = $this->service->storeReceipt(
            $request->user(),
            $request->all(),
            $request->file('files')
        );

        return response()->json([
            'message' => 'Segmented receipt uploaded and stored successfully.',
            'data' => $receipt,
        ], 201);
    }

    /**
     * Delete a receipt.
     */
    public function destroy(Request $request, $id)
    {
        try {
            $canManage = $request->user()->can('serms.reimbursements.manage');
            
            $this->service->deleteReceipt(
                $request->user(),
                (int)$id,
                $canManage,
                $request->ip()
            );

            return response()->json([
                'message' => 'Receipt deleted successfully.'
            ], 200);
        } catch (AuthorizationException $e) {
            return response()->json([
                'message' => $e->getMessage()
            ], 403);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => $e->validator->errors()->first('receipt') ?: $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }
    }

    /**
     * Update receipt (admin notes, status).
     */
    public function update(UpdateReceiptRequest $request, $id)
    {
        try {
            $canManage = $request->user()->can('serms.reimbursements.manage');
            
            $receipt = $this->service->updateReceipt(
                $request->user(),
                (int)$id,
                $request->validated(),
                $canManage
            );

            return response()->json([
                'message' => 'Receipt updated successfully.',
                'data' => $receipt,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }

    /**
     * Edit a receipt (unless forbidden status) and set it back to processed.
     */
    public function resubmit(ResubmitReceiptRequest $request, $id)
    {
        try {
            $receipt = $this->service->resubmitReceipt(
                $request->user(),
                (int)$id,
                $request->validated(),
                $request->file('file')
            );

            return response()->json([
                'message' => 'Receipt updated successfully.',
                'data' => $receipt,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => $e->validator->errors()->first('status') ?: $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        }
    }

    /**
     * Re-run the OCR pipeline for a receipt.
     */
    public function retryOcr(Request $request, $id)
    {
        try {
            $receipt = $this->service->retryOcrReceipt(
                $request->user(),
                (int) $id
            );

            return response()->json([
                'message' => 'OCR reprocessing started.',
                'data' => $receipt,
            ]);
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        }
    }
}
