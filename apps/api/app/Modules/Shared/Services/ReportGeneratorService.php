<?php

namespace App\Modules\Shared\Services;

use App\Modules\Users\Models\User;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use Carbon\Carbon;

class ReportGeneratorService
{
    public function formatPeso($amount): string
    {
        return 'PHP ' . number_format((float) ($amount ?? 0), 2, '.', ',');
    }

    public function formatMediumDate($date): string
    {
        if (empty($date)) {
            return '--';
        }
        try {
            return Carbon::parse($date)->format('M j, Y');
        } catch (\Throwable) {
            return (string) $date;
        }
    }

    /**
     * Build a Reimbursement single-record PDF report (G2-054, G2-055, G2-058).
     */
    public function buildReimbursementReport(Reimbursement $reimbursement, User $generatedBy): array
    {
        $reimbursement->loadMissing(['user', 'receipts.category', 'expenseCategory', 'payout']);

        $status = strtolower((string) $reimbursement->status);
        $submittedBy = $reimbursement->user?->name ?? $reimbursement->submitted_by_name ?? 'Employee';
        $tracker = $this->resolveReimbursementTracker($status);

        $sections = [
            'type' => 'reimbursement',
            'title' => "Reimbursement Report #{$reimbursement->id}",
            'reference' => "REIMB-#{$reimbursement->id}",
            'status' => ucfirst($status),
            'generated_at' => $this->formatMediumDate(now()),
            'generated_by' => "{$generatedBy->name} (" . ucfirst((string) $generatedBy->role) . ")",
            'total_amount' => $this->formatPeso($reimbursement->amount),
            'summary' => [
                'Reference Number' => "Reimbursement Ref #{$reimbursement->id}",
                'Submitted By' => $submittedBy,
                'Status' => ucfirst($status),
                'Total Amount' => $this->formatPeso($reimbursement->amount),
                'Date Requested' => $this->formatMediumDate($reimbursement->date ?? $reimbursement->created_at),
                'User Comment' => $reimbursement->user_comment ?: 'No comment provided',
            ],
            'tracker_title' => 'Progress Tracker (Submitted -> Review -> Decision -> Released)',
            'tracker_steps' => $tracker,
            'extra_sections' => [],
            'receipts' => [],
        ];

        if (in_array($status, ['approved', 'granted'], true) || !empty($reimbursement->approved_by)) {
            $approvalDetails = [
                'Approved By' => $reimbursement->approved_by ?? $reimbursement->payout?->approved_by ?? 'Approver',
                'Date Approved' => $this->formatMediumDate($reimbursement->approved_at ?? $reimbursement->payout?->approved_at),
            ];
            if ($reimbursement->payout) {
                $payout = $reimbursement->payout;
                $method = $payout->payout_method === 'Other' && !empty($payout->payout_method_other)
                    ? "Other ({$payout->payout_method_other})"
                    : ($payout->payout_method ?? 'Cash');
                $approvalDetails['Granted By'] = $payout->granted_by ?? '--';
                $approvalDetails['Date Granted'] = $this->formatMediumDate($payout->granted_at);
                $approvalDetails['Payout Method'] = $method;
                $approvalDetails['Payout Amount'] = $this->formatPeso($payout->amount ?? $reimbursement->amount);
                $approvalDetails['Acknowledgement'] = $payout->acknowledged_at
                    ? 'Acknowledged (' . $this->formatMediumDate($payout->acknowledged_at) . ')'
                    : 'Awaiting Acknowledgement';
            }
            $sections['extra_sections']['Approval & Payout Details'] = $approvalDetails;
        }

        if (!empty($reimbursement->admin_notes) || !empty($reimbursement->rejection_comment)) {
            $sections['extra_sections']['Admin Notes'] = [
                'Notes' => $reimbursement->admin_notes ?? $reimbursement->rejection_comment,
            ];
        }

        foreach ($reimbursement->receipts as $idx => $receipt) {
            $sections['receipts'][] = [
                'index' => $idx + 1,
                'vendor' => $receipt->vendor_name ?: 'Receipt',
                'invoice' => $receipt->invoice_number ?: '--',
                'date' => $this->formatMediumDate($receipt->transaction_date),
                'category' => $receipt->category?->name ?? $reimbursement->expenseCategory?->name ?? 'General',
                'amount' => $this->formatPeso($receipt->total_amount),
                'status' => ucfirst((string) ($receipt->status ?? 'pending')),
            ];
        }

        $filename = "Reimbursement-Report-#{$reimbursement->id}.pdf";
        return [
            'filename' => $filename,
            'content' => $this->renderPdfDocument($sections),
        ];
    }

