<?php

use App\Modules\Shared\Http\Middleware\EnsureIdempotency;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $trustedProxiesRaw = trim((string) env(
            'TRUSTED_PROXIES',
            '127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'
        ));
        $trustedProxies = $trustedProxiesRaw === '*'
            ? '*'
            : array_values(array_filter(
                array_map('trim', explode(',', $trustedProxiesRaw)),
                static fn (string $proxy): bool => $proxy !== ''
            ));

        $middleware->trustProxies(at: $trustedProxies);
        $middleware->append(EnsureIdempotency::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
