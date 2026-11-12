<?php

namespace App\Modules\AuditLogs\Services;

use App\Modules\AuditLogs\Models\AuditLog;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class AuditLogService
{
    public const ACTION_META = [
        'CLAIM_SUBMITTED' => ['label' => 'Submitted', 'tone' => 'info', 'domain' => 'reimbursement', 'domain_label' => 'Reimbursement'],
        'CLAIM_RESUBMITTED' => ['label' => 'Resubmitted', 'tone' => 'info', 'domain' => 'reimbursement', 'domain_label' => 'Reimbursement'],
        'CLAIM_UPDATED' => ['label' => 'Updated', 'tone' => 'neutral', 'domain' => 'reimbursement', 'domain_label' => 'Reimbursement'],
        'CLAIM_APPROVED' => ['label' => 'Approved', 'tone' => 'success', 'domain' => 'reimbursement', 'domain_label' => 'Reimbursement'],
        'CLAIM_REVISED' => ['label' => 'Revision Requested', 'tone' => 'warning', 'domain' => 'reimbursement', 'domain_label' => 'Reimbursement'],
        'CLAIM_REJECTED' => ['label' => 'Rejected', 'tone' => 'danger', 'domain' => 'reimbursement', 'domain_label' => 'Reimbursement'],
        'CLAIM_GRANTED' => ['label' => 'Claim Granted', 'tone' => 'success', 'domain' => 'reimbursement', 'domain_label' => 'Reimbursement'],
        'PAYOUT_ACKNOWLEDGED' => ['label' => 'Payout Acknowledged', 'tone' => 'success', 'domain' => 'reimbursement', 'domain_label' => 'Reimbursement'],

        'CASH_ADVANCE_SUBMITTED' => ['label' => 'Submitted', 'tone' => 'info', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],
        'CASH_ADVANCE_RESUBMITTED' => ['label' => 'Resubmitted', 'tone' => 'info', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],
        'CASH_ADVANCE_UPDATED' => ['label' => 'Updated', 'tone' => 'neutral', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],
        'CASH_ADVANCE_APPROVED' => ['label' => 'Approved', 'tone' => 'success', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],
        'CASH_ADVANCE_REVISED' => ['label' => 'Revision Requested', 'tone' => 'warning', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],
        'CASH_ADVANCE_REJECTED' => ['label' => 'Rejected', 'tone' => 'danger', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],
        'CASH_ADVANCE_DISBURSED' => ['label' => 'Disbursed', 'tone' => 'success', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],
        'CASH_ADVANCE_ACKNOWLEDGED' => ['label' => 'Acknowledged', 'tone' => 'success', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],

        'LIQUIDATION_SUBMITTED' => ['label' => 'Submitted', 'tone' => 'info', 'domain' => 'liquidation', 'domain_label' => 'Liquidation'],
        'LIQUIDATION_RESUBMITTED' => ['label' => 'Resubmitted', 'tone' => 'info', 'domain' => 'liquidation', 'domain_label' => 'Liquidation'],
        'LIQUIDATION_UPDATED' => ['label' => 'Updated', 'tone' => 'neutral', 'domain' => 'liquidation', 'domain_label' => 'Liquidation'],
        'LIQUIDATION_APPROVED' => ['label' => 'Approved & Settled', 'tone' => 'success', 'domain' => 'liquidation', 'domain_label' => 'Liquidation'],
        'LIQUIDATION_REVISED' => ['label' => 'Revision Requested', 'tone' => 'warning', 'domain' => 'liquidation', 'domain_label' => 'Liquidation'],
        'LIQUIDATION_REJECTED' => ['label' => 'Rejected', 'tone' => 'danger', 'domain' => 'liquidation', 'domain_label' => 'Liquidation'],

        'OVERDUE_PENALTY' => ['label' => 'Daily Penalty Applied', 'tone' => 'danger', 'domain' => 'cash_advance', 'domain_label' => 'Cash Advance'],
    ];

    private const DIFF_FIELDS = [
        'amount' => 'Amount',
        'description' => 'Description',
        'purpose' => 'Purpose',
        'date' => 'Date',
        'expected_disbursement_date' => 'Expected Disbursement Date',
        'expected_liquidation_date' => 'Expected Liquidation Date',
        'total_expense_amount' => 'Total Expenses',
        'outstanding_balance' => 'Outstanding Balance',
        'shortfall_explanation' => 'Shortfall Explanation',
        'user_comment' => 'User Comment',
        'admin_notes' => 'Admin Notes',
        'admin_note' => 'Admin Note',
        'payout_method' => 'Payout Method',
        'status' => 'Status',
    ];

    /**
     * Log a state mutation event.
     */
    public static function log(
        int $actorId,
        string $actorRole,
        string $actionType,
        string $entityType,
        int $entityId,
        ?array $beforeState = null,
        ?array $afterState = null,
        ?string $ipAddress = null
    ): AuditLog {
        return AuditLog::create([
            'actor_id' => $actorId,
            'actor_role' => $actorRole,
            'action_type' => $actionType,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'before_state' => $beforeState,
            'after_state' => $afterState,
            'ip_address' => $ipAddress ?? request()->ip(),
        ]);
    }

    /**
     * Compute clean, human-readable field diffs between before and after states.
     */
    public static function computeSanitizedDiff(?array $before, ?array $after): array
    {
        if (empty($before) || empty($after)) {
            return [];
        }

        $changes = [];

        foreach (self::DIFF_FIELDS as $key => $label) {
            $hasBefore = array_key_exists($key, $before);
            $hasAfter = array_key_exists($key, $after);

            if (!$hasBefore && !$hasAfter) {
                continue;
            }

            $bVal = $before[$key] ?? null;
            $aVal = $after[$key] ?? null;

            // Normalize values for comparison
            $normB = is_numeric($bVal) ? (string) (float) $bVal : (string) ($bVal ?? '');
            $normA = is_numeric($aVal) ? (string) (float) $aVal : (string) ($aVal ?? '');

            if ($normB !== $normA && ($normB !== '' || $normA !== '')) {
                $formattedBefore = self::formatDiffValue($key, $bVal);
                $formattedAfter = self::formatDiffValue($key, $aVal);

                if ($formattedBefore !== $formattedAfter) {
                    $changes[] = [
                        'field' => $label,
                        'key' => $key,
                        'before' => $formattedBefore,
                        'after' => $formattedAfter,
                    ];
                }
            }
        }

        return $changes;
    }

    private static function formatDiffValue(string $key, $value): string
    {
        if ($value === null || $value === '') {
            return '—';
        }

        if (in_array($key, ['amount', 'total_expense_amount', 'outstanding_balance'], true) && is_numeric($value)) {
            return '₱' . number_format((float) $value, 2);
        }

        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        return (string) $value;
    }

    /**
     * Extract human-readable comment or contextual detail from log states.
     */
    public static function extractComment(?array $before, ?array $after, string $actionType): ?string
    {
        $after = $after ?? [];
        $before = $before ?? [];

        if (!empty($after['comment'])) {
            return $after['comment'];
        }
        if (!empty($after['admin_notes'])) {
            return $after['admin_notes'];
        }
        if (!empty($after['admin_note'])) {
            return $after['admin_note'];
        }
        if (!empty($after['rejection_comment'])) {
            return $after['rejection_comment'];
        }
        if (!empty($after['shortfall_explanation'])) {
            return 'Shortfall explanation: ' . $after['shortfall_explanation'];
        }
        if (!empty($after['channel']) && !empty($after['reference'])) {
            return 'Channel: ' . $after['channel'] . ' (Ref: ' . $after['reference'] . ')';
        }
        if (!empty($after['payout_method'])) {
            $msg = 'Method: ' . $after['payout_method'];
            if (!empty($after['payout_method_other'])) {
                $msg .= ' (' . $after['payout_method_other'] . ')';
            }
            return $msg;
        }

        return null;
    }

    /**
     * Map a raw AuditLog model into normalized audit_trail entry.
     */
    public static function formatLogEntry(AuditLog $log, bool $canManage): array
    {
        $meta = self::ACTION_META[$log->action_type] ?? [
            'label' => ucwords(strtolower(str_replace('_', ' ', $log->action_type))),
            'tone' => 'neutral',
            'domain' => $log->entity_type,
            'domain_label' => ucfirst($log->entity_type),
        ];

        // Revision attempts label augmentation if present in after_state
        $label = $meta['label'];
        $revCount = $log->after_state['revision_count'] ?? null;
        if ($log->action_type === 'CLAIM_REVISED' || $log->action_type === 'CASH_ADVANCE_REVISED' || $log->action_type === 'LIQUIDATION_REVISED') {
            if ($revCount) {
                $label = "Revision Requested (Attempt {$revCount}/3)";
            }
        } elseif ($log->action_type === 'CLAIM_REJECTED' || $log->action_type === 'CASH_ADVANCE_REJECTED' || $log->action_type === 'LIQUIDATION_REJECTED') {
            if ($revCount && $revCount > 2) {
                $label = "Rejected — Revision limit reached ({$revCount}/3)";
            }
        }

        $actor = $log->relationLoaded('actor') && $log->actor ? $log->actor : null;
        $actorName = $actor ? $actor->name : ($log->actor_role === 'system' ? 'System' : 'User #' . $log->actor_id);
        $actorRole = $actor ? ucfirst($actor->role ?? $log->actor_role) : ucfirst($log->actor_role);

        $changes = self::computeSanitizedDiff($log->before_state, $log->after_state);
        $comment = self::extractComment($log->before_state, $log->after_state, $log->action_type);

        return [
            'id' => 'log-' . $log->id,
            'domain' => $meta['domain'],
            'domain_label' => $meta['domain_label'],
            'action_type' => $log->action_type,
            'label' => $label,
            'tone' => $meta['tone'],
            'actor_name' => $actorName,
            'actor_role' => $actorRole,
            'ip_address' => $canManage ? $log->ip_address : null,
            'comment' => $comment,
            'changes' => $changes,
            'created_at' => $log->created_at ? Carbon::parse($log->created_at)->toIso8601String() : null,
        ];
    }

    /**
     * Batch enrich an array/Collection of Reimbursements with audit_trail.
     */
    public static function enrichReimbursements($reimbursements, bool $canManage): void
    {
        if (empty($reimbursements)) {
            return;
        }

        $ids = [];
        foreach ($reimbursements as $rm) {
            if ($rm && isset($rm->id)) {
                $ids[] = $rm->id;
            }
        }

        if (empty($ids)) {
            return;
        }

        $allLogs = AuditLog::with('actor')
            ->where('entity_type', 'reimbursement')
            ->whereIn('entity_id', $ids)
            ->orderBy('id', 'asc')
            ->get()
            ->groupBy('entity_id');

        foreach ($reimbursements as $rm) {
            $logs = $allLogs->get($rm->id, collect());
            $rm->setAttribute('audit_trail', self::buildReimbursementTrail($rm, $logs, $canManage));
        }
    }

    /**
     * Enrich a single Reimbursement model with audit_trail.
     */
    public static function enrichReimbursement(Reimbursement $reimbursement, bool $canManage): Reimbursement
    {
        $logs = AuditLog::with('actor')
            ->where('entity_type', 'reimbursement')
            ->where('entity_id', $reimbursement->id)
            ->orderBy('id', 'asc')
            ->get();

        $reimbursement->setAttribute('audit_trail', self::buildReimbursementTrail($reimbursement, $logs, $canManage));
        return $reimbursement;
    }

    private static function buildReimbursementTrail(Reimbursement $rm, Collection $logs, bool $canManage): array
    {
        $entries = [];
        $loggedActionTypes = [];

        foreach ($logs as $log) {
            $entry = self::formatLogEntry($log, $canManage);
            $entries[] = $entry;
            $loggedActionTypes[] = $log->action_type;
        }

        // Hybrid Fallback: synthesize baseline submission if missing
        if (!in_array('CLAIM_SUBMITTED', $loggedActionTypes, true)) {
            $submitterName = $rm->user ? $rm->user->name : ($rm->submitted_by_name ?? 'Employee');
            $createdAt = $rm->date ?? $rm->created_at;
            $entries[] = [
                'id' => 'synth-submit-' . $rm->id,
                'domain' => 'reimbursement',
                'domain_label' => 'Reimbursement',
                'action_type' => 'CLAIM_SUBMITTED',
                'label' => 'Submitted',
                'tone' => 'info',
                'actor_name' => $submitterName,
                'actor_role' => 'Employee',
                'ip_address' => null,
                'comment' => $rm->user_comment ?? null,
                'changes' => [],
                'created_at' => $createdAt ? Carbon::parse($createdAt)->toIso8601String() : null,
            ];
        }

        // Hybrid Fallback: synthesize approval if approved but not in logs
        if (!in_array('CLAIM_APPROVED', $loggedActionTypes, true) && in_array($rm->status, ['approved', 'granted', 'paid']) && $rm->approved_at) {
            $entries[] = [
                'id' => 'synth-approve-' . $rm->id,
                'domain' => 'reimbursement',
                'domain_label' => 'Reimbursement',
                'action_type' => 'CLAIM_APPROVED',
                'label' => 'Approved',
                'tone' => 'success',
                'actor_name' => $rm->approved_by ?? 'Approver',
                'actor_role' => 'Approver',
                'ip_address' => null,
                'comment' => null,
                'changes' => [],
                'created_at' => Carbon::parse($rm->approved_at)->toIso8601String(),
            ];
        }

        // Hybrid Fallback: synthesize payout grant & acknowledge if present on relation
        if ($rm->relationLoaded('payout') && $rm->payout) {
            $payout = $rm->payout;
            if (!in_array('CLAIM_GRANTED', $loggedActionTypes, true) && $payout->granted_at) {
                $entries[] = [
                    'id' => 'synth-grant-' . $payout->id,
                    'domain' => 'reimbursement',
                    'domain_label' => 'Reimbursement',
                    'action_type' => 'CLAIM_GRANTED',
                    'label' => 'Claim Granted',
                    'tone' => 'success',
                    'actor_name' => $payout->granted_by ?? 'Finance / Admin',
                    'actor_role' => 'Finance',
                    'ip_address' => null,
                    'comment' => 'Method: ' . ($payout->payout_method ?? 'Cash'),
                    'changes' => [],
                    'created_at' => Carbon::parse($payout->granted_at)->toIso8601String(),
                ];
            }

            if (!in_array('PAYOUT_ACKNOWLEDGED', $loggedActionTypes, true) && $payout->acknowledged_at) {
                $entries[] = [
                    'id' => 'synth-ack-' . $payout->id,
                    'domain' => 'reimbursement',
                    'domain_label' => 'Reimbursement',
                    'action_type' => 'PAYOUT_ACKNOWLEDGED',
                    'label' => 'Payout Acknowledged',
                    'tone' => 'success',
                    'actor_name' => $rm->user?->name ?? 'Employee',
                    'actor_role' => 'Employee',
                    'ip_address' => null,
                    'comment' => 'Signed confirmation of payment received.',
                    'changes' => [],
                    'created_at' => Carbon::parse($payout->acknowledged_at)->toIso8601String(),
                ];
            }
        }

        // Sort chronologically ascending
        usort($entries, function ($a, $b) {
            return strcmp($a['created_at'] ?? '', $b['created_at'] ?? '');
        });

        return array_values($entries);
    }

    /**
     * Batch enrich CashAdvances with unified lifecycle audit trail (CashAdvance + linked Liquidations).
     */
    public static function enrichCashAdvances($advances, bool $canManage): void
    {
        if (empty($advances)) {
            return;
        }

        $advanceIds = [];
        $liqIds = [];

        foreach ($advances as $adv) {
            if ($adv && isset($adv->id)) {
                $advanceIds[] = $adv->id;
                if ($adv->relationLoaded('liquidations')) {
                    foreach ($adv->liquidations as $l) {
                        $liqIds[] = $l->id;
                    }
                }
            }
        }

        $allCaLogs = AuditLog::with('actor')
            ->where('entity_type', 'cash_advance')
            ->whereIn('entity_id', $advanceIds)
            ->get()
            ->groupBy('entity_id');

        $allLiqLogs = empty($liqIds) ? collect() : AuditLog::with('actor')
            ->where('entity_type', 'liquidation')
            ->whereIn('entity_id', $liqIds)
            ->get()
            ->groupBy('entity_id');

        foreach ($advances as $adv) {
            $caLogs = $allCaLogs->get($adv->id, collect());
            $advLiqLogs = collect();
            if ($adv->relationLoaded('liquidations')) {
                foreach ($adv->liquidations as $l) {
                    $advLiqLogs = $advLiqLogs->concat($allLiqLogs->get($l->id, collect()));
                }
            }
            $adv->setAttribute('audit_trail', self::buildCashAdvanceLifecycleTrail($adv, $caLogs, $advLiqLogs, $canManage));
        }
    }

    /**
     * Enrich a single CashAdvance model with unified lifecycle audit trail.
     */
    public static function enrichCashAdvance(CashAdvance $advance, bool $canManage): CashAdvance
    {
        $caLogs = AuditLog::with('actor')
            ->where('entity_type', 'cash_advance')
            ->where('entity_id', $advance->id)
            ->get();

        $liqIds = $advance->relationLoaded('liquidations')
            ? $advance->liquidations->pluck('id')->all()
            : Liquidation::where('cash_advance_id', $advance->id)->pluck('id')->all();

        $liqLogs = empty($liqIds) ? collect() : AuditLog::with('actor')
            ->where('entity_type', 'liquidation')
            ->whereIn('entity_id', $liqIds)
            ->get();

        $advance->setAttribute('audit_trail', self::buildCashAdvanceLifecycleTrail($advance, $caLogs, $liqLogs, $canManage));
        return $advance;
    }

    private static function buildCashAdvanceLifecycleTrail(CashAdvance $adv, Collection $caLogs, Collection $liqLogs, bool $canManage): array
    {
        $entries = [];
        $loggedKeys = [];

        foreach ($caLogs as $log) {
            $entry = self::formatLogEntry($log, $canManage);
            $entries[] = $entry;
            $loggedKeys[] = 'ca-' . $log->action_type . '-' . ($log->created_at ? $log->created_at->format('YmdH') : '');
        }

        foreach ($liqLogs as $log) {
            $entry = self::formatLogEntry($log, $canManage);
            $entries[] = $entry;
            $loggedKeys[] = 'liq-' . $log->action_type . '-' . ($log->created_at ? $log->created_at->format('YmdH') : '');
        }

        // Hybrid Fallback: baseline submission
        if (empty(array_filter($loggedKeys, fn($k) => str_starts_with($k, 'ca-CASH_ADVANCE_SUBMITTED')))) {
            $requesterName = $adv->requester ? $adv->requester->name : ($adv->requestedBy ?? 'Employee');
            $createdAt = $adv->date ?? $adv->created_at;
            $entries[] = [
                'id' => 'synth-ca-sub-' . $adv->id,
                'domain' => 'cash_advance',
                'domain_label' => 'Cash Advance',
                'action_type' => 'CASH_ADVANCE_SUBMITTED',
                'label' => 'Submitted',
                'tone' => 'info',
                'actor_name' => $requesterName,
                'actor_role' => 'Employee',
                'ip_address' => null,
                'comment' => $adv->purpose ?? null,
                'changes' => [],
                'created_at' => $createdAt ? Carbon::parse($createdAt)->toIso8601String() : null,
            ];
        }

        // Hybrid Fallback: approval actions
        $approvalActions = $adv->getAttribute('approvalActions') ?? ($adv->relationLoaded('approvalActions') ? $adv->approvalActions : null);
        if ($approvalActions) {
            foreach ($approvalActions as $action) {
                $rawAction = is_array($action) ? ($action['action'] ?? null) : ($action->action ?? null);
                if (!$rawAction) continue;
                $actType = match ($rawAction) {
                    'approved' => 'CASH_ADVANCE_APPROVED',
                    'revised' => 'CASH_ADVANCE_REVISED',
                    default => 'CASH_ADVANCE_REJECTED',
                };
                $actionedAt = is_array($action) ? ($action['actioned_at'] ?? $action['created_at'] ?? null) : ($action->actioned_at ?? $action->created_at ?? null);
                $key = 'ca-' . $actType . '-' . ($actionedAt ? Carbon::parse($actionedAt)->format('YmdH') : '');
                if (!in_array($key, $loggedKeys, true)) {
                    $approver = is_array($action) ? ($action['approver'] ?? null) : ($action->relationLoaded('approver') && $action->approver ? $action->approver->name : null);
                    if (is_array($approver)) {
                        $approverName = $approver['name'] ?? 'Approver';
                    } else {
                        $approverName = $approver ?: 'Approver';
                    }
                    $actionId = is_array($action) ? ($action['id'] ?? uniqid()) : ($action->id ?? uniqid());
                    $comment = is_array($action) ? ($action['comment'] ?? null) : ($action->comment ?? null);
                    $entries[] = [
                        'id' => 'synth-ca-act-' . $actionId,
                        'domain' => 'cash_advance',
                        'domain_label' => 'Cash Advance',
                        'action_type' => $actType,
                        'label' => ucfirst($rawAction),
                        'tone' => $rawAction === 'approved' ? 'success' : ($rawAction === 'revised' ? 'warning' : 'danger'),
                        'actor_name' => $approverName,
                        'actor_role' => 'Approver',
                        'ip_address' => null,
                        'comment' => $comment,
                        'changes' => [],
                        'created_at' => $actionedAt ? Carbon::parse($actionedAt)->toIso8601String() : null,
                    ];
                    $loggedKeys[] = $key;
                }
            }
        }

        // Hybrid Fallback: disbursement
        $disb = $adv->getAttribute('disbursement') ?? ($adv->relationLoaded('disbursement') ? $adv->disbursement : null);
        if ($disb) {
            $key = 'ca-CASH_ADVANCE_DISBURSED';
            if (!in_array($key, $loggedKeys, true)) {
                $disbId = is_array($disb) ? ($disb['id'] ?? uniqid()) : ($disb->id ?? uniqid());
                $channel = is_array($disb) ? ($disb['channel'] ?? 'N/A') : ($disb->channel ?? 'N/A');
                $ref = is_array($disb) ? ($disb['reference_number'] ?? 'N/A') : ($disb->reference_number ?? 'N/A');
                $disbAt = is_array($disb) ? ($disb['disbursement_date'] ?? $disb['created_at'] ?? null) : ($disb->disbursement_date ?? $disb->created_at ?? null);
                $disbursedBy = is_array($disb) ? ($disb['disbursed_by']['name'] ?? $disb['disbursedBy']['name'] ?? null) : ($disb->relationLoaded('disbursedBy') && $disb->disbursedBy ? $disb->disbursedBy->name : null);
                $entries[] = [
                    'id' => 'synth-ca-disb-' . $disbId,
                    'domain' => 'cash_advance',
                    'domain_label' => 'Cash Advance',
                    'action_type' => 'CASH_ADVANCE_DISBURSED',
                    'label' => 'Disbursed',
                    'tone' => 'success',
                    'actor_name' => $disbursedBy ?: 'Finance Officer',
                    'actor_role' => 'Finance',
                    'ip_address' => null,
                    'comment' => "Channel: {$channel} (Ref: {$ref})",
                    'changes' => [],
                    'created_at' => $disbAt ? Carbon::parse($disbAt)->toIso8601String() : null,
                ];
                $loggedKeys[] = $key;
            }
        }

        // Hybrid Fallback: acknowledgment
        if ($adv->acknowledged_at) {
            $key = 'ca-CASH_ADVANCE_ACKNOWLEDGED';
            if (!in_array($key, $loggedKeys, true)) {
                $entries[] = [
                    'id' => 'synth-ca-ack-' . $adv->id,
                    'domain' => 'cash_advance',
                    'domain_label' => 'Cash Advance',
                    'action_type' => 'CASH_ADVANCE_ACKNOWLEDGED',
                    'label' => 'Acknowledged',
                    'tone' => 'success',
                    'actor_name' => $adv->requester?->name ?? 'Employee',
                    'actor_role' => 'Employee',
                    'ip_address' => null,
                    'comment' => 'Signed digital receipt of advance funds.',
                    'changes' => [],
                    'created_at' => Carbon::parse($adv->acknowledged_at)->toIso8601String(),
                ];
                $loggedKeys[] = $key;
            }
        }

        // Hybrid Fallback: overdue penalties
        $penalties = $adv->getAttribute('penalties') ?? ($adv->relationLoaded('penalties') ? $adv->penalties : null);
        if ($penalties) {
            foreach ($penalties as $pen) {
                $penId = is_array($pen) ? ($pen['id'] ?? uniqid()) : ($pen->id ?? uniqid());
                $penAmount = is_array($pen) ? ($pen['penalty_amount'] ?? 50) : ($pen->penalty_amount ?? 50);
                $daysOverdue = is_array($pen) ? ($pen['days_overdue'] ?? 1) : ($pen->days_overdue ?? 1);
                $appliedAt = is_array($pen) ? ($pen['applied_at'] ?? $pen['created_at'] ?? null) : ($pen->applied_at ?? $pen->created_at ?? null);
                $entries[] = [
                    'id' => 'synth-pen-' . $penId,
                    'domain' => 'cash_advance',
                    'domain_label' => 'Cash Advance',
                    'action_type' => 'OVERDUE_PENALTY',
                    'label' => 'Daily Penalty Applied',
                    'tone' => 'danger',
                    'actor_name' => 'System',
                    'actor_role' => 'System',
                    'ip_address' => null,
                    'comment' => 'Penalty assessed: ₱' . number_format((float) $penAmount, 2) . ' (' . $daysOverdue . ' days overdue)',
                    'changes' => [],
                    'created_at' => $appliedAt ? Carbon::parse($appliedAt)->toIso8601String() : null,
                ];
            }
        }

        // Sort chronologically ascending
        usort($entries, function ($a, $b) {
            return strcmp($a['created_at'] ?? '', $b['created_at'] ?? '');
        });

        return array_values($entries);
    }

    /**
     * Enrich a Liquidation model with its unified lifecycle audit trail.
     */
    public static function enrichLiquidation(Liquidation $liquidation, bool $canManage): Liquidation
    {
        $advance = $liquidation->relationLoaded('cashAdvance') && $liquidation->cashAdvance
            ? $liquidation->cashAdvance
            : CashAdvance::with(['requester', 'approvalActions.approver', 'disbursement.disbursedBy', 'penalties'])->find($liquidation->cash_advance_id);

        if ($advance) {
            self::enrichCashAdvance($advance, $canManage);
            $liquidation->setAttribute('audit_trail', $advance->getAttribute('audit_trail'));
        } else {
            $liqLogs = AuditLog::with('actor')
                ->where('entity_type', 'liquidation')
                ->where('entity_id', $liquidation->id)
                ->get();
            $entries = [];
            foreach ($liqLogs as $log) {
                $entries[] = self::formatLogEntry($log, $canManage);
            }
            $liquidation->setAttribute('audit_trail', $entries);
        }

        return $liquidation;
    }

    /**
     * Batch enrich Liquidations.
     */
    public static function enrichLiquidations($liquidations, bool $canManage): void
    {
        foreach ($liquidations as $liq) {
            self::enrichLiquidation($liq, $canManage);
        }
    }
}