    /**
     * Build a Cash Advance single-record PDF report (G2-054, G2-056, G2-059).
     */
    public function buildCashAdvanceReport(CashAdvance $advance, User $generatedBy): array
    {
        $advance->loadMissing([
            'requester',
            'approvalActions.approver',
            'disbursement.disbursedBy',
            'document',
            'liquidations',
        ]);

        $status = strtolower((string) $advance->status);
        $requestor = $advance->requester?->name ?? 'Employee';
        $latestApproval = $advance->approvalActions->sortByDesc('created_at')->first();
        $approverName = $latestApproval?->approver?->name ?? '--';
        $approvedDate = $latestApproval ? $this->formatMediumDate($latestApproval->actioned_at ?? $latestApproval->created_at) : '--';
        $adminNotes = $latestApproval?->comment ?: 'None';

        $disbursedBy = $advance->disbursement?->disbursedBy?->name ?? '--';
        $disbursedDate = $advance->disbursement
            ? $this->formatMediumDate($advance->disbursement->disbursement_date ?? $advance->disbursement->created_at)
            : '--';

        $sections = [
            'type' => 'cash-advance',
            'title' => "Cash Advance Report #{$advance->id}",
            'reference' => "CA-#{$advance->id}",
            'status' => ucfirst($status),
            'generated_at' => $this->formatMediumDate(now()),
            'generated_by' => "{$generatedBy->name} (" . ucfirst((string) $generatedBy->role) . ")",
            'total_amount' => $this->formatPeso($advance->amount),
            'summary' => [
                'Request ID' => "Cash Advance Ref #{$advance->id}",
                'Requestor' => $requestor,
                'Purpose' => (string) $advance->purpose,
                'Status' => ucfirst($status),
                'Amount Requested' => $this->formatPeso($advance->amount),
                'Outstanding Balance' => $this->formatPeso($advance->outstanding_balance ?? $advance->amount),
                'Date Requested' => $this->formatMediumDate($advance->created_at ?? $advance->expected_disbursement_date),
                'Settlement Due Date' => $this->formatMediumDate($advance->expected_liquidation_date),
                'Supporting Document' => $advance->document?->file_name ?? 'None attached',
                'Admin Notes' => $adminNotes,
            ],
            'tracker_title' => 'Progress Tracker (Request -> Approval -> Disbursed -> Acknowledged -> Liquidation -> Settled)',
            'tracker_steps' => $this->resolveCashAdvanceTracker($advance, $approverName, $approvedDate, $disbursedDate),
            'extra_sections' => [
                'Approval & Disbursement Audit' => [
                    'Approver' => $approverName,
                    'Approval Date' => $approvedDate,
                    'Disbursed By' => $disbursedBy,
                    'Disbursement Date' => $disbursedDate,
                    'Acknowledged Date' => $advance->acknowledged_at ? $this->formatMediumDate($advance->acknowledged_at) : 'Awaiting Acknowledgement',
                ],
            ],
            'receipts' => [],
        ];

        $filename = "Cash-Advance-Report-#{$advance->id}.pdf";
        return [
            'filename' => $filename,
            'content' => $this->renderPdfDocument($sections),
        ];
    }

    /**
     * Build a Liquidation single-record PDF report (G2-054, G2-057, G2-060).
     */
    public function buildLiquidationReport(?Liquidation $liquidation, CashAdvance $advance, User $generatedBy): array
    {
        $advance->loadMissing([
            'requester',
            'approvalActions.approver',
            'disbursement.disbursedBy',
            'penalties',
            'statusHistory.changedBy',
        ]);

        $receiptIds = $liquidation && is_array($liquidation->reimbursement_ids)
            ? $liquidation->reimbursement_ids
            : [];
        $receipts = !empty($receiptIds)
            ? Receipt::whereIn('id', $receiptIds)->with('category')->get()
            : collect();

        $employeeName = $liquidation?->user?->name ?? $advance->requester?->name ?? 'Employee';
        $amountAdvanced = (float) ($advance->amount ?? 0);
        $totalLiquidated = $liquidation
            ? (float) ($liquidation->total_expense_amount ?? 0)
            : (float) $receipts->sum('total_amount');
        $outstandingOrReturn = $liquidation
            ? (float) ($liquidation->outstanding_balance ?? max($amountAdvanced - $totalLiquidated, 0))
            : (float) ($advance->outstanding_balance ?? max($amountAdvanced - $totalLiquidated, 0));

        $status = strtolower((string) ($liquidation?->status ?? $advance->status ?? 'signed'));
        $dueInfo = $this->resolveDeadlineAndPenalty($advance, $status);

        $latestApproval = $advance->approvalActions->sortByDesc('created_at')->first();
        $approverName = $latestApproval?->approver?->name ?? '--';
        $approvedDate = $latestApproval ? $this->formatMediumDate($latestApproval->actioned_at ?? $latestApproval->created_at) : '--';
        $disbursedDate = $advance->disbursement
            ? $this->formatMediumDate($advance->disbursement->disbursement_date ?? $advance->disbursement->created_at)
            : '--';
        $reviewDate = $liquidation && in_array($status, ['liquidated', 'settled', 'approved', 'rejected', 'revise'], true)
            ? $this->formatMediumDate($liquidation->updated_at)
            : 'Pending Review';

        $reportId = $liquidation?->id ?? $advance->id;

        $sections = [
            'type' => 'liquidation',
            'title' => "Liquidation Report #{$reportId}",
            'reference' => "LIQ-#{$reportId} (CA-#{$advance->id})",
            'status' => ucfirst($status),
            'generated_at' => $this->formatMediumDate(now()),
            'generated_by' => "{$generatedBy->name} (" . ucfirst((string) $generatedBy->role) . ")",
            'total_amount' => $this->formatPeso($amountAdvanced),
            'summary' => [
                'Liquidation Reference' => "LIQ-#{$reportId}",
                'Cash Advance Reference' => "Cash Advance Ref #{$advance->id}",
                'Employee Name' => $employeeName,
                'Purpose' => (string) $advance->purpose,
                'Liquidation Status' => ucfirst($status),
                'Amount Advanced' => $this->formatPeso($amountAdvanced),
                'Total Liquidated (Receipts)' => $this->formatPeso($totalLiquidated),
                'Outstanding Balance / To Return' => $this->formatPeso($outstandingOrReturn),
                'Settlement Due Date' => $dueInfo['due_date_label'],
                'Deadline / Overdue Status' => $dueInfo['countdown_label'],
                'Penalty Amount' => $this->formatPeso($dueInfo['penalty_amount']),
                'Shortfall Explanation' => $liquidation?->shortfall_explanation ?: 'None',
                'Admin Notes' => $liquidation?->admin_note ?: 'None',
            ],
            'tracker_title' => 'Two-Phase Progress Tracker (Phase 1: Cash Advance | Phase 2: Liquidation & Settlement)',
            'tracker_steps' => $this->resolveTwoPhaseLiquidationTracker(
                $advance,
                $liquidation,
                $approverName,
                $approvedDate,
                $disbursedDate,
                $reviewDate
            ),
            'extra_sections' => [],
            'receipts' => [],
        ];

        foreach ($receipts as $idx => $receipt) {
            $sections['receipts'][] = [
                'index' => $idx + 1,
                'vendor' => $receipt->vendor_name ?: 'Receipt',
                'invoice' => $receipt->invoice_number ?: '--',
                'date' => $this->formatMediumDate($receipt->transaction_date),
                'category' => $receipt->category?->name ?? 'General',
                'amount' => $this->formatPeso($receipt->total_amount),
                'status' => ucfirst((string) ($receipt->status ?? 'pending')),
            ];
        }

        $filename = "Liquidation-Report-#{$reportId}.pdf";
        return [
            'filename' => $filename,
            'content' => $this->renderPdfDocument($sections),
        ];
    }

