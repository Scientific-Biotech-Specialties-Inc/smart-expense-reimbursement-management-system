<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OcrCallbackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Auth is handled by the AuthenticateAiServiceApi middleware.
    }

    public function rules(): array
    {
        return [
            'receipt_id'          => ['required', 'integer', 'exists:receipts,id'],
            'vendor_name'         => ['nullable', 'string', 'max:255'],
            'transaction_date'    => ['nullable', 'date'],
            'total_amount'        => ['nullable', 'numeric', 'min:0'],
            'subtotal'            => ['nullable', 'numeric', 'min:0'],
            'vat_amount'          => ['nullable', 'numeric', 'min:0'],
            'tin'                 => ['nullable', 'string', 'max:255'],
            'invoice_number'      => ['nullable', 'string', 'max:255'],
            'ocr_confidence_score'=> ['nullable', 'numeric', 'min:0', 'max:1'],
            'expense_category'    => ['nullable', 'string', 'max:255'],
            'vat_classification'  => ['nullable', 'string', 'in:vat,non-vat'],
            'currency'            => ['nullable', 'string', 'size:3'],
            'location'            => ['nullable', 'string', 'max:255'],
            'status'              => ['nullable', 'string', 'max:50'],
            'error'               => ['nullable', 'string'],
            'rejection_code'      => ['nullable', 'string', 'max:50'],
            'rejection_reason'    => ['nullable', 'string'],
            'items'               => ['nullable', 'array'],
            'items.*.name'        => ['required_with:items', 'string', 'max:255'],
            'items.*.quantity'    => ['required_with:items', 'integer', 'min:1'],
            'items.*.price'       => ['required_with:items', 'numeric', 'min:0'],
            'is_duplicate'         => ['nullable', 'boolean'],
            'duplicate_similarity' => ['nullable', 'numeric'],
        ];
    }

    public function messages(): array
    {
        return [
            'receipt_id.exists'            => 'The referenced receipt does not exist.',
            'ocr_confidence_score.required' => 'ocr_confidence_score is required.',
            'ocr_confidence_score.min'     => 'ocr_confidence_score must be between 0 and 1.',
            'ocr_confidence_score.max'     => 'ocr_confidence_score must be between 0 and 1.',
        ];
    }
}
