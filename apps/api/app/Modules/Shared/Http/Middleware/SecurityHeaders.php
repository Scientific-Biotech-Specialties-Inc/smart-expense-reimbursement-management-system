<?php

namespace App\Modules\Shared\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforces baseline HTTP security headers and removes PHP version leakage
 * at the application layer as defense-in-depth alongside nginx.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        if (function_exists('header_remove') && !headers_sent()) {
            @header_remove('X-Powered-By');
        }

        $response = $next($request);

        $response->headers->remove('X-Powered-By');

        $headers = [
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'SAMEORIGIN',
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=()',
        ];

        foreach ($headers as $name => $value) {
            if (!$response->headers->has($name)) {
                $response->headers->set($name, $value);
            }
        }

        return $response;
    }
}
