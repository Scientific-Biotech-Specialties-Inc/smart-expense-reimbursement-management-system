<?php

namespace App\Modules\Shared\Services;

use App\Modules\AuditLogs\Services\AuditLogService;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Shared\Models\CmsContractRequest;
use App\Modules\Users\Models\User;
use Illuminate\Support\Facades\DB;

class CmsRecurringExpenseService
{
    public function __construct(protected CmsClientService $cmsClient) {}

    /**
     * Detect vendors with recurring one-off purchases (>= $minOccurrences) in SERMS.
     *
     * @return array<int, array<string, mixed>>
     */
    public function detectRecurringVendors(int $minOccurrences = 3, int $months = 12): array
    {
        $cutoffDate = now()->subMonths($months)->startOfDay()->format('Y-m-d');

        $reimbursements = Reimbursement::with(['receipts.category', 'receipt.category', 'expenseCategory'])
            ->whereNotIn('status', ['rejected', 'cancelled'])
            ->where(function ($q) use ($cutoffDate) {
                $q->whereDate('date', '>=', $cutoffDate)
                    ->orWhere(function ($sub) use ($cutoffDate) {
                        $sub->whereNull('date')->whereDate('created_at', '>=', $cutoffDate);
                    });
            })
            ->orderBy('date')
            ->orderBy('id')
            ->get();

        $groups = [];

        foreach ($reimbursements as $reimbursement) {
            $receipts = $reimbursement->receipts;
            if ($reimbursement->receipt && !$receipts->contains('id', $reimbursement->receipt->id)) {
                $receipts = $receipts->push($reimbursement->receipt);
            }

            // Group receipts inside this reimbursement by vendor key so a single claim
            // with 2 receipts from the same merchant counts as 1 reimbursement occurrence.
            $vendorBuckets = [];

            foreach ($receipts as $receipt) {
                $vendorName = trim((string) $receipt->vendor_name);
                $tin = trim((string) $receipt->tin);
                $normalizedTin = preg_replace('/\D/', '', $tin) ?? '';

                if ($vendorName === '' && strlen($normalizedTin) < 9) {
                    continue;
                }

                $vendorKey = strlen($normalizedTin) >= 9
                    ? 'tin:' . $normalizedTin
                    : 'name:' . strtolower(preg_replace('/\s+/', ' ', $vendorName));

                if (!isset($vendorBuckets[$vendorKey])) {
                    $vendorBuckets[$vendorKey] = [
                        'vendor_name' => $vendorName !== '' ? $vendorName : 'Unknown Vendor',
                        'tin_number'  => $tin !== '' ? $tin : null,
                        'norm_tin'    => strlen($normalizedTin) >= 9 ? $normalizedTin : null,
                        'amount'      => 0.0,
                        'category'    => $receipt->category?->name ?? $reimbursement->expenseCategory?->name ?? 'Service Agreement',
                    ];
                }

                $vendorBuckets[$vendorKey]['amount'] += (float) ($receipt->total_amount ?? 0);
            }

            $allSingleBucket = count($vendorBuckets) === 1 && $receipts->count() > 0;
            $txDate = $reimbursement->date
                ? $reimbursement->date->format('Y-m-d')
                : $reimbursement->created_at->format('Y-m-d');

            foreach ($vendorBuckets as $vendorKey => $bucket) {
                if (!isset($groups[$vendorKey])) {
                    $groups[$vendorKey] = [
                        'vendor_key'      => $vendorKey,
                        'vendor_name'     => $bucket['vendor_name'],
                        'tin_number'      => $bucket['tin_number'],
                        'normalized_tin'  => $bucket['norm_tin'],
                        'categories'      => [],
                        'reimbursements'  => [],
                    ];
                }

                if ($bucket['vendor_name'] !== '' && $bucket['vendor_name'] !== 'Unknown Vendor') {
                    $groups[$vendorKey]['vendor_name'] = $bucket['vendor_name'];
                }
                if ($bucket['tin_number'] !== null) {
                    $groups[$vendorKey]['tin_number'] = $bucket['tin_number'];
                }

                $groups[$vendorKey]['categories'][] = $bucket['category'];
                $itemAmount = $allSingleBucket && (float) $reimbursement->amount > 0
                    ? (float) $reimbursement->amount
                    : (float) $bucket['amount'];

                $groups[$vendorKey]['reimbursements'][$reimbursement->id] = [
                    'date'      => $txDate,
                    'amount'    => round($itemAmount, 2),
                    'reference' => 'RMB-' . $reimbursement->id,
                ];
            }
        }

        $forwardedByRef = CmsContractRequest::all()->keyBy('source_reference_id');
        $candidates = [];

        foreach ($groups as $vendorKey => $group) {
            $items = array_values($group['reimbursements']);
            $count = count($items);
            if ($count < $minOccurrences) {
                continue;
            }

            usort($items, fn ($a, $b) => strcmp($a['date'], $b['date']));
            $totalSpend = round(array_sum(array_column($items, 'amount')), 2);
            $periodStart = $items[0]['date'];
            $periodEnd = $items[$count - 1]['date'];
            $sourceRef = 'SERMS-REC-' . strtoupper(substr(sha1($vendorKey), 0, 10));

            $categoryCounts = array_count_values($group['categories']);
            arsort($categoryCounts);
            $topCategory = (string) array_key_first($categoryCounts);

            $forwarded = $forwardedByRef->get($sourceRef);

            $candidates[] = [
                'source_reference_id' => $sourceRef,
                'vendor_name'         => $group['vendor_name'],
                'tin_number'          => $group['tin_number'],
                'default_category'    => $topCategory,
                'occurrence_count'    => $count,
                'total_spend'         => $totalSpend,
                'period_start'        => $periodStart,
                'period_end'          => $periodEnd,
                'expense_items'       => $items,
                'forwarded_request'   => $forwarded ? [
                    'id'                         => $forwarded->id,
                    'contract_code'              => $forwarded->contract_code,
                    'status'                     => $forwarded->status,
                    'supporting_expense_summary' => $forwarded->supporting_expense_summary,
                    'forwarded_at'               => $forwarded->forwarded_at?->toIso8601String(),
                ] : null,
            ];
        }

        usort($candidates, fn ($a, $b) => $b['total_spend'] <=> $a['total_spend']);

        return $candidates;
    }

