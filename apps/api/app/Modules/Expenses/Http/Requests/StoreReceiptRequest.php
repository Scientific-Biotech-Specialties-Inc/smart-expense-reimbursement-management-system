<?php

namespace App\Modules\Expenses\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreReceiptRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true; // handled by controller/policies/permissions
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
            'file_path' => 'required|string|max:500',
            'file_hash' => 'required|string|size:64',
            'file_type' => 'required|in:jpeg,png,pdf',
            'file_size_bytes' => 'required|integer|min:1',
            'vendor_name' => 'nullable|string|max:255',
            'transaction_date' => 'nullable|date',
            'total_amount' => 'nullable|numeric|min:0',
            'vat_amount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'discount_type' => 'nullable|string|in:none,senior,pwd,student,promo,employee,other',
            'tin' => 'nullable|string|max:20',
            'invoice_number' => 'nullable|string|max:100',
            'vat_classification' => 'nullable|in:vat,non-vat',
            'currency' => 'nullable|string|size:3',
            'ocr_confidence_score' => 'nullable|numeric|min:0|max:100',
            'expense_category_id' => 'nullable|exists:expense_categories,id',
            'category' => 'nullable|string|max:100',
        ];
    }
}
