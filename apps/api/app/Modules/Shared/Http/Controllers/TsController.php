<?php

namespace App\Modules\Shared\Http\Controllers;

use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Shared\Services\TsClientService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class TsController extends Controller
{
    public function __construct(
        protected TsClientService $tsClient
    ) {}

    /**
     * GET /api/ts/tickets
     */
    public function tickets(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:120',
            'status' => 'nullable|string|max:64',
            'limit'  => 'nullable|integer|min:1|max:200',
        ]);

        $result = $this->tsClient->listTickets(
            $validated['search'] ?? null,
            $validated['status'] ?? null,
            (int) ($validated['limit'] ?? 100)
        );

        if (!$result['available'] || empty($result['data'])) {
            return response()->json($result);
        }

        $ticketIds = collect($result['data'])
            ->pluck('ticket_id')
            ->filter(fn ($id) => (int) $id > 0)
            ->unique()
            ->values()
            ->all();

        $reimbursementsByTicket = empty($ticketIds)
            ? collect()
            : Reimbursement::query()
                ->whereIn('ticket_id', $ticketIds)
                ->orderByDesc('id')
                ->get(['id', 'ticket_id', 'status', 'amount', 'created_at'])
                ->groupBy('ticket_id')
                ->map(fn ($group) => $group->first());

        $result['data'] = array_map(function (array $ticket) use ($reimbursementsByTicket) {
            $reimb = $reimbursementsByTicket->get((int) $ticket['ticket_id']);

            $ticket['reimbursement'] = $reimb ? [
                'reimbursement_id'     => (int) $reimb->id,
                'reference_no'         => $reimb->reference_no,
                'status'               => $reimb->status,
                'amount'               => (float) $reimb->amount,
                'reimbursement_status' => $reimb->status,
                'reimbursement_amount' => (float) $reimb->amount,
            ] : null;

            return $ticket;
        }, $result['data']);

        return response()->json($result);
    }
}
