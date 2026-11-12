<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreReceiptRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Prepare the data for validation.
     */
    protected function prepareForValidation()
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
            'file' => 'nullable|file|mimes:jpeg,png,pdf|max:2048',
            'files' => 'nullable|array',
            'files.*' => 'nullable|file|mimes:jpeg,png,pdf|max:2048',
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
            'vat_classification' => 'nullable|in:vat,non-vat',
            'currency' => 'nullable|string|max:10',
            'items' => 'nullable|array',
            'items.*.name' => 'required_with:items|string|max:255',
            'items.*.quantity' => 'required_with:items|integer|min:1',
            'items.*.price' => 'required_with:items|numeric|gt:0',
            'is_draft' => 'nullable|boolean',
        ];
    }
}
