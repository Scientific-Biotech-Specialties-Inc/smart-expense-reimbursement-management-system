<?php

namespace App\Modules\Shared\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Modules\Shared\Services\PayloadDecryptionService;

/**
     * Reusable service to verify user passwords against the external authentication service.
     *
     * Input signature:
     * - Request $request: The incoming request containing JWT authorization headers or cookies.
     * - string $password: The plaintext password string to verify.
     *
     * Returns:
     * - bool: True if verification succeeds, false otherwise.
     *
     * Example Usage:
     * ```php
     * if (!PasswordVerificationService::verify($request, $password)) {
     *     return response()->json(['message' => 'Invalid password'], 422);
     * }
     * ```
     */
class PasswordVerificationService
{
    /**
     * Verify the user's password against the external authentication service.
     *
     * The plaintext password is resolved in one of two ways (backward compatible):
     *   1. If the request carries an encrypted envelope (encryptedKey/iv/ciphertext),
     *      it is decrypted via PayloadDecryptionService into the plaintext password.
     *      This is the path used by the SPA, which encrypts client-side per SDD §5.
     *   2. Otherwise the $password argument (plaintext) is used, preserving the
     *      existing contract for the other server-side callers (CashAdvances,
     *      Reimbursements, Liquidations) that still forward plaintext today.
     *
     * @param Request $request
     * @param string  $password Plaintext fallback (unused when an envelope is sent).
     */
    public static function verify(Request $request, string $password = ''): bool
    {
        $token = $request->bearerToken();

        if (!$token && $request->hasCookie('access_token')) {
            $token = urldecode($request->cookie('access_token'));
        }

        if (!$token) {
            Log::warning('Password verification failed: No active JWT token found in request.');
            return false;
        }

        $hasEnvelope = $request->has(['encryptedKey', 'iv', 'ciphertext']);

        if (!$hasEnvelope && (app()->environment('production') || config('services.crypto.require_envelope', false))) {
            Log::warning('Password verification rejected: client-side encrypted envelope is required.');
            return false;
        }

        // Resolve the plaintext password: decrypt the envelope if the client sent one.
        try {
            if ($hasEnvelope) {
                $password = PayloadDecryptionService::decryptEnvelope(
                    $request->only(['encryptedKey', 'iv', 'ciphertext'])
                );
            }
        } catch (\Throwable $e) {
            // A malformed/undecryptable envelope is a client input error, not a server
            // fault — log it (never swallow) and treat as an invalid password (→ 422).
            Log::error('Password envelope decryption failed at integration boundary.', [
                'error' => $e->getMessage(),
            ]);
            return false;
        }

        if ($password === '' || $password === null) {
            Log::warning('Password verification aborted: empty password after resolution.');
            return false;
        }

        $authUrl = config('services.capstone_auth.url');

        try {
            $headers = [
                'Authorization' => "Bearer {$token}",
                'Accept' => 'application/json',
            ];
            if ($request->hasHeader('Cookie')) {
                $headers['Cookie'] = $request->header('Cookie');
            }

            // Forward the recovered plaintext to the external auth verifier.
            $response = Http::withHeaders($headers)->post("{$authUrl}/api/verify-password", [
                'password' => $password,
            ]);

            if ($response->successful()) {
                $data = $response->json();
                return isset($data['valid']) && $data['valid'] === true;
            }

            Log::error('External password verification returned non-success response.', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            if ($response->status() === 401) {
                $message = $response->json('message') ?? 'Unauthenticated or session missing.';
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'password' => ["Authentication failed: {$message}. Please log out and log back in to refresh your session."]
                ]);
            }

            return false;

        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e; // rethrow domain validation (422)
        } catch (\Throwable $e) {
            // Integration boundary (external HTTP): log and rethrow per AGENTS.md —
            // never silently swallow.
            Log::error('External password verification request failed at integration boundary.', [
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
