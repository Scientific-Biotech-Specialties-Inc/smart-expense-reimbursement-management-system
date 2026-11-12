<?php

namespace App\Modules\Users\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Users\Services\ProfileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function __construct(private readonly ProfileService $profileService)
    {
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:50'],
            'middle_name' => ['nullable', 'string', 'max:50'],
            'last_name' => ['required', 'string', 'max:50'],
            'contact_number' => [
                'required',
                'string',
                'max:20',
                'regex:/^(\+63|0)?[0-9\s\-()]{7,18}$/',
            ],
        ], [
            'first_name.required' => 'First name is required.',
            'last_name.required' => 'Last name is required.',
            'contact_number.required' => 'Contact number is required.',
            'contact_number.regex' => 'Please enter a valid contact number (e.g., +63 917 123 4567 or 09171234567).',
        ]);

        $user = $this->profileService->updateProfile($request->user(), $validated, $request);

        return response()->json([
            'message' => 'Profile details updated successfully.',
            'user' => $user,
        ]);
    }

    public function uploadPhoto(Request $request): JsonResponse
    {
        $request->validate([
            'photo' => ['required', 'file', 'mimes:jpeg,jpg,png', 'max:2048'],
        ], [
            'photo.required' => 'Please select an image file to upload.',
            'photo.mimes' => 'Only JPG and PNG files are allowed.',
            'photo.max' => 'Profile photo must not exceed 2MB.',
        ]);

        $user = $this->profileService->updatePhoto($request->user(), $request->file('photo'), $request);

        return response()->json([
            'message' => 'Profile photo updated successfully.',
            'user' => $user,
        ]);
    }

    public function removePhoto(Request $request): JsonResponse
    {
        $user = $this->profileService->removePhoto($request->user(), $request);

        return response()->json([
            'message' => 'Profile photo removed.',
            'user' => $user,
        ]);
    }

    public function updateSignature(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'signature' => ['required', 'string'],
        ], [
            'signature.required' => 'Please draw your signature before saving.',
        ]);

        $user = $this->profileService->updateSignature($request->user(), $validated['signature'], $request);

        return response()->json([
            'message' => 'Signature saved to your profile.',
            'user' => $user,
        ]);
    }

    public function removeSignature(Request $request): JsonResponse
    {
        $user = $this->profileService->removeSignature($request->user(), $request);

        return response()->json([
            'message' => 'Saved signature removed.',
            'user' => $user,
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $this->profileService->changePassword($request->user(), $request);

        return response()->json([
            'message' => 'Password changed successfully.',
        ]);
    }

    public function activity(Request $request): JsonResponse
    {
        return response()->json(
            $this->profileService->getActivity($request->user())
        );
    }
}
