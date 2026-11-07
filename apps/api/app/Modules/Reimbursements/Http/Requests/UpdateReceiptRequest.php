<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateReceiptRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Decode the `items` payload from a JSON string when sent as FormData.
     * Mirrors ResubmitReceiptRequest::prepareForValidation.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('items')) {
            $this->merge([
                'items' => is_string($this->items) ? json_decode($this->items, true) : $this->items,
            ]);
        }
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
            // Admin-only fields (enforced in the service layer).
            'admin_notes' => 'nullable|string',
            'status' => 'nullable|string|in:pending,approved,rejected,processed',

            // Owner-editable OCR correction fields.
            'expense_category_id' => 'nullable|exists:expense_categories,id',
            'vendor_name' => 'nullable|string|max:255',
            'transaction_date' => 'nullable|date',
            'total_amount' => 'nullable|numeric|min:0',
            'subtotal' => 'nullable|numeric|min:0',
            'vat_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'discount_type' => 'nullable|string|in:none,senior,pwd,student,promo,employee,other',
            'tin' => 'nullable|string|max:255',
            'invoice_number' => 'nullable|string|max:255',
            'location' => 'nullable|string|max:255',
            'vat_classification' => 'nullable|in:vat,non-vat,VAT,Non-VAT',
            'currency' => 'nullable|string|max:3',
            'items' => 'nullable|array',
            'items.*.name' => 'required_with:items|string|max:255',
            'items.*.quantity' => 'required_with:items|integer|min:1',
            'items.*.price' => 'required_with:items|numeric|min:0',
        ];
    }
}
