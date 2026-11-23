<?php

namespace App\Modules\CashAdvances\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DisburseCashAdvanceRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true; // handled by Policy
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array|string>
     */
    public function rules(): array
    {
        return [
            'channel' => 'required_without:payout_method|nullable|string|max:100',
            'reference' => 'nullable|string|max:100',
            'granted_by' => 'nullable|string|max:255',
            'payout_method' => 'required_without:channel|nullable|string|in:Cash,E-wallet,Card,Visa,Other',
            'payout_method_other' => 'required_if:payout_method,Other|nullable|string|max:255',
            'granter_signature' => 'required_with:payout_method|nullable|string',
            'password' => 'required|string',
        ];
    }
}
