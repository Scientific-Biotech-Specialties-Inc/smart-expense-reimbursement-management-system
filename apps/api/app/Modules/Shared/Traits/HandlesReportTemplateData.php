<?php

namespace App\Modules\Shared\Traits;

use Illuminate\Http\Request;

/**
 * Shared handling of the optional SBSI `report_template_data` payload
 * (reimbursements, cash advances, liquidations).
 */
trait HandlesReportTemplateData
{
    /**
     * Validation rules for `report_template_data` (nullable object; known nested keys are type-checked,
     * unknown keys are kept as-is so the frontend template can evolve).
     */
    protected static function reportTemplateDataRules(): array
    {
        return [
            'report_template_data' => 'nullable|array',
            // wildcard keeps every top-level key in validated() (Laravel drops keys without a rule)
            'report_template_data.*' => 'nullable',
            'report_template_data.breakdownItems' => 'nullable|array',
            'report_template_data.breakdownItems.*.description' => 'nullable|string|max:500',
            'report_template_data.breakdownItems.*.amount' => 'nullable|numeric|min:0',
        ];
    }

    /**
     * FormData sends nested objects as a JSON string: decode it into an array before validation.
     * Invalid JSON is left as a string so the `array` rule rejects it with a 422.
     */
    protected function decodeReportTemplateData(Request $request): void
    {
        $raw = $request->input('report_template_data');

        if (!is_string($raw)) {
            return;
        }

        if (trim($raw) === '' || trim($raw) === 'null') {
            $request->merge(['report_template_data' => null]);
            return;
        }

        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $request->merge(['report_template_data' => $decoded]);
        }
    }
}