    /**
     * Forward a recurring expense summary to CMS and persist the returned contract request reference.
     */
    public function forwardToCms(User $user, array $payload, ?string $ipAddress = null): CmsContractRequest
    {
        $forwardedById = (int) ($user->auth_id ?: $user->id);

        $cmsPayload = [
            'vendor_name'         => $payload['vendor_name'],
            'tin_number'          => $payload['tin_number'] ?? null,
            'service_description' => $payload['service_description'],
            'category'            => $payload['category'],
            'region'              => $payload['region'] ?? null,
            'occurrence_count'    => (int) $payload['occurrence_count'],
            'total_spend'         => round((float) $payload['total_spend'], 2),
            'period_start'        => $payload['period_start'],
            'period_end'          => $payload['period_end'],
            'source_reference_id' => $payload['source_reference_id'],
            'forwarded_by'        => $forwardedById,
            'expense_items'       => $payload['expense_items'] ?? [],
        ];

        $response = $this->cmsClient->forwardContractRequest($cmsPayload);
        $data = $response['data'];

        $summary = $data['supporting_expense_summary'] ?? null;
        if (is_array($summary)) {
            $summary = json_encode($summary);
        }

        return DB::transaction(function () use ($user, $payload, $data, $summary, $ipAddress) {
            $normalizedTin = preg_replace('/\D/', '', (string) ($payload['tin_number'] ?? '')) ?: null;

            $record = CmsContractRequest::updateOrCreate(
                ['source_reference_id' => $payload['source_reference_id']],
                [
                    'vendor_name'                => $payload['vendor_name'],
                    'tin_number'                 => $payload['tin_number'] ?? null,
                    'normalized_tin'             => $normalizedTin,
                    'service_description'        => $payload['service_description'],
                    'category'                   => $payload['category'],
                    'region'                     => $payload['region'] ?? null,
                    'occurrence_count'           => (int) $payload['occurrence_count'],
                    'total_spend'                => round((float) $payload['total_spend'], 2),
                    'period_start'               => $payload['period_start'],
                    'period_end'                 => $payload['period_end'],
                    'expense_items'              => $payload['expense_items'] ?? [],
                    'contract_code'              => $data['contract_code'] ?? null,
                    'cms_request_id'             => isset($data['id']) ? (int) $data['id'] : (isset($data['contract_id']) ? (int) $data['contract_id'] : null),
                    'supporting_expense_summary' => $summary,
                    'status'                     => (string) ($data['status'] ?? $data['approval_status'] ?? 'Pending'),
                    'forwarded_by'               => $user->id,
                    'forwarded_at'               => now(),
                ]
            );

            AuditLogService::log(
                actorId: $user->id,
                actorRole: $user->role ?? 'admin',
                actionType: 'CMS_CONTRACT_REQUEST_FORWARDED',
                entityType: 'cms_contract_request',
                entityId: $record->id,
                beforeState: null,
                afterState: $record->toArray(),
                ipAddress: $ipAddress
            );

            return $record;
        });
    }
}
