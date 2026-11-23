<?php

namespace App\Modules\Shared\Http\Middleware;

use App\Modules\Shared\Models\IdempotencyKey;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\Response;

class EnsureIdempotency
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->attributes->has('__idempotency_processed')) {
            return $next($request);
        }

        $method = strtoupper($request->method());

        // 1. Safe methods bypass idempotency inspection
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'])) {
            return $next($request);
        }

        // 2. Extract idempotency key header
        $key = $request->header('X-Idempotency-Key') ?? $request->header('Idempotency-Key');

        if (empty($key)) {
            return $next($request);
        }

        $request->attributes->set('__idempotency_processed', true);

        $userId = $request->user()?->id;
        $scope = $userId === null ? $this->resolveUnauthenticatedScope($request) : null;
        $scopedKey = $userId === null ? hash('sha256', $scope . '|' . $key) : $key;
        $path = $request->path();
        $requestHash = $this->computeRequestHash($method, $path, $request->all(), $scope);

        // 3. Acquire atomic pending lock or check existing record
        $existing = IdempotencyKey::where('idempotency_key', $scopedKey)
            ->when(
                $userId !== null,
                fn ($q) => $q->where('user_id', $userId)
            )
            ->first();

        if ($existing) {
            if ($existing->status === 'completed') {
                if ($existing->request_hash !== $requestHash) {
                    return response()->json([
                        'message' => 'Idempotency key reused with different request payload.',
                    ], 422);
                }

                $headers = $existing->response_headers ?? ['Content-Type' => 'application/json'];
                $headers['X-Idempotent-Replay'] = 'true';

                return response($existing->response_body, $existing->response_status, $headers);
            }

            if ($existing->status === 'pending') {
                return response()->json([
                    'message' => 'A request with this idempotency key is currently processing. Please wait.',
                ], 409);
            }
        }

        // 4. Insert pending record
        try {
            $ledger = IdempotencyKey::create([
                'user_id' => $userId,
                'idempotency_key' => $scopedKey,
                'request_method' => $method,
                'request_path' => $path,
                'request_hash' => $requestHash,
                'status' => 'pending',
                'expires_at' => now()->addHours(24),
            ]);
        } catch (QueryException $e) {
            // Caught concurrent insert race condition
            return response()->json([
                'message' => 'A request with this idempotency key is currently processing. Please wait.',
            ], 409);
        }

        // 5. Execute pipeline
        try {
            $response = $next($request);

            if ($response->getStatusCode() < 500) {
                $resolvedUserId = $request->user()?->id ?? $userId;
                $ledger->update([
                    'user_id' => $resolvedUserId,
                    'status' => 'completed',
                    'response_status' => $response->getStatusCode(),
                    'response_body' => $response->getContent(),
                    'response_headers' => [
                        'Content-Type' => $response->headers->get('Content-Type') ?? 'application/json',
                    ],
                ]);
            } else {
                $ledger->delete();
            }

            return $response;
        } catch (\Throwable $e) {
            $ledger->delete();
            throw $e;
        }
    }

    /**
     * Derive a deterministic scope for requests evaluated before route-level auth runs.
     */
    protected function resolveUnauthenticatedScope(Request $request): string
    {
        $token = $request->bearerToken();

        if (!$token && $request->hasCookie('access_token')) {
            $token = urldecode((string) $request->cookie('access_token'));
        }

        if (!empty($token)) {
            return 'token:' . hash('sha256', $token);
        }

        return 'ip:' . hash('sha256', (string) ($request->ip() ?? 'unknown'));
    }

    /**
     * Compute deterministic hash for request path and body (including uploaded files).
     */
    protected function computeRequestHash(string $method, string $path, array $payload, ?string $scope = null): string
    {
        ksort($payload);
        $normalized = $this->normalizePayloadForHash($payload);
        $prefix = $scope !== null ? $scope . '|' : '';

        return hash('sha256', $prefix . $method . '|' . $path . '|' . json_encode($normalized, JSON_INVALID_UTF8_SUBSTITUTE));
    }

    /**
     * Normalize UploadedFile instances into deterministic metadata so multipart POSTs hash reliably.
     */
    private function normalizePayloadForHash(mixed $value): mixed
    {
        if ($value instanceof UploadedFile) {
            $realPath = $value->getRealPath();

            return [
                '__uploaded_file__' => true,
                'name'              => $value->getClientOriginalName(),
                'size'              => $value->getSize(),
                'mime'              => $value->getClientMimeType(),
                'sha256'            => ($realPath && is_file($realPath)) ? hash_file('sha256', $realPath) : null,
            ];
        }

        if (is_array($value)) {
            $result = [];
            foreach ($value as $k => $v) {
                $result[$k] = $this->normalizePayloadForHash($v);
            }
            return $result;
        }

        return $value;
    }
}
