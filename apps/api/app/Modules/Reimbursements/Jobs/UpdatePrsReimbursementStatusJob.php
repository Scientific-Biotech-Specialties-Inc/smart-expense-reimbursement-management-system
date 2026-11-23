<?php

namespace App\Modules\Reimbursements\Jobs;

use App\Modules\Reimbursements\Models\Reimbursement;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class UpdatePrsReimbursementStatusJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(
        public $sourceSubmissionId = null,
        public ?int $reimbursementId = null,
        public ?int $activityId = null,
        public ?string $status = null,
        public ?string $rejectionComment = null,
    ) {}

    public function handle(): void
    {
        $apiUrl = trim((string) config('services.prs.reimbursement_status_api_url', ''));
        if ($apiUrl === '') {
            $baseApiUrl = rtrim((string) config('services.prs.api_url', ''), '/');
            if ($baseApiUrl !== '') {
                $apiUrl = $baseApiUrl . '/api/integrations/serms/reimbursements/status';
            }
        }

        $internalSecret = trim((string) (
            config('services.prs.internal_secret')
            ?: config('services.prs.reimbursement_status_api_key')
            ?: config('services.cms.internal_secret')
            ?: ''
        ));
        $webhookSecret = trim((string) (
            config('services.prs.webhook_secret')
            ?: $internalSecret
        ));
        $timeout = (int) config('services.prs.reimbursement_status_api_timeout', 10);

        if ($apiUrl === '' || ($internalSecret === '' && $webhookSecret === '')) {
            Log::warning('PRS reimbursement status API is not configured. Skipping PRS status update.');
            return;
        }

        $reimbursement = null;
        if ($this->reimbursementId !== null) {
            $reimbursement = Reimbursement::find($this->reimbursementId);
        } elseif ($this->sourceSubmissionId !== null) {
            $submissionId = (string) $this->sourceSubmissionId;
            $reimbursement = Reimbursement::where('source_system', 'prs')
                ->where(function ($q) use ($submissionId) {
                    $q->where('source_submission_id', $submissionId);
                    if (is_numeric($submissionId)) {
                        $q->orWhere('prs_activity_id', (int) $submissionId);
                    }
                })
                ->orderByDesc('id')
                ->first();
        }

        $reimbursementId = $this->reimbursementId ?? $reimbursement?->id;
        $activityId = $this->activityId
            ?? $reimbursement?->prs_activity_id
            ?? (is_numeric($this->sourceSubmissionId) ? (int) $this->sourceSubmissionId : null);
        $sourceSubmissionId = $this->sourceSubmissionId
            ?? $reimbursement?->source_submission_id
            ?? ($activityId !== null ? (string) $activityId : null);

        $sermsStatus = strtolower(trim((string) ($this->status ?? $reimbursement?->status ?? 'pending')));
        $isReimbursed = in_array($sermsStatus, ['approved', 'granted', 'paid'], true) ? 1 : 0;
        $referenceNo = $reimbursement?->reference_no
            ?: ($reimbursementId ? ('RMB-' . date('Y') . '-' . str_pad((string) $reimbursementId, 5, '0', STR_PAD_LEFT)) : null);

        $payload = [
            'external_reference'   => $referenceNo,
            'reference_no'         => $referenceNo,
            'reimbursement_id'     => $reimbursementId,
            'activity_id'          => $activityId,
            'source_submission_id' => $sourceSubmissionId,
            'status'               => $sermsStatus,
            'serms_status'         => $sermsStatus,
            'is_reimbursed'        => $isReimbursed,
            'amount'               => $reimbursement ? (float) $reimbursement->amount : null,
            'rejection_comment'    => $this->rejectionComment ?? $reimbursement?->rejection_comment,
            'updated_at'           => $reimbursement?->updated_at?->toIso8601String() ?? now()->toIso8601String(),
        ];

        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $signature = $webhookSecret !== '' ? 'sha256=' . hash_hmac('sha256', (string) $body, $webhookSecret) : '';

        $headers = [
            'X-Internal-Secret' => $internalSecret,
            'X-Internal-Token'  => $internalSecret,
            'X-SERMS-Signature' => $signature,
        ];

        try {
            $request = Http::timeout($timeout)
                ->acceptJson()
                ->asJson()
                ->withHeaders($headers);

            if ($internalSecret !== '') {
                $request = $request->withToken($internalSecret);
            }

            $response = $request->post($apiUrl, $payload);

            if ($response->failed()) {
                Log::error('Failed to update PRS reimbursement status.', [
                    'source_submission_id' => $sourceSubmissionId,
                    'reimbursement_id'     => $reimbursementId,
                    'activity_id'          => $activityId,
                    'status'               => $response->status(),
                    'body'                 => $response->body(),
                ]);
            } else {
                Log::info('Successfully updated PRS reimbursement status.', [
                    'source_submission_id' => $sourceSubmissionId,
                    'reimbursement_id'     => $reimbursementId,
                    'activity_id'          => $activityId,
                    'serms_status'         => $sermsStatus,
                ]);
            }
        } catch (\Throwable $e) {
            Log::error('Exception while updating PRS reimbursement status.', [
                'source_submission_id' => $sourceSubmissionId,
                'reimbursement_id'     => $reimbursementId,
                'activity_id'          => $activityId,
                'message'              => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
