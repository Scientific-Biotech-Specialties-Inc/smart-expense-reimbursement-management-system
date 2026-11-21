<?php

namespace App\Modules\Shared\Services;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\PenaltyRecord;
use Carbon\Carbon;

/**
 * Shared Unified Roadmap enrichment for CashAdvance models across CashAdvances and Liquidations.
 */
class CashAdvanceEnrichmentService
{
    private const DISBURSED_PAYOUT_STATUSES = [
        'disbursed',
        'signed',
        'unliquidated',
        'under-review',
        'incomplete',
        'overdue',
        'liquidated',
        'settled',
    ];

    /**
     * Enrich a CashAdvance model with penalties totals, aging, linked liquidation aliases,
     * normalized status history, payout details, and balance fields.
     */
    public function enrich(CashAdvance $advance, bool $includeExtraRoadmapFields = false): CashAdvance
    {
        $penaltiesTotal = $advance->getAttribute('penalties_total');
        if ($penaltiesTotal === null) {
            $penaltiesTotal = $advance->relationLoaded('penalties')
                ? $advance->penalties->sum(fn ($p) => (float) ($p->penalty_amount ?? 0))
                : (float) PenaltyRecord::where('cash_advance_id', $advance->id)->sum('penalty_amount');
        }
        $advance->setAttribute('penalties_total', (float) $penaltiesTotal);
        $advance->setAttribute('penalties_sum', (float) $penaltiesTotal);

        $advance->setAttribute('days_overdue', $this->computeDaysOverdue($advance));

        $latest = null;
        if ($advance->relationLoaded('liquidations')) {
            $latest = $advance->liquidations->sortByDesc('created_at')->sortByDesc('id')->first();
            $advance->setAttribute('linked_liquidation', $latest);
            $advance->setAttribute('latest_liquidation', $latest);
            $advance->setAttribute('liquidation', $latest);
        } elseif ($includeExtraRoadmapFields) {
            $advance->setAttribute('linked_liquidation', null);
            $advance->setAttribute('latest_liquidation', null);
            $advance->setAttribute('liquidation', null);
        }

        if ($includeExtraRoadmapFields) {
            $overpayment = 0;
            if ($latest) {
                $expense = (float) ($latest->total_expense_amount ?? 0);
                $snapshotBalance = (float) ($latest->outstanding_balance ?? $advance->outstanding_balance ?? $advance->amount ?? 0);
                if ($expense > $snapshotBalance) {
                    $overpayment = $expense - $snapshotBalance;
                }
            }
            $advance->setAttribute('overpayment_amount', (float) $overpayment);
            $advance->setAttribute('overpaymentAmount', (float) $overpayment);
        }

        if ($advance->relationLoaded('statusHistory')) {
            $history = $advance->statusHistory->sortBy('changed_at')->sortBy('id')->map(function ($h) use ($includeExtraRoadmapFields) {
                $actor = $h->relationLoaded('changedBy') && $h->changedBy
                    ? $h->changedBy
                    : ($h->relationLoaded('user') ? $h->user : null);

                $entry = [
                    'id' => $h->id,
                    'cash_advance_id' => $h->cash_advance_id,
                    'from_status' => $h->from_status,
                    'to_status' => $h->to_status,
                    'status' => $h->to_status,
                    'changed_by' => $actor ? ['id' => $actor->id, 'name' => $actor->name, 'email' => $actor->email] : null,
                    'changed_by_id' => $h->changed_by,
                    'actor' => $actor?->name,
                    'user' => $actor ? ['id' => $actor->id, 'name' => $actor->name, 'email' => $actor->email] : null,
                    'changed_at' => $h->changed_at ?? $h->created_at,
                    'created_at' => $h->created_at,
                ];

                if ($includeExtraRoadmapFields) {
                    $entry['updated_at'] = $h->updated_at;
                }

                return $entry;
            })->values();
            $advance->setAttribute('status_history', $history);
        } elseif ($includeExtraRoadmapFields) {
            $advance->setAttribute('status_history', collect());
        }

        if ($includeExtraRoadmapFields) {
            $approvalHistory = collect();
            if ($advance->relationLoaded('approvalActions')) {
                $approvalHistory = $advance->getRelation('approvalActions')->map(function ($a) {
                    $approver = $a->relationLoaded('approver') ? $a->approver : null;
                    return [
                        'id' => $a->id,
                        'action' => $a->action,
                        'comment' => $a->comment,
                        'approver' => $approver ? ['id' => $approver->id, 'name' => $approver->name, 'email' => $approver->email] : null,
                        'created_at' => $a->created_at,
                        'actioned_at' => $a->actioned_at ?? $a->created_at,
                    ];
                });
            }
            $advance->setAttribute('approval_actions', $approvalHistory);
            $advance->setAttribute('approvalActions', $approvalHistory);
            $advance->setAttribute('expected_disbursement_date', $advance->expected_disbursement_date);
        }

        $latestApproved = null;
        if ($advance->relationLoaded('approvalActions')) {
            $latestApproved = $advance->getRelation('approvalActions')
                ->where('action', 'approved')
                ->sortByDesc(fn ($action) => [
                    $action->actioned_at?->getTimestamp() ?? $action->created_at?->getTimestamp() ?? 0,
                    (int) $action->id,
                ])
                ->first();
        }

        $approvedBy = ($latestApproved && $latestApproved->relationLoaded('approver') && $latestApproved->approver)
            ? $latestApproved->approver->name
            : 'Approver';
        $approvedAtRaw = $latestApproved
            ? ($latestApproved->actioned_at ?? $latestApproved->created_at ?? $advance->updated_at)
            : $advance->updated_at;
        $approvedAt = $approvedAtRaw ? Carbon::parse($approvedAtRaw)->toIso8601String() : null;

        $disbursement = $advance->relationLoaded('disbursement') ? $advance->getRelation('disbursement') : null;
        $isDisbursedStatus = in_array($advance->status, self::DISBURSED_PAYOUT_STATUSES, true);

        if ($latestApproved !== null || $disbursement !== null || $isDisbursedStatus || $advance->status === 'approved') {
            $advance->setAttribute('approved_by', $approvedBy);
            $advance->setAttribute('approved_at', $approvedAt);
        }

        if ($disbursement !== null || $isDisbursedStatus) {
            $requestDateRaw = $advance->submitted_at ?? $advance->created_at;
            $grantedAtRaw = $disbursement?->created_at ?? $disbursement?->disbursement_date ?? $advance->updated_at;
            $grantedBy = $disbursement?->granted_by
                ?: ($disbursement && $disbursement->relationLoaded('disbursedBy') && $disbursement->disbursedBy
                    ? $disbursement->disbursedBy->name
                    : null)
                ?: 'Finance / Admin';

            $advance->setAttribute('payout', [
                'id' => $disbursement?->id ?? $advance->id,
                'cash_advance_id' => $advance->id,
                'request_date' => $requestDateRaw ? Carbon::parse($requestDateRaw)->toDateString() : null,
                'approved_at' => $approvedAt,
                'granted_at' => $grantedAtRaw ? Carbon::parse($grantedAtRaw)->toIso8601String() : null,
                'approved_by' => $approvedBy,
                'granted_by' => $grantedBy,
                'payout_method' => $disbursement?->payout_method ?: $disbursement?->channel ?: 'Cash',
                'payout_method_other' => $disbursement?->payout_method_other,
                'reference_number' => $disbursement?->reference_number,
                'amount' => $advance->amount,
                'granter_signature' => $disbursement?->granter_signature,
                'employee_signature' => $advance->signature,
                'acknowledged_at' => $advance->acknowledged_at ? Carbon::parse($advance->acknowledged_at)->toIso8601String() : null,
            ]);
        }

        $advance->setAttribute('balance', $advance->outstanding_balance !== null ? (float) $advance->outstanding_balance : (float) ($advance->amount ?? 0));
        $advance->setAttribute('outstanding_balance', $advance->outstanding_balance);
        $advance->setAttribute('expected_liquidation_date', $advance->expected_liquidation_date);

        return $advance;
    }

    private function computeDaysOverdue(CashAdvance $advance): int
    {
        $due = $advance->expected_liquidation_date;
        $daysOverdue = 0;

        if ($due) {
            $today = Carbon::now()->startOfDay();
            $dueDate = Carbon::parse($due)->startOfDay();
            $isTerminal = in_array($advance->status, ['liquidated', 'settled', 'rejected']);
            $isAuditing = in_array($advance->status, ['pending', 'under-review', 'approved']);
            if ($today->gt($dueDate) && !$isTerminal && !$isAuditing) {
                $daysOverdue = $today->diffInDays($dueDate);
            } elseif ($advance->relationLoaded('penalties') && $advance->penalties->isNotEmpty()) {
                $maxDays = $advance->penalties->max('days_overdue');
                if ($maxDays) {
                    $daysOverdue = max($daysOverdue, (int) $maxDays);
                }
            }
        } elseif ($advance->relationLoaded('penalties') && $advance->penalties->isNotEmpty()) {
            $daysOverdue = (int) ($advance->penalties->max('days_overdue') ?? $advance->penalties->count());
        }

        return (int) $daysOverdue;
    }
}
