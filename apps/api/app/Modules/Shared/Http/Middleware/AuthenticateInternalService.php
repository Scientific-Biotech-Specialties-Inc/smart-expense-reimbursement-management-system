<?php

namespace App\Modules\Shared\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Constant-time X-Internal-Secret validation for CMS <-> SERMS internal endpoints.
 */
class AuthenticateInternalService
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = config('services.cms.internal_secret')
            ?: getenv('INTERNAL_SERVICE_SECRET')
            ?: ($_ENV['INTERNAL_SERVICE_SECRET'] ?? null)
            ?: ($_SERVER['INTERNAL_SERVICE_SECRET'] ?? null);

        $provided = $request->header('X-Internal-Secret');

        if (empty($secret) || !is_string($provided) || $provided === '' || !hash_equals((string) $secret, $provided)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        return $next($request);
    }
}
