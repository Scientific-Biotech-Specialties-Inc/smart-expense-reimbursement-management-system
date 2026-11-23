<?php

namespace App\Modules\CashAdvances\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RejectCashAdvanceRequest extends FormRequest
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
            'comment' => 'required|string|min:5',
            'action' => 'sometimes|string|in:revise,reject',
            'password' => 'required_without_all:encryptedKey,iv,ciphertext|nullable|string',
            'encryptedKey' => 'nullable|string',
            'iv' => 'nullable|string',
            'ciphertext' => 'nullable|string',
        ];
    }
}
