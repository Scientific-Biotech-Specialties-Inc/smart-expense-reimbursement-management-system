<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\PenaltyRecord;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Shared\Services\PenaltySyncService;
use Carbon\Carbon;

class CheckLiquidationDeadlines extends Command
{
    protected $signature = 'notifications:check-liquidation-deadlines';

    protected $description = 'Send Due Soon (<= 3 days) and Overdue liquidation notifications to employees and admins.';

    public function handle(): int
    {
        $today = Carbon::now()->startOfDay();

        $advances = CashAdvance::with(['requester', 'liquidations'])
            ->whereIn('status', ['disbursed', 'signed', 'incomplete', 'overdue'])
            ->whereNotNull('expected_liquidation_date')
            ->where('outstanding_balance', '>', 0)
            ->get();

        foreach ($advances as $advance) {
            // Skip if any linked liquidation is already settled/liquidated/approved/under-review/pending
            $hasSettledOrActiveAudit = $advance->liquidations->contains(function ($liq) {
                return in_array(strtolower((string) $liq->status), ['liquidated', 'settled', 'approved', 'pending', 'under-review'], true);
            });

            if ($hasSettledOrActiveAudit) {
                continue;
            }

            $dueDate = Carbon::parse($advance->expected_liquidation_date)->startOfDay();
            $daysLeft = (int) $today->diffInDays($dueDate, false);
            $formattedDue = $dueDate->format('M j, Y');
            $formattedAmount = NotificationService::formatPeso($advance->amount);
            $employeeName = $advance->requester?->name ?? 'Employee';
            $latestLiq = $advance->liquidations->sortByDesc('id')->first();
            $recordLink = $latestLiq
                ? "/liquidations?view={$latestLiq->id}"
                : "/liquidations?advance={$advance->id}";

            if ($daysLeft >= 1 && $daysLeft <= 3) {
                // Stage 1: Near-deadline warning (1 to 3 days left) (G2-071 Task 3 & G2-077 Task 1)
                $dayWord = $daysLeft === 1 ? 'day' : 'days';
                NotificationService::notifyOnce(
                    userId: (int) $advance->user_id,
                    type: 'liquidation_due_soon',
                    module: 'Liquidation',
                    title: 'Liquidation Due Soon',
                    message: "Your liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is due in {$daysLeft} {$dayWord} ({$formattedDue}).",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'status' => 'Due Soon',
                        'amount' => $formattedAmount,
                        'days_left' => $daysLeft,
                        'due_date' => $formattedDue,
                    ]
                );
            } elseif ($daysLeft === 0) {
                // Stage 2: Due Today reminder (G2-077 Task 1)
                NotificationService::notifyOnce(
                    userId: (int) $advance->user_id,
                    type: 'liquidation_due_today',
                    module: 'Liquidation',
                    title: 'Liquidation Due Today',
                    message: "Your liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is due today ({$formattedDue}).",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'status' => 'Due Today',
                        'amount' => $formattedAmount,
                        'days_left' => 0,
                        'due_date' => $formattedDue,
                    ]
                );
            } elseif ($daysLeft < -PenaltySyncService::GRACE_PERIOD_DAYS) {
                // Stage 3: Overdue alert past 7-day grace period for employee and all admins
                $daysOverdue = abs($daysLeft) - PenaltySyncService::GRACE_PERIOD_DAYS;
                $penaltySum = (float) PenaltyRecord::where('cash_advance_id', $advance->id)->sum('penalty_amount');
                if ($penaltySum <= 0) {
                    $penaltySum = $daysOverdue * PenaltySyncService::DAILY_PENALTY_PHP;
                }
                $formattedPenalty = NotificationService::formatPeso($penaltySum);
                $dayWord = $daysOverdue === 1 ? 'day' : 'days';

                NotificationService::notifyOnce(
                    userId: (int) $advance->user_id,
                    type: 'liquidation_overdue',
                    module: 'Liquidation',
                    title: 'Liquidation Overdue',
                    message: "Your liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is {$daysOverdue} {$dayWord} overdue (Due: {$formattedDue}). Current penalty: {$formattedPenalty}.",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'status' => 'Overdue',
                        'amount' => $formattedAmount,
                        'days_overdue' => $daysOverdue,
                        'penalty_amount' => $penaltySum,
                        'penalty_formatted' => $formattedPenalty,
                        'due_date' => $formattedDue,
                    ]
                );

                NotificationService::notifyAdminsOnce(
                    type: 'admin_liquidation_overdue',
                    module: 'Liquidation',
                    title: 'Overdue Liquidation Alert',
                    message: "{$employeeName}'s liquidation for Cash Advance #{$advance->id} ({$formattedAmount}) is {$daysOverdue} {$dayWord} overdue. Accrued penalty: {$formattedPenalty}.",
                    recordLink: $recordLink,
                    recordType: 'cash_advance',
                    recordId: (int) $advance->id,
                    metadata: [
                        'employee_name' => $employeeName,
                        'status' => 'Overdue',
                        'amount' => $formattedAmount,
                        'days_overdue' => $daysOverdue,
                        'penalty_amount' => $penaltySum,
                        'penalty_formatted' => $formattedPenalty,
                        'due_date' => $formattedDue,
                    ],
                    excludeUserId: (int) $advance->user_id
                );
            }
        }

        return Command::SUCCESS;
    }
}
