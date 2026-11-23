<?php

namespace App\Modules\CashAdvances\Jobs;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\CashAdvances\Services\PrsCashAdvanceService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class UpdatePrsCashAdvanceStatusJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(
        public int $cashAdvanceId,
        public ?int $itineraryId = null,
        public ?string $status = null,
        public ?string $rejectionComment = null,
    ) {}

    public function handle(): void
    {
        $url = trim((string) config('services.prs.cash_advance_status_api_url', ''));
        if ($url === '') {
            $baseUrl = rtrim((string) config('services.prs.api_url', ''), '/');
            if ($baseUrl !== '') {
                $url = $baseUrl . '/api/integrations/serms/cash-advances/status';
            }
        }

        $secret = trim((string) (
            config('services.prs.internal_secret')
            ?: config('services.prs.reimbursement_api_key')
            ?: env('PRS_INTERNAL_SECRET')
            ?: env('INTERNAL_SERVICE_SECRET')
            ?: ''
        ));
        $webhookSecret = trim((string) (config('services.prs.webhook_secret') ?: $secret));
        $timeout = (int) config('services.prs.reimbursement_status_api_timeout', 10);

        if ($url === '' || $secret === '') {
            Log::info('PRS cash advance status URL or secret is not configured. Skipping PRS status webhook.', [
                'cash_advance_id' => $this->cashAdvanceId,
                'itinerary_id'    => $this->itineraryId,
            ]);
            return;
        }

        $advance = CashAdvance::with([
            'approvalActions' => fn ($q) => $q->orderByDesc('id'),
        ])->find($this->cashAdvanceId);

        $itineraryId = $this->itineraryId ?? ($advance?->itinerary_id ? (int) $advance->itinerary_id : null);
        $status = (string) ($this->status ?? $advance?->status ?? 'pending');
        $referenceNo = $advance?->reference_no
            ?: ('CA-' . date('Y') . '-' . str_pad((string) $this->cashAdvanceId, 5, '0', STR_PAD_LEFT));

        $rejectionComment = $this->rejectionComment;
        if ($rejectionComment === null && $advance) {
            $latestRejection = $advance->approvalActions
                ->first(fn ($action) => in_array((string) $action->action, ['rejected', 'revised'], true));
            $rejectionComment = $latestRejection?->comment;
        }

        $gating = PrsCashAdvanceService::gatingForStatus($status);

        $payload = [
            'cash_advance_id'    => $this->cashAdvanceId,
            'external_reference' => $referenceNo,
            'reference_no'       => $referenceNo,
            'itinerary_id'       => $itineraryId,
            'status'             => $status,
            'amount'             => $advance ? (float) $advance->amount : 0.0,
            'is_done'            => $gating['is_done'],
            'can_proceed'        => $gating['can_proceed'],
            'can_remove'         => $gating['can_remove'],
            'rejection_comment'  => $rejectionComment,
            'updated_at'         => $advance?->updated_at?->toIso8601String() ?? now()->toIso8601String(),
        ];

        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $signature = 'sha256=' . hash_hmac('sha256', (string) $body, $webhookSecret);

        try {
            $response = Http::timeout($timeout)
                ->acceptJson()
                ->withHeaders([
                    'X-Internal-Secret' => $secret,
                    'X-Internal-Token'  => $secret,
                    'X-SERMS-Signature' => $signature,
                ])
                ->withBody((string) $body, 'application/json')
                ->post($url);

            if ($response->failed()) {
                throw new \RuntimeException(
                    "PRS cash advance status webhook failed with HTTP {$response->status()}: {$response->body()}"
                );
            }

            Log::info('UpdatePrsCashAdvanceStatusJob: synced cash advance status to PRS.', [
                'cash_advance_id' => $this->cashAdvanceId,
                'itinerary_id'    => $itineraryId,
                'status'          => $status,
            ]);
        } catch (\Throwable $e) {
            Log::error('UpdatePrsCashAdvanceStatusJob: failed to sync status to PRS.', [
                'cash_advance_id' => $this->cashAdvanceId,
                'itinerary_id'    => $itineraryId,
                'url'             => $url,
                'error'           => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
