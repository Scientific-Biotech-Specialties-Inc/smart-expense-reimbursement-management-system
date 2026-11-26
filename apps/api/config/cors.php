<?php

$rawOrigins = env(
    'CORS_ALLOWED_ORIGINS',
    implode(',', array_filter([
        env('FRONTEND_URL', 'http://localhost:5002'),
        'http://localhost:5173',
        'http://localhost:5002',
    ]))
);

$allowedOrigins = array_values(array_unique(array_filter(array_map(
    static fn (string $origin): string => rtrim(trim($origin), '/'),
    explode(',', (string) $rawOrigins)
), static fn (string $origin): bool => $origin !== '' && $origin !== '*')));

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Restrict browser cross-origin access to explicit allow-listed origins
    | rather than wildcard "*". Override via CORS_ALLOWED_ORIGINS in .env.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'Origin',
        'X-Requested-With',
        'X-Idempotency-Key',
        'Idempotency-Key',
    ],

    'exposed_headers' => ['X-Idempotent-Replay'],

    'max_age' => 0,

    'supports_credentials' => true,

];
