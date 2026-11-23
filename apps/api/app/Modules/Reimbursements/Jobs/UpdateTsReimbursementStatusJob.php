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

class UpdateTsReimbursementStatusJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(
        public int $reimbursementId,
        public ?int $ticketId = null,
        public ?string $ticketNumber = null,
        public ?string $status = null,
        public ?string $rejectionComment = null,
    ) {}

    public static function statusMessage(string $status): string
    {
        return match (strtolower(trim($status))) {
            'pending', 'submitted' => 'Reimbursement request is pending review.',
            'revise'               => 'Reimbursement request was returned for revision.',
            'approved'             => 'Reimbursement request has been approved.',
            'granted', 'paid'      => 'Reimbursement payout has been granted.',
            'rejected'             => 'Reimbursement request has been rejected.',
            default                => 'Reimbursement status updated.',
        };
    }

    public function handle(): void
    {
        $url = trim((string) config('services.ts.reimbursement_status_url', ''));
        $secret = trim((string) config('services.ts.internal_secret', ''));
        $timeout = (int) config('services.ts.timeout', 10);

        if ($url === '' || $secret === '') {
            Log::info('TS reimbursement status URL or secret is not configured. Skipping TS status webhook.', [
                'reimbursement_id' => $this->reimbursementId,
                'ticket_id'        => $this->ticketId,
            ]);
            return;
        }

        $reimbursement = Reimbursement::find($this->reimbursementId);

        $ticketId = $this->ticketId
            ?? ($reimbursement?->ticket_id ? (int) $reimbursement->ticket_id : null)
            ?? (is_numeric($reimbursement?->source_submission_id) ? (int) $reimbursement->source_submission_id : null);
        $ticketNumber = $this->ticketNumber ?? $reimbursement?->ticket_number;
        $status = (string) ($this->status ?? $reimbursement?->status ?? 'pending');
        $rejectionComment = $this->rejectionComment ?? $reimbursement?->rejection_comment;
        $referenceNo = $reimbursement?->reference_no
            ?: ('RMB-' . date('Y') . '-' . str_pad((string) $this->reimbursementId, 5, '0', STR_PAD_LEFT));
        $updatedAt = $reimbursement?->updated_at?->toIso8601String() ?? now()->toIso8601String();

        $payload = [
            'ticket_id'         => $ticketId,
            'ticket_number'     => $ticketNumber,
            'reimbursement_id'  => $this->reimbursementId,
            'reference_no'      => $referenceNo,
            'status'            => $status,
            'message'           => self::statusMessage($status),
            'rejection_comment' => $rejectionComment,
            'updated_at'        => $updatedAt,
        ];

        try {
            $response = Http::timeout($timeout)
                ->acceptJson()
                ->asJson()
                ->withHeaders([
                    'X-Internal-Token'  => $secret,
                    'X-Internal-Secret' => $secret,
                ])
                ->post($url, $payload);

            if ($response->failed()) {
                throw new \RuntimeException(
                    "TS reimbursement status webhook failed with HTTP {$response->status()}: {$response->body()}"
                );
            }

            Log::info('UpdateTsReimbursementStatusJob: synced reimbursement status to TS.', [
                'reimbursement_id' => $this->reimbursementId,
                'ticket_id'        => $ticketId,
                'status'           => $status,
            ]);
        } catch (\Throwable $e) {
            Log::error('UpdateTsReimbursementStatusJob: failed to sync status to TS.', [
                'reimbursement_id' => $this->reimbursementId,
                'ticket_id'        => $ticketId,
                'url'              => $url,
                'error'            => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