    private function resolveReimbursementTracker(string $status): array
    {
        $isApprovedOrGranted = in_array($status, ['approved', 'granted', 'paid'], true);
        $isRejected = in_array($status, ['rejected', 'reject'], true);
        $isGranted = in_array($status, ['granted', 'paid'], true);

        return [
            ['stage' => '1. Submitted', 'state' => 'Completed'],
            ['stage' => '2. Review', 'state' => ($isApprovedOrGranted || $isRejected) ? 'Reviewed' : 'In Progress'],
            ['stage' => '3. Decision', 'state' => $isGranted ? 'Granted' : ($isApprovedOrGranted ? 'Approved' : ($isRejected ? 'Rejected' : 'Awaiting'))],
            ['stage' => '4. Released', 'state' => $isGranted ? 'Disbursed' : 'Pending'],
        ];
    }

    private function resolveCashAdvanceTracker(
        CashAdvance $advance,
        string $approverName,
        string $approvedDate,
        string $disbursedDate
    ): array {
        $status = strtolower((string) $advance->status);
        $hasApproved = in_array($status, ['approved', 'disbursed', 'signed', 'under-review', 'incomplete', 'overdue', 'liquidated', 'settled'], true);
        $hasDisbursed = in_array($status, ['disbursed', 'signed', 'under-review', 'incomplete', 'overdue', 'liquidated', 'settled'], true) || $advance->disbursement !== null;
        $hasAcknowledged = $advance->acknowledged_at !== null || in_array($status, ['signed', 'under-review', 'incomplete', 'overdue', 'liquidated', 'settled'], true);
        $hasLiquidation = $advance->liquidations->isNotEmpty() || in_array($status, ['under-review', 'liquidated', 'settled'], true);
        $isSettled = in_array($status, ['liquidated', 'settled'], true);

        return [
            ['stage' => '1. Request', 'state' => 'Submitted (' . $this->formatMediumDate($advance->created_at) . ')'],
            ['stage' => '2. Approval', 'state' => $status === 'rejected' ? 'Rejected' : ($hasApproved ? "Approved by {$approverName}" : 'Pending')],
            ['stage' => '3. Disbursed', 'state' => $hasDisbursed ? "Disbursed ({$disbursedDate})" : 'Pending'],
            ['stage' => '4. Signed', 'state' => $hasAcknowledged ? 'Acknowledged' : 'Pending'],
            ['stage' => '5. Liquidation', 'state' => $hasLiquidation ? ($isSettled ? 'Completed' : 'In Progress') : 'Pending'],
            ['stage' => '6. Settled', 'state' => $isSettled ? 'Settled' : 'Pending'],
        ];
    }

    private function resolveTwoPhaseLiquidationTracker(
        CashAdvance $advance,
        ?Liquidation $liquidation,
        string $approverName,
        string $approvedDate,
        string $disbursedDate,
        string $reviewDate
    ): array {
        $liqStatus = strtolower((string) ($liquidation?->status ?? $advance->status ?? 'signed'));
        $isSettled = in_array($liqStatus, ['liquidated', 'settled', 'approved'], true);
        $isRejected = $liqStatus === 'rejected';

        return [
            ['stage' => 'Phase 1 - Request', 'state' => 'Submitted (' . $this->formatMediumDate($advance->created_at) . ')'],
            ['stage' => 'Phase 1 - Approval', 'state' => "Approved by {$approverName}"],
            ['stage' => 'Phase 1 - Disbursed', 'state' => "Disbursed ({$disbursedDate})"],
            ['stage' => 'Phase 1 - Signed', 'state' => $advance->acknowledged_at ? 'Signed' : 'Pending'],
            ['stage' => 'Phase 2 - Liquidation', 'state' => $liquidation ? ($isRejected ? 'Rejected' : 'Submitted') : 'Awaiting'],
            ['stage' => 'Phase 2 - Settled', 'state' => $isSettled ? "Settled ({$reviewDate})" : 'Pending'],
        ];
    }

    private function resolveDeadlineAndPenalty(CashAdvance $advance, string $status): array
    {
        $penaltySum = $advance->relationLoaded('penalties')
            ? (float) $advance->penalties->sum('penalty_amount')
            : (float) $advance->penalties()->sum('penalty_amount');

        $due = $advance->expected_liquidation_date;
        if (!$due) {
            return [
                'due_date_label' => '--',
                'countdown_label' => 'No deadline set',
                'penalty_amount' => $penaltySum,
            ];
        }

        $dueDate = Carbon::parse($due)->startOfDay();
        $today = Carbon::now()->startOfDay();
        $dueLabel = $this->formatMediumDate($dueDate);

        if (in_array($status, ['liquidated', 'settled'], true)) {
            return [
                'due_date_label' => $dueLabel,
                'countdown_label' => 'Settled',
                'penalty_amount' => $penaltySum,
            ];
        }

        if ($today->gt($dueDate)) {
            $daysPastDue = abs((int) $today->diffInDays($dueDate));
            $daysOverdue = max(0, $daysPastDue - PenaltySyncService::GRACE_PERIOD_DAYS);
            $computedPenalty = $penaltySum > 0 ? $penaltySum : ($daysOverdue * PenaltySyncService::DAILY_PENALTY_PHP);
            return [
                'due_date_label' => $dueLabel,
                'countdown_label' => $daysOverdue > 0
                    ? "{$daysOverdue} day(s) overdue"
                    : "Grace period ({$daysPastDue} day(s) past due)",
                'penalty_amount' => $computedPenalty,
            ];
        }

        $daysLeft = (int) $today->diffInDays($dueDate);
        return [
            'due_date_label' => $dueLabel,
            'countdown_label' => $daysLeft === 0 ? 'Due Today' : "{$daysLeft} day(s) left",
            'penalty_amount' => $penaltySum,
        ];
    }

