<?php

namespace App\Modules\Shared\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Constant-time X-Internal-Secret validation for CMS/TS <-> SERMS internal endpoints.
 */
class AuthenticateInternalService
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = $this->resolveExpectedSecret($request);
        $provided = $request->header('X-Internal-Secret');

        if (empty($secret) || !is_string($provided) || $provided === '' || !hash_equals((string) $secret, $provided)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return $next($request);
    }

    private function resolveExpectedSecret(Request $request): ?string
    {
        $primary = $request->is('api/internal/ts*')
            ? config('services.ts.internal_secret')
            : config('services.cms.internal_secret');

        $secondary = $request->is('api/internal/ts*')
            ? config('services.cms.internal_secret')
            : config('services.ts.internal_secret');

        $envOrder = $request->is('api/internal/ts*')
            ? ['TS_INTERNAL_SECRET', 'INTERNAL_SERVICE_SECRET']
            : ['INTERNAL_SERVICE_SECRET', 'TS_INTERNAL_SECRET'];

        $secret = $primary ?: $secondary;
        if (!empty($secret)) {
            return (string) $secret;
        }

        foreach ($envOrder as $key) {
            $val = getenv($key) ?: ($_ENV[$key] ?? null) ?: ($_SERVER[$key] ?? null);
            if (!empty($val)) {
                return (string) $val;
            }
        }

        return null;
    }
}
