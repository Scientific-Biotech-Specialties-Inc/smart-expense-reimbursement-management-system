<?php

namespace App\Modules\Reimbursements\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Reimbursements\Http\Requests\OcrCallbackRequest;
use App\Modules\Reimbursements\Services\OcrCallbackService;
use Illuminate\Http\JsonResponse;

/**
 * Receives the OCR + categorization results POSTed by the external AI service.
 *
 * Route: POST /api/reimbursements/receipts/{id}/ocr-callback
 * Auth:  Bearer token via AuthenticateAiServiceApi middleware (AI_SERVICE_API_KEY)
 */
class OcrCallbackController extends Controller
{
    public function __construct(protected OcrCallbackService $service) {}

    public function __invoke(OcrCallbackRequest $request, int $id): JsonResponse
    {
        $receipt = $this->service->handle($id, $request->validated());

        return response()->json([
            'message' => 'OCR results applied successfully.',
            'data'    => [
                'receipt_id'           => $receipt->id,
                'status'               => $receipt->status,
                'ocr_flagged'          => $receipt->ocr_flagged,
                'ocr_confidence_score' => $receipt->ocr_confidence_score,
                'rejection_code'       => $receipt->rejection_code,
                'rejection_reason'     => $receipt->rejection_reason,
            ],
        ]);
    }
}
