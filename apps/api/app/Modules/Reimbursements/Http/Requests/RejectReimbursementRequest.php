<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RejectReimbursementRequest extends FormRequest
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
            'comment' => 'required|string|min:5|max:255',
            'password' => 'nullable|string',
            'encryptedKey' => 'nullable|string',
            'iv' => 'nullable|string',
            'ciphertext' => 'nullable|string',
            'action' => 'sometimes|string|in:revise,reject',
        ];
    }
}
