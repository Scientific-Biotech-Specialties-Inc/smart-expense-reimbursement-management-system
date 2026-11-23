<?php

namespace App\Modules\Shared\Services;

use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class CmsContractExpenseService
{
    /**
     * Aggregate approved and granted reimbursements by contract_id for CMS Analytics.
     *
     * Uses SQL SUM + GROUP BY to avoid loading full tables into memory.
     *
     * @return array<int, array<string, mixed>>
     */
    public function expensesByContract(): array
    {
        $rows = DB::table('reimbursements')
            ->leftJoin('expense_categories', 'reimbursements.expense_category_id', '=', 'expense_categories.id')
            ->whereNotNull('reimbursements.contract_id')
            ->whereIn('reimbursements.status', ['approved', 'granted'])
            ->groupBy('reimbursements.contract_id', 'expense_categories.name')
            ->orderBy('reimbursements.contract_id')
            ->select([
                'reimbursements.contract_id',
                DB::raw('expense_categories.name as category_name'),
                DB::raw('SUM(reimbursements.amount) as total_amount'),
            ])
            ->get();

        $grouped = [];

        foreach ($rows as $row) {
            $contractId = (int) $row->contract_id;
            if (!isset($grouped[$contractId])) {
                $grouped[$contractId] = [
                    'contract_id'    => $contractId,
                    'total_expenses' => 0.0,
                    'breakdown'      => [
                        'travel'        => 0.0,
                        'spare_parts'   => 0.0,
                        'field_service' => 0.0,
                        'other'         => 0.0,
                    ],
                ];
            }

            $amount = round((float) $row->total_amount, 2);
            $bucket = $this->mapCategoryBucket($row->category_name);

            $grouped[$contractId]['breakdown'][$bucket] = round(
                $grouped[$contractId]['breakdown'][$bucket] + $amount,
                2
            );
            $grouped[$contractId]['total_expenses'] = round(
                $grouped[$contractId]['total_expenses'] + $amount,
                2
            );
        }

        return array_values($grouped);
    }

    /**
     * Fetch reimbursements matched by normalized TIN or fallback case-insensitive vendor_name.
     *
     * @return array<int, array<string, mixed>>
     */
    public function reimbursementsByVendor(array $filters): array
    {
        $rawTin = trim((string) ($filters['tin'] ?? ''));
        $normalizedTin = preg_replace('/\D/', '', $rawTin) ?? '';
        $vendorName = trim((string) ($filters['vendor_name'] ?? ''));
        $statusFilter = trim((string) ($filters['status'] ?? ''));
        $since = trim((string) ($filters['since'] ?? ''));
        $limit = max(1, min((int) ($filters['limit'] ?? 100), 200));

        $matchedReimbursements = collect();
        $matchMode = null;

        if ($normalizedTin !== '') {
            $matchedReimbursements = $this->queryByTin($normalizedTin, $statusFilter, $since, $limit);
            if ($matchedReimbursements->isNotEmpty()) {
                $matchMode = 'tin';
            }
        }

        if ($matchedReimbursements->isEmpty() && $vendorName !== '') {
            $matchedReimbursements = $this->queryByVendorName($vendorName, $statusFilter, $since, $limit);
            $matchMode = 'name';
        }

        $results = [];

        foreach ($matchedReimbursements as $reimbursement) {
            $allReceipts = $this->collectReimbursementReceipts($reimbursement);

            $matchingReceipts = $allReceipts->filter(function (Receipt $receipt) use ($matchMode, $normalizedTin, $vendorName) {
                if ($matchMode === 'tin') {
                    return $this->normalizeTin($receipt->tin) === $normalizedTin;
                }

                $rVendor = strtolower(trim((string) $receipt->vendor_name));
                $target = strtolower($vendorName);

                return $rVendor === $target || str_contains($rVendor, $target);
            });

            if ($matchingReceipts->isEmpty()) {
                continue;
            }

            $primary = $matchingReceipts->first();
            $allMatched = $matchingReceipts->count() === $allReceipts->count();
            $amount = $allMatched
                ? round((float) $reimbursement->amount, 2)
                : round((float) $matchingReceipts->sum('total_amount'), 2);

            $expenseDate = $reimbursement->date
                ? $reimbursement->date->format('Y-m-d')
                : ($reimbursement->created_at ? $reimbursement->created_at->format('Y-m-d') : null);

            $results[] = [
                'reimbursement_id' => (int) $reimbursement->id,
                'reference_no'     => 'RMB-' . $reimbursement->id,
                'tin_number'       => $primary->tin,
                'vendor_name'      => $primary->vendor_name,
                'category'         => $primary->category?->name ?? $reimbursement->expenseCategory?->name ?? 'Others',
                'description'      => $reimbursement->description,
                'amount'           => $amount,
                'status'           => $this->formatTitleStatus((string) $reimbursement->status),
                'employee_name'    => $reimbursement->user?->name ?? $reimbursement->submitted_by_name ?? 'Unknown',
                'contract_id'      => $reimbursement->contract_id ? (int) $reimbursement->contract_id : null,
                'expense_date'     => $expenseDate,
                'created_at'       => $reimbursement->created_at?->copy()->utc()->format('Y-m-d\TH:i:s\Z'),
            ];
        }

        return $results;
    }

    private function queryByTin(string $normalizedTin, string $statusFilter, string $since, int $limit)
    {
        $tinExpr = "REPLACE(REPLACE(REPLACE(COALESCE(receipts.tin, ''), '-', ''), ' ', ''), '.', '')";

        return $this->baseVendorQuery($statusFilter, $since)
            ->where(function ($q) use ($tinExpr, $normalizedTin) {
                $q->whereHas('receipts', fn ($rq) => $rq->whereRaw("{$tinExpr} = ?", [$normalizedTin]))
                    ->orWhereHas('receipt', fn ($rq) => $rq->whereRaw("{$tinExpr} = ?", [$normalizedTin]));
            })
            ->limit($limit)
            ->get();
    }

    private function queryByVendorName(string $vendorName, string $statusFilter, string $since, int $limit)
    {
        $lowerName = strtolower($vendorName);

        $exact = $this->baseVendorQuery($statusFilter, $since)
            ->where(function ($q) use ($lowerName) {
                $q->whereHas('receipts', fn ($rq) => $rq->whereRaw('LOWER(TRIM(receipts.vendor_name)) = ?', [$lowerName]))
                    ->orWhereHas('receipt', fn ($rq) => $rq->whereRaw('LOWER(TRIM(receipts.vendor_name)) = ?', [$lowerName]));
            })
            ->limit($limit)
            ->get();

        if ($exact->isNotEmpty()) {
            return $exact;
        }

        $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $lowerName) . '%';

        return $this->baseVendorQuery($statusFilter, $since)
            ->where(function ($q) use ($like) {
                $q->whereHas('receipts', fn ($rq) => $rq->whereRaw('LOWER(receipts.vendor_name) LIKE ?', [$like]))
                    ->orWhereHas('receipt', fn ($rq) => $rq->whereRaw('LOWER(receipts.vendor_name) LIKE ?', [$like]));
            })
            ->limit($limit)
            ->get();
    }

    private function baseVendorQuery(string $statusFilter, string $since)
    {
        $query = Reimbursement::with(['receipts.category', 'receipt.category', 'user', 'expenseCategory'])
            ->orderByDesc('date')
            ->orderByDesc('id');

        if ($statusFilter !== '') {
            $normalizedStatus = strtolower($statusFilter);
            if ($normalizedStatus === 'paid') {
                $query->whereIn('status', ['granted', 'paid']);
            } else {
                $query->whereRaw('LOWER(status) = ?', [$normalizedStatus]);
            }
        }

        if ($since !== '') {
            $sinceDt = Carbon::parse($since);
            $query->where('updated_at', '>=', $sinceDt);
        }

        return $query;
    }

    private function collectReimbursementReceipts(Reimbursement $reimbursement)
    {
        $collection = $reimbursement->receipts;
        if ($reimbursement->receipt && !$collection->contains('id', $reimbursement->receipt->id)) {
            $collection = $collection->push($reimbursement->receipt);
        }
        return $collection;
    }

    private function normalizeTin(?string $tin): string
    {
        return preg_replace('/\D/', '', (string) $tin) ?? '';
    }

    private function formatTitleStatus(string $status): string
    {
        $lower = strtolower(trim($status));

        return match ($lower) {
            'granted', 'paid' => 'Paid',
            'pending'         => 'Pending',
            'approved'        => 'Approved',
            'rejected'        => 'Rejected',
            'revise'          => 'Revise',
            'submitted'       => 'Submitted',
            default           => ucfirst($lower),
        };
    }

    private function mapCategoryBucket(?string $categoryName): string
    {
        $name = strtolower(trim((string) $categoryName));

        if ($name === '') {
            return 'other';
        }

        if (preg_match('/travel|transport|accommodation|lodging|hotel|flight|fuel|mileage|parking|toll/', $name)) {
            return 'travel';
        }

        if (preg_match('/spare|parts|suppl|equipment|material|consumable|reagent/', $name)) {
            return 'spare_parts';
        }

        if (preg_match('/field[\s_-]*service|calibration|maintenance|repair|install|labor|service/', $name)) {
            return 'field_service';
        }

        return 'other';
    }
}
