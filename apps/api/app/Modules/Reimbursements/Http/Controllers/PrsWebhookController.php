<?php

namespace App\Modules\Reimbursements\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Services\PrsReimbursementImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class PrsWebhookController extends Controller
{
    private const EVENT = 'prs.reimbursement.requested';

    public function __construct(private readonly PrsReimbursementImportService $importService)
    {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $signatureError = $this->signatureError($request);
        if ($signatureError) {
            return response()->json(['message' => $signatureError], 401);
        }

        $payload = $request->json()->all();
        $validator = Validator::make($payload, $this->importService->baseRules([
            'event' => ['required', Rule::in([self::EVENT])],
        ]));

        if ($validator->fails()) {
            return response()->json([
                'message' => 'The given data was invalid.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $deliveryId = $request->header('X-PRS-Delivery-Id');
        $existing = Reimbursement::with('receipts')
            ->where('source_system', 'prs')
            ->where('source_submission_id', (string) $payload['source_submission_id'])
            ->first();

        if (!$existing && $deliveryId) {
            $existing = Reimbursement::with('receipts')->where('source_delivery_id', $deliveryId)->first();
        }

        if ($existing) {
            return response()->json([
                'message' => 'PRS reimbursement request already imported.',
                'data' => $existing,
            ]);
        }

        $reimbursement = $this->importService->import($payload, [
            'source_delivery_id' => $deliveryId,
        ]);

        return response()->json([
            'message' => 'PRS reimbursement request imported.',
            'data' => $reimbursement,
        ], 201);
    }

    private function signatureError(Request $request): ?string
    {
        $secret = config('services.prs.webhook_secret')
            ?: getenv('PRS_WEBHOOK_SECRET')
            ?: ($_ENV['PRS_WEBHOOK_SECRET'] ?? null)
            ?: ($_SERVER['PRS_WEBHOOK_SECRET'] ?? null);
        if (!$secret) {
            return 'PRS webhook secret is not configured.';
        }

        if ($request->header('X-PRS-Event') !== self::EVENT) {
            return 'Invalid PRS webhook event.';
        }

        $timestamp = $request->header('X-PRS-Timestamp');
        $signature = $request->header('X-PRS-Signature');
        if (!$timestamp || !$signature) {
            return 'Missing PRS webhook signature headers.';
        }

        $tolerance = (int) config('services.prs.webhook_tolerance_seconds', 300);
        if (abs(time() - (int) $timestamp) > $tolerance) {
            return 'PRS webhook signature has expired.';
        }

        $expected = 'sha256=' . hash_hmac('sha256', $timestamp . '.' . $request->getContent(), $secret);

        return hash_equals($expected, $signature) ? null : 'Invalid PRS webhook signature.';
    }
}
