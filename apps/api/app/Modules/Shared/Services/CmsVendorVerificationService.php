<?php

namespace App\Modules\Shared\Services;

use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;

class CmsVendorVerificationService
{
    public const TAG_ACCREDITED = '[Accredited Vendor]';
    public const TAG_UNVERIFIED = '[Unverified Vendor — Secondary Accounting Audit Required]';
    public const TAG_LOOKUP_UNAVAILABLE = '[CMS Lookup Unavailable — Manual Verification Required]';

    public function __construct(protected CmsClientService $cmsClient) {}

    /**
     * Cross-validate a receipt's vendor/TIN with CMS and persist accreditation & audit flags.
     */
    public function verifyAndTagReceipt(Receipt $receipt): Receipt
    {
        $tin = trim((string) $receipt->tin);
        $name = trim((string) $receipt->vendor_name);

        if ($tin === '' && $name === '') {
            return $receipt;
        }

        $result = $this->cmsClient->lookupVendor($tin !== '' ? $tin : null, $name !== '' ? $name : null);

        if (!$result['available'] || !is_array($result['data'])) {
            $receipt->update([
                'vendor_matched'         => null,
                'vendor_accredited'      => false,
                'vendor_audit_required'  => true,
                'vendor_flagged'         => false,
                'vendor_cms_supplier_id' => null,
                'vendor_status_tag'      => self::TAG_LOOKUP_UNAVAILABLE,
            ]);

            return $receipt->fresh();
        }

        $vendor = $result['data'];
        $isAccredited = (bool) ($vendor['is_accredited'] ?? false);
        $requiresAudit = (bool) ($vendor['requires_audit'] ?? true);
        $isMatched = (bool) ($vendor['matched'] ?? false);
        $isFlagged = (bool) ($vendor['is_flagged'] ?? false);
        $supplierId = isset($vendor['supplier_id']) ? (int) $vendor['supplier_id'] : null;

        $updates = [
            'vendor_matched'         => $isMatched,
            'vendor_accredited'      => $isAccredited,
            'vendor_flagged'         => $isFlagged,
            'vendor_cms_supplier_id' => $supplierId,
        ];

        if ($isAccredited && !$requiresAudit) {
            $updates['vendor_audit_required'] = false;
            $updates['vendor_status_tag'] = self::TAG_ACCREDITED;

            if (!empty($vendor['default_expense_category'])) {
                $updates['expense_category_id'] = ExpenseCategory::firstOrCreate([
                    'name' => trim((string) $vendor['default_expense_category']),
                ])->id;
            }
        } else {
            $updates['vendor_audit_required'] = true;
            $updates['vendor_status_tag'] = self::TAG_UNVERIFIED;
        }

        $receipt->update($updates);

        return $receipt->fresh();
    }
}