    /**
     * Escape PDF string literal characters and normalize non-ASCII characters.
     */
    private function escapePdfText(string $text): string
    {
        // Replace unicode Philippine Peso sign or mojibake if any slip through
        $text = str_replace(["\xE2\x82\xB1", '₱'], 'PHP ', $text);
        
        // Replace common non-ASCII typographic characters
        $replacements = [
            '—' => '--',
            '–' => '-',
            '“' => '"',
            '”' => '"',
            '‘' => "'",
            '’' => "'",
            '•' => '*',
            '…' => '...',
        ];
        $text = strtr($text, $replacements);

        // Filter out any non-ASCII characters that would cause font corruption
        $text = preg_replace('/[^\x20-\x7E\t\r\n]/', '', $text);

        // Escape PDF special characters: \, (, )
        return str_replace(
            ['\\', '(', ')'],
            ['\\\\', '\\(', '\\)'],
            $text
        );
    }

    /**
     * Render a modern, professional, UI-friendly PDF document with styled cards,
     * status pills, progress stepper, receipts table, and clean typography.
     */
    private function renderPdfDocument(array $doc): string
    {
        $pages = [];
        $ops = [];
        $y = 756.0;

        $pageWidth = 612.0;
        $pageHeight = 792.0;
        $left = 36.0;
        $contentWidth = 540.0;
        $right = $left + $contentWidth;

        // Helper to push a new page
        $pushNewPage = function () use (&$pages, &$ops, &$y) {
            $pages[] = implode("\n", $ops);
            $ops = [];
            $y = 756.0;
        };

        // Helper: Check space and push page if needed
        $ensureSpace = function (float $neededHeight) use (&$y, $pushNewPage, &$ops, $doc) {
            if ($y - $neededHeight < 55.0) {
                $pushNewPage();
                // Draw a compact page header on subsequent pages
                $ops[] = "0.886 0.910 0.941 RG 0.5 w 36 760 m 576 760 l S";
                $ops[] = "BT /F1 8 Tf 0.392 0.455 0.545 rg 36 765 Td (" . $this->escapePdfText($doc['title'] ?? 'SERMS Report') . " (Continued)) Tj ET";
                $y = 745.0;
            }
        };

        // 1. CLEAN MINIMALIST HEADER (NO BLUE BARS)
        // Company Name
        $ops[] = "BT /F1 13 Tf 0.059 0.090 0.165 rg {$left} 736 Td (SCIENCE BIOTECH SPECIALTIES INC. \(SBSI\)) Tj ET";
        // Subtitle
        $ops[] = "BT /F2 8.5 Tf 0.392 0.455 0.545 rg {$left} 722 Td (Smart Expense & Reimbursement Management System \(SERMS\)) Tj ET";

        // Right side: Document Title and Reference
        $docTitle = $doc['title'] ?? 'SERMS Report';
        $titleWidthEst = strlen($docTitle) * 6.2;
        $titleX = max($right - $titleWidthEst, 340.0);
        $ops[] = "BT /F1 10.5 Tf 0.059 0.090 0.165 rg {$titleX} 736 Td (" . $this->escapePdfText($docTitle) . ") Tj ET";

        $refText = "Reference: " . ($doc['reference'] ?? '--');
        $refWidthEst = strlen($refText) * 4.6;
        $refX = max($right - $refWidthEst, 340.0);
        $ops[] = "BT /F2 8.5 Tf 0.392 0.455 0.545 rg {$refX} 722 Td (" . $this->escapePdfText($refText) . ") Tj ET";

        // Dividing rule below header (clean neutral border)
        $ops[] = "0.886 0.910 0.941 RG 0.5 w {$left} 710 m {$right} 710 l S";
        $y = 698.0;

        // 2. METADATA SUMMARY BAR (DATE, GENERATED BY, STATUS, TOTAL AMOUNT)
        $barHeight = 44.0;
        $barY = $y - $barHeight;
        // Background card & neutral border
        $ops[] = "0.973 0.980 0.988 rg {$left} {$barY} {$contentWidth} {$barHeight} re f";
        $ops[] = "0.886 0.910 0.941 RG 0.5 w {$left} {$barY} {$contentWidth} {$barHeight} re S";

        // Col 1: Date Generated
        $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($left + 14) . " " . ($barY + 28) . " Td (DATE GENERATED) Tj ET";
        $ops[] = "BT /F1 8.5 Tf 0.059 0.090 0.165 rg " . ($left + 14) . " " . ($barY + 12) . " Td (" . $this->escapePdfText($doc['generated_at'] ?? '--') . ") Tj ET";

        // Col 2: Generated By
        $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($left + 130) . " " . ($barY + 28) . " Td (GENERATED BY) Tj ET";
        $ops[] = "BT /F2 8 Tf 0.059 0.090 0.165 rg " . ($left + 130) . " " . ($barY + 12) . " Td (" . $this->escapePdfText($doc['generated_by'] ?? '--') . ") Tj ET";

        // Col 3: Status Pill
        $statusRaw = $doc['status'] ?? 'Pending';
        $statusKey = strtolower(trim((string) $statusRaw));
        $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($left + 300) . " " . ($barY + 28) . " Td (STATUS) Tj ET";

        // Resolve status pill colors
        if (in_array($statusKey, ['approved', 'granted', 'disbursed', 'liquidated', 'settled', 'paid'], true)) {
            $pillBg = "0.863 0.988 0.906 rg";
            $pillBorder = "0.525 0.882 0.655 RG";
            $pillText = "0.082 0.502 0.239 rg";
        } elseif (in_array($statusKey, ['pending', 'under review', 'under-review', 'in progress'], true)) {
            $pillBg = "0.996 0.953 0.780 rg";
            $pillBorder = "0.980 0.827 0.478 RG";
            $pillText = "0.706 0.325 0.035 rg";
        } elseif (in_array($statusKey, ['revise', 'needs revision'], true)) {
            $pillBg = "1.0 0.929 0.835 rg";
            $pillBorder = "0.992 0.741 0.490 RG";
            $pillText = "0.761 0.255 0.047 rg";
        } else {
            $pillBg = "0.996 0.886 0.886 rg";
            $pillBorder = "0.988 0.655 0.655 RG";
            $pillText = "0.725 0.110 0.110 rg";
        }

        $pillWidth = max(strlen($statusRaw) * 6.0 + 16, 68.0);
        $pillX = $left + 300;
        $pillY = $barY + 8;
        $ops[] = "{$pillBg} {$pillX} {$pillY} {$pillWidth} 16 re f";
        $ops[] = "{$pillBorder} 0.5 w {$pillX} {$pillY} {$pillWidth} 16 re S";
        $ops[] = "BT /F1 7.5 Tf {$pillText} " . ($pillX + 8) . " " . ($pillY + 4) . " Td (" . $this->escapePdfText(ucfirst($statusRaw)) . ") Tj ET";

        // Col 4: Total Amount
        $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($right - 120) . " " . ($barY + 28) . " Td (TOTAL AMOUNT) Tj ET";
        $ops[] = "BT /F1 10.5 Tf 0.059 0.090 0.165 rg " . ($right - 120) . " " . ($barY + 11) . " Td (" . $this->escapePdfText($doc['total_amount'] ?? '--') . ") Tj ET";

        $y = $barY - 18.0;

        // 3. SECTION 1: RESPONSIVE RECORD SUMMARY CARD (STACKED LABEL-ABOVE-VALUE)
        $summary = $doc['summary'] ?? [];
        $commentText = $summary['User Comment'] ?? $summary['Shortfall Explanation'] ?? null;
        $purposeText = $summary['Purpose'] ?? null;
        $adminNotesText = $summary['Admin Notes'] ?? null;

        // Scalar key-values (excluding long comment callouts)
        $scalarPairs = [];
        foreach ($summary as $k => $v) {
            if (in_array($k, ['User Comment', 'Shortfall Explanation', 'Purpose', 'Admin Notes'], true)) {
                continue;
            }
            $scalarPairs[$k] = (string) $v;
        }

        // Layout scalar fields into 2 balanced columns
        $keys = array_keys($scalarPairs);
        $halfCount = (int) ceil(count($keys) / 2);
        $leftKeys = array_slice($keys, 0, $halfCount);
        $rightKeys = array_slice($keys, $halfCount);
        $rowCount = max(count($leftKeys), count($rightKeys));

        $notes = [];
        if (!empty($purposeText) && $purposeText !== 'None') {
            $notes[] = ['label' => 'PURPOSE / BUSINESS RATIONALE', 'text' => $purposeText];
        }
        if (!empty($commentText) && !in_array($commentText, ['No comment provided', 'None'], true)) {
            $label = isset($summary['Shortfall Explanation']) ? 'SHORTFALL EXPLANATION' : 'USER COMMENT';
            $notes[] = ['label' => $label, 'text' => $commentText];
        }
        if (!empty($adminNotesText) && !in_array($adminNotesText, ['None', 'No admin notes provided'], true)) {
            $notes[] = ['label' => 'ADMIN REVIEW NOTES', 'text' => $adminNotesText];
        }

        $preparedNotes = [];
        foreach ($notes as $noteItem) {
            $rawText = trim((string) $noteItem['text']);
            $wrappedLines = array_slice(explode("\n", wordwrap($rawText, 95, "\n")), 0, 2);
            $lineCount = count($wrappedLines);
            $boxHeight = $lineCount > 1 ? 38.0 : 28.0;
            $preparedNotes[] = [
                'label' => $noteItem['label'],
                'lines' => $wrappedLines,
                'height' => $boxHeight,
            ];
        }

        $notesCount = count($preparedNotes);
        $totalNotesHeight = 0.0;
        if ($notesCount > 0) {
            foreach ($preparedNotes as $pNote) {
                $totalNotesHeight += $pNote['height'];
            }
            $totalNotesHeight += ($notesCount - 1) * 8.0;
        }

        if ($notesCount > 0) {
            $summaryCardHeight = 24.0 + ($rowCount * 26.0) + $totalNotesHeight;
        } else {
            $summaryCardHeight = 14.0 + ($rowCount * 26.0);
        }

        $ensureSpace($summaryCardHeight + 20.0);

        // Section Title: clean typography, no blue vertical rectangle
        $ops[] = "BT /F1 8.5 Tf 0.118 0.161 0.231 rg {$left} {$y} Td (RECORD SUMMARY) Tj ET";
        $titleW = strlen("RECORD SUMMARY") * 5.6 + 8;
        $ops[] = "0.886 0.910 0.941 RG 0.5 w " . ($left + $titleW) . " " . ($y + 3) . " m {$right} " . ($y + 3) . " l S";
        $y -= 14.0;

        // Summary Card Box: Clean white background, neutral border
        $cardBoxY = $y - $summaryCardHeight;
        $ops[] = "1.0 1.0 1.0 rg {$left} {$cardBoxY} {$contentWidth} {$summaryCardHeight} re f";
        $ops[] = "0.886 0.910 0.941 RG 0.5 w {$left} {$cardBoxY} {$contentWidth} {$summaryCardHeight} re S";

        $curRowY = $y - 14.0;
        for ($i = 0; $i < $rowCount; $i++) {
            // Left Column: starts at x = left + 14, width ~250pt (label above value)
            if (isset($leftKeys[$i])) {
                $lk = strtoupper($leftKeys[$i]);
                $lv = $scalarPairs[$leftKeys[$i]];
                $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($left + 14) . " {$curRowY} Td (" . $this->escapePdfText($lk) . ") Tj ET";
                $ops[] = "BT /F2 8.5 Tf 0.059 0.090 0.165 rg " . ($left + 14) . " " . ($curRowY - 10) . " Td (" . $this->escapePdfText($lv) . ") Tj ET";
            }
            // Right Column: starts at x = left + 275, width ~250pt (label above value)
            if (isset($rightKeys[$i])) {
                $rk = strtoupper($rightKeys[$i]);
                $rv = $scalarPairs[$rightKeys[$i]];
                $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($left + 275) . " {$curRowY} Td (" . $this->escapePdfText($rk) . ") Tj ET";
                $ops[] = "BT /F2 8.5 Tf 0.059 0.090 0.165 rg " . ($left + 275) . " " . ($curRowY - 10) . " Td (" . $this->escapePdfText($rv) . ") Tj ET";
            }
            $curRowY -= 26.0;
        }

        // Render each note in its own clean callout box (NO colored blue bars, collision-free geometry)
        $nextBoxTop = $curRowY + 2.0;
        foreach ($preparedNotes as $pNote) {
            $calloutH = $pNote['height'];
            $calloutW = $contentWidth - 28.0;
            $boxBottom = $nextBoxTop - $calloutH;

            $ops[] = "0.973 0.980 0.988 rg " . ($left + 14) . " {$boxBottom} {$calloutW} {$calloutH} re f";
            $ops[] = "0.886 0.910 0.941 RG 0.5 w " . ($left + 14) . " {$boxBottom} {$calloutW} {$calloutH} re S";
            $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($left + 22) . " " . ($nextBoxTop - 10.0) . " Td (" . $this->escapePdfText($pNote['label']) . ") Tj ET";

            foreach ($pNote['lines'] as $lIdx => $lineText) {
                $lineY = $nextBoxTop - 20.0 - ($lIdx * 10.5);
                $ops[] = "BT /F2 8 Tf 0.059 0.090 0.165 rg " . ($left + 22) . " {$lineY} Td (" . $this->escapePdfText($lineText) . ") Tj ET";
            }

            $nextBoxTop = $boxBottom - 8.0;
        }

        $y = $cardBoxY - 18.0;

        // 4. SECTION 2: WORKFLOW PROGRESS TRACKER
        $trackerSteps = $doc['tracker_steps'] ?? [];
        if (!empty($trackerSteps)) {
            $stepCount = count($trackerSteps);
            $trackerCardHeight = 44.0;
            $ensureSpace($trackerCardHeight + 24.0);

            // Title: clean typography, no blue rectangle
            $trTitle = strtoupper($doc['tracker_title'] ?? 'PROGRESS TRACKER');
            $ops[] = "BT /F1 8.5 Tf 0.118 0.161 0.231 rg {$left} {$y} Td (" . $this->escapePdfText($trTitle) . ") Tj ET";
            $trW = strlen($trTitle) * 5.4 + 8;
            $ops[] = "0.886 0.910 0.941 RG 0.5 w " . min($left + $trW, $right) . " " . ($y + 3) . " m {$right} " . ($y + 3) . " l S";
            $y -= 14.0;

            // Compute step card dimensions
            $gap = 10.0;
            $totalGap = ($stepCount - 1) * $gap;
            $stepWidth = ($contentWidth - $totalGap) / $stepCount;
            $stepBoxH = 34.0;
            $stepBoxY = $y - $stepBoxH;

            foreach ($trackerSteps as $idx => $step) {
                $stepX = $left + ($idx * ($stepWidth + $gap));
                $stName = $step['stage'] ?? ('Step ' . ($idx + 1));
                $stState = $step['state'] ?? 'Pending';
                $isCompleted = preg_match('/completed|approved|granted|disbursed|signed|settled|reviewed/i', $stState);
                $isInProgress = preg_match('/in progress|awaiting|submitted/i', $stState);

                // Step box background & border
                $ops[] = "0.973 0.980 0.988 rg {$stepX} {$stepBoxY} {$stepWidth} {$stepBoxH} re f";
                $stepBorderColor = $isCompleted ? "0.525 0.882 0.655" : ($isInProgress ? "0.980 0.827 0.478" : "0.886 0.910 0.941");
                $ops[] = "{$stepBorderColor} RG 0.5 w {$stepX} {$stepBoxY} {$stepWidth} {$stepBoxH} re S";

                // Step stage name
                $ops[] = "BT /F1 7 Tf 0.2 0.25 0.33 rg " . ($stepX + 6) . " " . ($stepBoxY + 21) . " Td (" . $this->escapePdfText(substr($stName, 0, 18)) . ") Tj ET";

                // Step state text
                $stateColor = $isCompleted ? "0.082 0.502 0.239" : ($isInProgress ? "0.706 0.325 0.035" : "0.58 0.64 0.72");
                $ops[] = "BT /F2 6.5 Tf {$stateColor} rg " . ($stepX + 6) . " " . ($stepBoxY + 8) . " Td (" . $this->escapePdfText(substr($stState, 0, 20)) . ") Tj ET";

                // Draw connecting arrow if not the last step
                if ($idx < $stepCount - 1) {
                    $arrowX = $stepX + $stepWidth + 3.0;
                    $arrowY = $stepBoxY + 14.0;
                    $ops[] = "BT /F1 8 Tf 0.58 0.64 0.72 rg {$arrowX} {$arrowY} Td (>) Tj ET";
                }
            }

            $y = $stepBoxY - 18.0;
        }

        // 5. SECTION 3: EXTRA SECTIONS (APPROVAL & PAYOUT / DISBURSEMENT AUDIT)
        foreach (($doc['extra_sections'] ?? []) as $sectionTitle => $items) {
            if (empty($items)) {
                continue;
            }
            $itemKeys = array_keys($items);
            $itemHalf = (int) ceil(count($itemKeys) / 2);
            $iLKeys = array_slice($itemKeys, 0, $itemHalf);
            $iRKeys = array_slice($itemKeys, $itemHalf);
            $extraRows = max(count($iLKeys), count($iRKeys));
            $extraCardH = 14.0 + ($extraRows * 26.0);

            $ensureSpace($extraCardH + 20.0);

            // Title: simple, no blue bar
            $escTitle = $this->escapePdfText(strtoupper($sectionTitle));
            $ops[] = "BT /F1 8.5 Tf 0.118 0.161 0.231 rg {$left} {$y} Td ({$escTitle}) Tj ET";
            $tW = strlen($sectionTitle) * 5.6 + 8;
            $ops[] = "0.886 0.910 0.941 RG 0.5 w " . ($left + $tW) . " " . ($y + 3) . " m {$right} " . ($y + 3) . " l S";
            $y -= 14.0;

            $extraBoxY = $y - $extraCardH;
            $ops[] = "1.0 1.0 1.0 rg {$left} {$extraBoxY} {$contentWidth} {$extraCardH} re f";
            $ops[] = "0.886 0.910 0.941 RG 0.5 w {$left} {$extraBoxY} {$contentWidth} {$extraCardH} re S";

            $eRowY = $y - 14.0;
            for ($k = 0; $k < $extraRows; $k++) {
                if (isset($iLKeys[$k])) {
                    $kName = strtoupper($iLKeys[$k]);
                    $kVal = (string) $items[$iLKeys[$k]];
                    $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($left + 14) . " {$eRowY} Td (" . $this->escapePdfText($kName) . ") Tj ET";
                    $ops[] = "BT /F2 8.5 Tf 0.059 0.090 0.165 rg " . ($left + 14) . " " . ($eRowY - 10) . " Td (" . $this->escapePdfText($kVal) . ") Tj ET";
                }
                if (isset($iRKeys[$k])) {
                    $kName = strtoupper($iRKeys[$k]);
                    $kVal = (string) $items[$iRKeys[$k]];
                    $ops[] = "BT /F1 6.5 Tf 0.392 0.455 0.545 rg " . ($left + 275) . " {$eRowY} Td (" . $this->escapePdfText($kName) . ") Tj ET";
                    $ops[] = "BT /F2 8.5 Tf 0.059 0.090 0.165 rg " . ($left + 275) . " " . ($eRowY - 10) . " Td (" . $this->escapePdfText($kVal) . ") Tj ET";
                }
                $eRowY -= 26.0;
            }
            $y = $extraBoxY - 18.0;
        }

        // 6. SECTION 4: ATTACHED RECEIPTS TABLE
        $receipts = $doc['receipts'] ?? [];
        $receiptCount = count($receipts);
        $ensureSpace(50.0);

        // Section Title: simple, no blue bar
        $ops[] = "BT /F1 8.5 Tf 0.118 0.161 0.231 rg {$left} {$y} Td (ATTACHED RECEIPTS \({$receiptCount}\)) Tj ET";
        $recW = strlen("ATTACHED RECEIPTS ({$receiptCount})") * 5.6 + 8;
        $ops[] = "0.886 0.910 0.941 RG 0.5 w " . ($left + $recW) . " " . ($y + 3) . " m {$right} " . ($y + 3) . " l S";
        $y -= 14.0;

        if (empty($receipts)) {
            $ops[] = "0.973 0.980 0.988 rg {$left} " . ($y - 24) . " {$contentWidth} 24 re f";
            $ops[] = "0.886 0.910 0.941 RG 0.5 w {$left} " . ($y - 24) . " {$contentWidth} 24 re S";
            $ops[] = "BT /F3 8 Tf 0.58 0.64 0.72 rg " . ($left + 16) . " " . ($y - 15) . " Td (No receipt attachments recorded for this request.) Tj ET";
            $y -= 38.0;
        } else {
            // Table Header Helper
            $drawTableHeader = function () use (&$ops, $left, $contentWidth, &$y) {
                $ops[] = "0.118 0.161 0.231 rg {$left} " . ($y - 18) . " {$contentWidth} 18 re f";
                $ops[] = "BT /F1 7.5 Tf 1.0 1.0 1.0 rg " . ($left + 8) . " " . ($y - 12) . " Td (#) Tj ET";
                $ops[] = "BT /F1 7.5 Tf 1.0 1.0 1.0 rg " . ($left + 28) . " " . ($y - 12) . " Td (VENDOR NAME) Tj ET";
                $ops[] = "BT /F1 7.5 Tf 1.0 1.0 1.0 rg " . ($left + 160) . " " . ($y - 12) . " Td (INVOICE #) Tj ET";
                $ops[] = "BT /F1 7.5 Tf 1.0 1.0 1.0 rg " . ($left + 235) . " " . ($y - 12) . " Td (DATE) Tj ET";
                $ops[] = "BT /F1 7.5 Tf 1.0 1.0 1.0 rg " . ($left + 310) . " " . ($y - 12) . " Td (CATEGORY) Tj ET";
                $ops[] = "BT /F1 7.5 Tf 1.0 1.0 1.0 rg " . ($left + 400) . " " . ($y - 12) . " Td (AMOUNT) Tj ET";
                $ops[] = "BT /F1 7.5 Tf 1.0 1.0 1.0 rg " . ($left + 485) . " " . ($y - 12) . " Td (STATUS) Tj ET";
                $y -= 18.0;
            };

            $drawTableHeader();

            // Table Rows
            foreach ($receipts as $rIdx => $r) {
                // Check pagination for each table row
                if ($y - 18.0 < 55.0) {
                    $pushNewPage();
                    $drawTableHeader();
                }

                $rowY = $y - 18.0;
                $rowBg = ($rIdx % 2 === 0) ? "1.0 1.0 1.0" : "0.973 0.980 0.988";
                $ops[] = "{$rowBg} rg {$left} {$rowY} {$contentWidth} 18 re f";
                $ops[] = "0.886 0.910 0.941 RG 0.5 w {$left} {$rowY} m {$right} {$rowY} l S";

                $ops[] = "BT /F2 7.5 Tf 0.392 0.455 0.545 rg " . ($left + 8) . " " . ($rowY + 5) . " Td (" . $this->escapePdfText((string) $r['index']) . ") Tj ET";
                $ops[] = "BT /F1 8 Tf 0.059 0.090 0.165 rg " . ($left + 28) . " " . ($rowY + 5) . " Td (" . $this->escapePdfText(substr($r['vendor'] ?? '', 0, 24)) . ") Tj ET";
                $ops[] = "BT /F2 7.5 Tf 0.2 0.25 0.33 rg " . ($left + 160) . " " . ($rowY + 5) . " Td (" . $this->escapePdfText(substr($r['invoice'] ?? '--', 0, 14)) . ") Tj ET";
                $ops[] = "BT /F2 7.5 Tf 0.2 0.25 0.33 rg " . ($left + 235) . " " . ($rowY + 5) . " Td (" . $this->escapePdfText($r['date'] ?? '--') . ") Tj ET";
                $ops[] = "BT /F2 7.5 Tf 0.2 0.25 0.33 rg " . ($left + 310) . " " . ($rowY + 5) . " Td (" . $this->escapePdfText(substr($r['category'] ?? '', 0, 16)) . ") Tj ET";
                $ops[] = "BT /F1 8 Tf 0.059 0.090 0.165 rg " . ($left + 400) . " " . ($rowY + 5) . " Td (" . $this->escapePdfText($r['amount'] ?? '--') . ") Tj ET";

                $rStatus = ucfirst((string) ($r['status'] ?? 'Approved'));
                $rColor = strtolower($rStatus) === 'approved' ? "0.082 0.502 0.239" : "0.392 0.455 0.545";
                $ops[] = "BT /F1 7.5 Tf {$rColor} rg " . ($left + 485) . " " . ($rowY + 5) . " Td (" . $this->escapePdfText($rStatus) . ") Tj ET";

                $y = $rowY;
            }

            // Summary row at bottom of receipts table
            if ($y - 20.0 < 55.0) {
                $pushNewPage();
            }
            $ops[] = "0.973 0.980 0.988 rg {$left} " . ($y - 20) . " {$contentWidth} 20 re f";
            $ops[] = "0.886 0.910 0.941 RG 0.5 w {$left} " . ($y - 20) . " {$contentWidth} 20 re S";
            $ops[] = "BT /F1 8 Tf 0.059 0.090 0.165 rg " . ($left + 12) . " " . ($y - 13) . " Td (Receipts Recorded: {$receiptCount}) Tj ET";
            $y -= 36.0;
        }

        // Push final page
        $pages[] = implode("\n", $ops);
        $totalPages = count($pages);

        // Append footer on all pages
        foreach ($pages as $pIdx => &$pStream) {
            $fOps = [];
            $pageNum = $pIdx + 1;
            $fOps[] = "0.886 0.910 0.941 RG 0.5 w {$left} 42 m {$right} 42 l S";
            $fOps[] = "BT /F2 7 Tf 0.58 0.64 0.72 rg {$left} 30 Td (SBSI Smart Expense & Reimbursement Management System \(SERMS\) - Confidential) Tj ET";
            $fOps[] = "BT /F1 7 Tf 0.58 0.64 0.72 rg " . ($right - 55) . " 30 Td (Page {$pageNum} of {$totalPages}) Tj ET";
            $pStream .= "\n" . implode("\n", $fOps);
        }
        unset($pStream);

        return $this->compilePdfDocument($pages, $pageWidth, $pageHeight);
    }

