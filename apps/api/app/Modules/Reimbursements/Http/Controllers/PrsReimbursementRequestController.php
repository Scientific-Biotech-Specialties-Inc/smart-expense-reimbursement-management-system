<?php

namespace App\Modules\Reimbursements\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Services\PrsReimbursementImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class PrsReimbursementRequestController extends Controller
{
    public function __construct(private readonly PrsReimbursementImportService $importService)
    {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $payload = $request->json()->all();
        $validator = Validator::make($payload, $this->importService->baseRules([
            'is_request' => ['required', 'accepted'],
            'is_reimbursed' => ['required', 'declined'],
        ]));

        if ($validator->fails()) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $existing = Reimbursement::with('receipts')
            ->where('source_system', 'prs')
            ->where('source_submission_id', (string) $payload['source_submission_id'])
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'PRS reimbursement request already imported.',
                'data' => $existing,
            ]);
        }

        $reimbursement = $this->importService->import($payload, [
            'is_request' => true,
        ]);

        return response()->json([
            'message' => 'PRS reimbursement request imported.',
            'data' => $reimbursement,
        ], 201);
    }
}
