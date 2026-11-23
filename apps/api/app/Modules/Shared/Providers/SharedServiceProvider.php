<?php

namespace App\Modules\Shared\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class SharedServiceProvider extends ServiceProvider
{
    /**
     * Register any shared services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any shared services.
     */
    public function boot(\Illuminate\Routing\Router $router): void
    {
        RateLimiter::for('serms-password', function (Request $request) {
            return Limit::perMinute(10)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('serms-exports-ocr', function (Request $request) {
            return Limit::perMinute(30)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('serms-api', function (Request $request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });

        // Register the external auth and internal service-to-service middleware aliases
        $router->aliasMiddleware('auth.external', \App\Modules\Shared\Http\Middleware\AuthenticateWithExternalService::class);
        $router->aliasMiddleware('auth.internal', \App\Modules\Shared\Http\Middleware\AuthenticateInternalService::class);

        // Load Shared module routes
        $routesPath = __DIR__ . '/../routes/api.php';
        if (file_exists($routesPath)) {
            $this->loadRoutesFrom($routesPath);
        }
    }
}
