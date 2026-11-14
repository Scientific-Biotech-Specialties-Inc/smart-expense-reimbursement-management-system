<?php

namespace App\Modules\Shared\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Shared constant-time bearer token validation for machine-to-machine API endpoints.
 */
abstract class BaseBearerTokenMiddleware
{
    abstract protected function configKey(): string;

    abstract protected function envKey(): string;

    public function handle(Request $request, Closure $next): Response
    {
        $envKey = $this->envKey();
        $apiKey = config($this->configKey())
            ?: getenv($envKey)
            ?: ($_ENV[$envKey] ?? null)
            ?: ($_SERVER[$envKey] ?? null);

        $token = $request->bearerToken();

        if (!$apiKey || !$token || !hash_equals((string) $apiKey, $token)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return $next($request);
    }
}
