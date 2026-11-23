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
        return array_merge(
            [
                'receipt_id'                   => ['required', 'integer', 'exists:receipts,id'],
                'split_receipts'               => ['nullable', 'array'],
                'split_receipts.*.receipt_id'  => ['nullable', 'integer'],
            ],
            $this->receiptFieldRules(),
            $this->receiptFieldRules('split_receipts.*.')
        );
    }

    /**
     * Shared validation rules for a single OCR receipt payload (top-level or split child).
     */
    private function receiptFieldRules(string $prefix = ''): array
    {
        return [
            "{$prefix}segment_indices"      => ['nullable', 'array'],
            "{$prefix}segment_indices.*"    => ['integer', 'min:0'],
            "{$prefix}vendor_name"          => ['nullable', 'string', 'max:255'],
            "{$prefix}transaction_date"     => ['nullable', 'date'],
            "{$prefix}total_amount"         => ['nullable', 'numeric', 'min:0'],
            "{$prefix}subtotal"             => ['nullable', 'numeric', 'min:0'],
            "{$prefix}vat_amount"           => ['nullable', 'numeric', 'min:0'],
            "{$prefix}discount_amount"      => ['nullable', 'numeric', 'min:0'],
            "{$prefix}discount_type"        => ['nullable', 'string', 'in:none,senior,pwd,student,promo,employee,other'],
            "{$prefix}tin"                  => ['nullable', 'string', 'max:255'],
            "{$prefix}invoice_number"       => ['nullable', 'string', 'max:255'],
            "{$prefix}ocr_confidence_score" => ['nullable', 'numeric', 'min:0', 'max:1'],
            "{$prefix}expense_category"     => ['nullable', 'string', 'max:255'],
            "{$prefix}vat_classification"   => ['nullable', 'string', 'in:vat,non-vat'],
            "{$prefix}currency"             => ['nullable', 'string', 'size:3'],
            "{$prefix}location"             => ['nullable', 'string', 'max:255'],
            "{$prefix}status"               => ['nullable', 'string', 'max:50'],
            "{$prefix}error"                => ['nullable', 'string'],
            "{$prefix}rejection_code"       => ['nullable', 'string', 'max:50'],
            "{$prefix}rejection_reason"     => ['nullable', 'string'],
            "{$prefix}items"                => ['nullable', 'array'],
            "{$prefix}items.*.name"         => ['required', 'string', 'max:255'],
            "{$prefix}items.*.quantity"     => ['required', 'integer', 'min:1'],
            "{$prefix}items.*.price"        => ['required', 'numeric', 'min:0'],
            "{$prefix}is_duplicate"         => ['nullable', 'boolean'],
            "{$prefix}duplicate_similarity" => ['nullable', 'numeric'],
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
