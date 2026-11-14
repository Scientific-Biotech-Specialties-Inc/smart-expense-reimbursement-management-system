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
    /**
     * Enrich a CashAdvance model with penalties totals, aging, linked liquidation aliases,
     * normalized status history, and balance fields.
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
                $approvalHistory = $advance->approvalActions->map(function ($a) {
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
