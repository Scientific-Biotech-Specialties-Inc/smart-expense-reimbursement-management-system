<?php

namespace App\Modules\Reimbursements\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ApproveReimbursementRequest extends FormRequest
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
            'secondary_audit_confirmed' => 'nullable|boolean',
            'secondary_audit_note' => 'nullable|string|max:500',
        ];
    }
}
