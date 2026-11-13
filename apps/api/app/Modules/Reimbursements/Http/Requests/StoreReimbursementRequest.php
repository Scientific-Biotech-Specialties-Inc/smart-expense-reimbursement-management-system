<?php

namespace App\Modules\Reimbursements\Http\Requests;

use App\Modules\Shared\Traits\HandlesReportTemplateData;
use Illuminate\Foundation\Http\FormRequest;

class StoreReimbursementRequest extends FormRequest
{
    use HandlesReportTemplateData;

    /**
     * Determine if the user is authorized to make this request.
     */
    protected function prepareForValidation(): void
    {
        $this->decodeReportTemplateData($this);
    }

    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
            ...self::reportTemplateDataRules(),
            'description' => 'required|string|max:255',
            'user_comment' => 'nullable|string|max:1000',
            'expense_category_id' => 'required|integer|exists:expense_categories,id',
            'event_type' => 'required|string|max:100',
            'amount' => 'required|numeric|min:0.01',
            'date' => 'required|date',
            'report_file' => 'required|file|mimes:pdf,doc,docx|max:2048',
            'receipt_ids' => 'required|array|min:1',
            'receipt_ids.*' => 'exists:receipts,id',
            'receipts' => 'nullable|array',
            'receipts.*.id' => 'required_with:receipts|exists:receipts,id',
            'receipts.*.expense_category_id' => 'nullable|integer|exists:expense_categories,id',
            'receipts.*.event_type' => 'nullable|string|max:100',
            'receipts.*.vendor_name' => 'nullable|string|max:255',
            'receipts.*.transaction_date' => 'nullable|date',
            'receipts.*.total_amount' => 'nullable|numeric|min:0',
            'receipts.*.subtotal' => 'nullable|numeric|min:0',
            'receipts.*.vat_amount' => 'nullable|numeric|min:0',
            'receipts.*.vat_classification' => 'nullable|string|in:vat,non-vat',
            'receipts.*.tin' => 'nullable|string|max:255',
            'receipts.*.invoice_number' => 'nullable|string|max:255',
            'receipts.*.location' => 'nullable|string|max:255',
            'receipts.*.items' => 'nullable|array',
            'receipts.*.items.*.name' => 'required_with:receipts.*.items|string|max:255',
            'receipts.*.items.*.quantity' => 'required_with:receipts.*.items|integer|min:1',
            'receipts.*.items.*.price' => 'required_with:receipts.*.items|numeric|gt:0',
        ];
    }

    protected function failedValidation(\Illuminate\Contracts\Validation\Validator $validator)
    {
        \Illuminate\Support\Facades\Log::warning('StoreReimbursementRequest failed validation', [
            'errors' => $validator->errors()->toArray(),
            'receipt_ids' => $this->input('receipt_ids'),
            'receipts' => $this->input('receipts'),
            'all_keys' => array_keys($this->all()),
        ]);

        parent::failedValidation($validator);
    }
}