    /**
     * Compile page streams into a valid %PDF-1.4 file with Helvetica fonts.
     */
    private function compilePdfDocument(array $pages, float $pageWidth, float $pageHeight): string
    {
        $pageCount = count($pages);
        $objects = [];
        $objIndex = 1;

        $catalogIndex = $objIndex++;
        $pagesIndex = $objIndex++;

        $fontBoldIndex = $objIndex++;
        $fontRegularIndex = $objIndex++;
        $fontObliqueIndex = $objIndex++;

        $pageObjIndices = [];
        $streamObjIndices = [];

        for ($i = 0; $i < $pageCount; $i++) {
            $pageObjIndices[$i] = $objIndex++;
            $streamObjIndices[$i] = $objIndex++;
        }

        $objects[$catalogIndex] = "{$catalogIndex} 0 obj\n<< /Type /Catalog /Pages {$pagesIndex} 0 R >>\nendobj\n";

        $kids = implode(' ', array_map(fn($idx) => "{$idx} 0 R", $pageObjIndices));
        $objects[$pagesIndex] = "{$pagesIndex} 0 obj\n<< /Type /Pages /Kids [{$kids}] /Count {$pageCount} >>\nendobj\n";

        $objects[$fontBoldIndex] = "{$fontBoldIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n";
        $objects[$fontRegularIndex] = "{$fontRegularIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n";
        $objects[$fontObliqueIndex] = "{$fontObliqueIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\nendobj\n";

        for ($i = 0; $i < $pageCount; $i++) {
            $pIdx = $pageObjIndices[$i];
            $sIdx = $streamObjIndices[$i];
            $streamContent = $pages[$i];
            $streamLen = strlen($streamContent);

            $objects[$pIdx] = "{$pIdx} 0 obj\n<< /Type /Page /Parent {$pagesIndex} 0 R /MediaBox [0 0 {$pageWidth} {$pageHeight}] /Resources << /Font << /F1 {$fontBoldIndex} 0 R /F2 {$fontRegularIndex} 0 R /F3 {$fontObliqueIndex} 0 R >> >> /Contents {$sIdx} 0 R >>\nendobj\n";
            $objects[$sIdx] = "{$sIdx} 0 obj\n<< /Length {$streamLen} >>\nstream\n{$streamContent}\nendstream\nendobj\n";
        }

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        ksort($objects);
        foreach ($objects as $num => $obj) {
            $offsets[$num] = strlen($pdf);
            $pdf .= $obj;
        }

        $xrefOffset = strlen($pdf);
        $count = count($objects) + 1;
        $pdf .= "xref\n0 {$count}\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }

        $pdf .= "trailer\n<< /Size {$count} /Root {$catalogIndex} 0 R >>\n";
        $pdf .= "startxref\n{$xrefOffset}\n%%EOF";

        return $pdf;
    }
}
