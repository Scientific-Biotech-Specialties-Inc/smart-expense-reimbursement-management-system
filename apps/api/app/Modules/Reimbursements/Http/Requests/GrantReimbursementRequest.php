<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GrantReimbursementRequest extends FormRequest
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
     */
    public function rules(): array
    {
        return [
            'password' => 'nullable|string',
            'approved_by' => 'nullable|string|max:255',
            'granted_by' => 'required|string|max:255',
            'payout_method' => 'required|string|in:Cash,E-wallet,Card,Visa,Other',
            'payout_method_other' => 'required_if:payout_method,Other|nullable|string|max:255',
            'granter_signature' => 'required|string',
        ];
    }
}
