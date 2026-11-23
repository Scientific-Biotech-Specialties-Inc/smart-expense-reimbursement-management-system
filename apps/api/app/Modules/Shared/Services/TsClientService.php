<?php

namespace App\Modules\Shared\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TsClientService
{
    /**
     * Fetch tickets from the external Ticketing System (TS) internal endpoint.
     *
     * @return array{available: bool, data: array<int, array<string, mixed>>, error?: string}
     */
    public function listTickets(?string $search = null, ?string $status = null, int $limit = 100): array
    {
        $baseUrl = rtrim((string) config('services.ts.api_url', ''), '/');
        if ($baseUrl === '') {
            return ['available' => false, 'data' => [], 'error' => 'TS_API_URL is not configured.'];
        }

        $secret = (string) (config('services.ts.internal_secret') ?: '');
        $timeout = (int) config('services.ts.timeout', 10);

        $query = ['limit' => max(1, min($limit, 200))];
        if ($search !== null && trim($search) !== '') {
            $query['search'] = trim($search);
        }
        if ($status !== null && trim($status) !== '' && strtolower(trim($status)) !== 'all') {
            $query['status'] = trim($status);
        }

        try {
            $response = Http::timeout($timeout)
                ->acceptJson()
                ->withHeaders([
                    'X-Internal-Token'  => $secret,
                    'X-Internal-Secret' => $secret,
                ])
                ->get("{$baseUrl}/internal/tickets", $query);

            if ($response->failed()) {
                Log::warning('TsClientService: listTickets failed.', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);

                return [
                    'available' => false,
                    'data'      => [],
                    'error'     => "TS returned HTTP {$response->status()}.",
                ];
            }

            $json = $response->json();
            $rawItems = is_array($json['data'] ?? null)
                ? $json['data']
                : (is_array($json['tickets'] ?? null)
                    ? $json['tickets']
                    : (is_array($json) && array_is_list($json) ? $json : []));

            $normalized = [];
            foreach ($rawItems as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $ticket = $this->normalizeTicket($item);
                if ($ticket['ticket_id'] > 0) {
                    $normalized[] = $ticket;
                }
            }

            return [
                'available' => true,
                'data'      => $normalized,
            ];
        } catch (\Throwable $e) {
            Log::warning('TsClientService: listTickets connection error.', [
                'error' => $e->getMessage(),
            ]);

            return [
                'available' => false,
                'data'      => [],
                'error'     => $e->getMessage(),
            ];
        }
    }

    /**
     * Normalize TS ticket schema variants into a consistent SERMS payload.
     *
     * @param  array<string, mixed> $raw
     * @return array<string, mixed>
     */
    private function normalizeTicket(array $raw): array
    {
        $ticketId = (int) ($raw['ticket_id'] ?? $raw['ticket_ID'] ?? $raw['id'] ?? 0);

        return [
            'ticket_id'      => $ticketId,
            'ticket_number'  => (string) ($raw['ticket_number'] ?? ($ticketId > 0 ? "TKT-{$ticketId}" : '')),
            'title'          => (string) ($raw['title'] ?? $raw['subject'] ?? ''),
            'status'         => (string) ($raw['status'] ?? $raw['status_name'] ?? data_get($raw, 'ticket_status.status_name') ?? ''),
            'priority'       => $raw['priority'] ?? data_get($raw, 'ticket_priority.priority_name') ?? null,
            'assignee_name'  => $raw['assignee_name'] ?? data_get($raw, 'assignee.name') ?? $raw['assigned_to_name'] ?? null,
            'assignee_email' => $raw['assignee_email'] ?? data_get($raw, 'assignee.email') ?? $raw['assigned_to_email'] ?? null,
            'department'     => $raw['department'] ?? data_get($raw, 'assignee.department') ?? null,
            'created_at'     => $raw['created_at'] ?? null,
            'updated_at'     => $raw['updated_at'] ?? null,
        ];
    }
}
