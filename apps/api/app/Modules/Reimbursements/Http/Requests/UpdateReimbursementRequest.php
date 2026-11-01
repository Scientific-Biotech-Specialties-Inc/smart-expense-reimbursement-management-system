<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateReimbursementRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * Supports two modes:
     * 1. Admin note update — admin_notes / status only
     * 2. Employee self-edit — full field set for pending/rejected records
     */
    public function rules(): array
    {
        return [
            // Admin fields
            'admin_notes' => 'nullable|string',
            'status' => 'nullable|string|in:pending,approved,rejected,granted',

            // Employee self-edit fields
            'description' => 'sometimes|string|max:500',
            'user_comment' => 'nullable|string|max:1000',
            'expense_category_id' => 'nullable|integer|exists:expense_categories,id',
            'event_type' => 'nullable|string|max:100',
            'amount' => 'sometimes|numeric|min:0.01',
            'date' => 'sometimes|date',
            'report_file' => 'sometimes|file|mimes:pdf,doc,docx,xlsx,jpeg,png,jpg|max:5120',
            'receipt_ids' => 'sometimes|array',
            'receipt_ids.*' => 'integer|exists:receipts,id',
            'receipts' => 'sometimes|array',
            'receipts.*.id' => 'required_with:receipts|integer|exists:receipts,id',
            'receipts.*.expense_category_id' => 'nullable|integer|exists:expense_categories,id',
            'receipts.*.event_type' => 'nullable|string|max:100',
            'receipts.*.vendor_name' => 'nullable|string|max:255',
            'receipts.*.transaction_date' => 'nullable|date',
            'receipts.*.total_amount' => 'nullable|numeric|min:0',
            'receipts.*.subtotal' => 'nullable|numeric|min:0',
            'receipts.*.vat_amount' => 'nullable|numeric|min:0',
            'receipts.*.vat_classification' => 'nullable|string|in:vat,non-vat',
            'receipts.*.tin' => 'nullable|string|max:50',
            'receipts.*.invoice_number' => 'nullable|string|max:100',
            'receipts.*.location' => 'nullable|string|max:255',
            'receipts.*.items' => 'nullable|array',
            'receipts.*.items.*.name' => 'required_with:receipts.*.items|string|max:255',
            'receipts.*.items.*.quantity' => 'required_with:receipts.*.items|integer|min:1',
            'receipts.*.items.*.price' => 'required_with:receipts.*.items|numeric|min:0',
        ];
    }
}
