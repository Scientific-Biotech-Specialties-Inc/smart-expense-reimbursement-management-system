<?php

namespace App\Modules\Shared\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Shared\Services\ReportGeneratorService;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\AuditLogs\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    protected ReportGeneratorService $reportGenerator;

    public function __construct(ReportGeneratorService $reportGenerator)
    {
        $this->reportGenerator = $reportGenerator;
    }

    public function download(Request $request, string $type, int $id)
    {
        $user = $request->user();
        $normalizedType = strtolower(trim($type));

        if (!in_array($normalizedType, ['reimbursement', 'cash-advance', 'liquidation'], true)) {
            return response()->json(['message' => 'Invalid report type.'], 404);
        }

        if ($normalizedType === 'reimbursement') {
            $record = Reimbursement::with(['user', 'receipts.category', 'expenseCategory', 'payout'])->findOrFail($id);
            $canManage = $user->can('serms.reimbursements.manage') || in_array($user->role, ['admin', 'superadmin', 'finance', 'accounting'], true);

            if (!$canManage && (int) $record->user_id !== (int) $user->id) {
                return response()->json(['message' => 'Forbidden. You are not allowed to export this report.'], 403);
            }

            $report = DB::transaction(function () use ($record, $user, $request) {
                $generated = $this->reportGenerator->buildReimbursementReport($record, $user);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) $user->role,
                    actionType: 'REPORT_EXPORTED',
                    entityType: 'reimbursement',
                    entityId: $record->id,
                    beforeState: null,
                    afterState: [
                        'format' => 'pdf',
                        'filename' => $generated['filename'],
                        'exported_at' => now()->toIso8601String(),
                    ],
                    ipAddress: $request->ip()
                );

                return $generated;
            });
        } elseif ($normalizedType === 'cash-advance') {
            $record = CashAdvance::with([
                'requester',
                'approvalActions.approver',
                'disbursement.disbursedBy',
                'document',
                'liquidations',
            ])->findOrFail($id);

            $canManage = $user->can('serms.cash_advances.manage') || in_array($user->role, ['admin', 'superadmin', 'finance', 'accounting'], true);

            if (!$canManage && (int) $record->user_id !== (int) $user->id) {
                return response()->json(['message' => 'Forbidden. You are not allowed to export this report.'], 403);
            }

            $report = DB::transaction(function () use ($record, $user, $request) {
                $generated = $this->reportGenerator->buildCashAdvanceReport($record, $user);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) $user->role,
                    actionType: 'REPORT_EXPORTED',
                    entityType: 'cash-advance',
                    entityId: $record->id,
                    beforeState: null,
                    afterState: [
                        'format' => 'pdf',
                        'filename' => $generated['filename'],
                        'exported_at' => now()->toIso8601String(),
                    ],
                    ipAddress: $request->ip()
                );

                return $generated;
            });
        } else {
            // liquidation: supports direct liquidation ID or fallback to cash_advance_id (?by=cash_advance)
            $byCashAdvance = $request->query('by') === 'cash_advance';
            $liquidation = null;
            $advance = null;

            if (!$byCashAdvance) {
                $liquidation = Liquidation::with(['user', 'cashAdvance'])->find($id);
            }

            if ($liquidation) {
                $advance = CashAdvance::findOrFail($liquidation->cash_advance_id);
                $ownerId = (int) $liquidation->user_id;
                $entityId = (int) $liquidation->id;
            } else {
                $advance = CashAdvance::with(['liquidations'])->findOrFail($id);
                $liquidation = $advance->liquidations->sortByDesc('created_at')->sortByDesc('id')->first();
                $ownerId = (int) $advance->user_id;
                $entityId = (int) ($liquidation?->id ?? $advance->id);
            }

            $canManage = $user->can('serms.liquidations.manage') || in_array($user->role, ['admin', 'superadmin', 'finance', 'accounting'], true);

            if (!$canManage && $ownerId !== (int) $user->id) {
                return response()->json(['message' => 'Forbidden. You are not allowed to export this report.'], 403);
            }

            $report = DB::transaction(function () use ($liquidation, $advance, $user, $entityId, $request) {
                $generated = $this->reportGenerator->buildLiquidationReport($liquidation, $advance, $user);

                AuditLogService::log(
                    actorId: $user->id,
                    actorRole: (string) $user->role,
                    actionType: 'REPORT_EXPORTED',
                    entityType: 'liquidation',
                    entityId: $entityId,
                    beforeState: null,
                    afterState: [
                        'format' => 'pdf',
                        'filename' => $generated['filename'],
                        'cash_advance_id' => $advance->id,
                        'exported_at' => now()->toIso8601String(),
                    ],
                    ipAddress: $request->ip()
                );

                return $generated;
            });
        }

        return response($report['content'], 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $report['filename'] . '"',
            'Cache-Control' => 'no-store, no-cache, must-revalidate',
        ]);
    }
}
