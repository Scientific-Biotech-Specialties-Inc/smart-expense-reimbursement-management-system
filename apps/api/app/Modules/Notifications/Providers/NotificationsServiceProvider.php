<?php

namespace App\Modules\Notifications\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Route;

class NotificationsServiceProvider extends ServiceProvider
{
    /**
     * Register any module services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any module services.
     */
    public function boot(): void
    {
        $migrationPath = __DIR__ . '/../Database/Migrations';
        if (is_dir($migrationPath)) {
            $this->loadMigrationsFrom($migrationPath);
        }

        $routeFile = __DIR__ . '/../routes/api.php';
        if (file_exists($routeFile)) {
            Route::middleware('api')
                ->prefix('api/notifications')
                ->group($routeFile);
        }
    }
}
