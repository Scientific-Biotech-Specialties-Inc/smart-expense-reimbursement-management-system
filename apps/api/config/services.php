<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Capstone Auth Module
    |--------------------------------------------------------------------------
    |
    | Configuration for the external capstone-auth-module microservice that
    | handles authentication (login, registration, OTP/MFA, token issuance).
    | SERMS delegates all auth flows to this service and validates JWTs
    | locally using the shared secret.
    |
    */

    'capstone_auth' => [
        'url'        => env('AUTH_SERVICE_URL', 'http://capstone-auth:3000'),
        'jwt_secret' => env('JWT_SECRET'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Payload Crypto (Client-Side Encryption)
    |--------------------------------------------------------------------------
    |
    | RSA key pair used to decrypt client-side encrypted payloads (SDD §5).
    | The public key is served at GET /api/crypto/key; the private key MUST
    | stay server-side only. Keys are generated automatically on first use if
    | the files are missing.
    |
    */

    'crypto' => [
        'private_key_path' => env('CRYPTO_PRIVATE_KEY_PATH', storage_path('crypto/private.pem')),
        'public_key_path'  => env('CRYPTO_PUBLIC_KEY_PATH', storage_path('crypto/public.pem')),
        'require_envelope' => filter_var(env('CRYPTO_REQUIRE_ENVELOPE', false), FILTER_VALIDATE_BOOLEAN),
    ],

    'prs' => [
        'reimbursement_api_key'            => env('PRS_REIMBURSEMENT_API_KEY'),
        'reimbursement_status_api_url'     => env('PRS_REIMBURSEMENT_STATUS_API_URL'),
        'reimbursement_status_api_key'     => env('PRS_REIMBURSEMENT_STATUS_API_KEY'),
        'reimbursement_status_api_timeout' => env('PRS_REIMBURSEMENT_STATUS_API_TIMEOUT', 10),
    ],

    /*
    |--------------------------------------------------------------------------
    | AI OCR + Categorization Service
    |--------------------------------------------------------------------------
    |
    | Configuration for the external AI service that handles receipt OCR
    | and expense categorization. SERMS dispatches receipts to this service
    | and receives results asynchronously via the OCR callback endpoint.
    |
    */

    'ai_service' => [
        'url'     => env('AI_SERVICE_URL'),
        'api_key' => env('AI_SERVICE_API_KEY'),
        'timeout' => env('AI_SERVICE_TIMEOUT', 10),
        'callback_base_url' => env('AI_SERVICE_CALLBACK_BASE_URL'),
        // Connection used to dispatch the OCR job. Defaults to "sync" so the
        // callback-based OCR pipeline runs inline within the request and works in
        // single-instance deployments that do NOT run a dedicated queue worker
        // (e.g. Azure App Service, local `php artisan serve`). Set to "database"
        // (or another connection) only when a worker (`php artisan queue:work`)
        // is actually running to process the queue.
        'ocr_queue_connection' => env('AI_SERVICE_OCR_QUEUE_CONNECTION', 'sync'),
    ],

    /*
    |--------------------------------------------------------------------------
    | CMS (Contract & Vendor Management System) Integration
    |--------------------------------------------------------------------------
    |
    | Outbound base URLs and shared internal secret for bi-directional
    | integration with CMS over Docker (shared-capstone-network) or tunnels.
    |
    */

    'cms' => [
        'contract_url'    => env('CMS_CONTRACT_URL', 'http://contract-management:8000/api'),
        'vendor_url'      => env('CMS_VENDOR_URL', 'http://vendor-management:8000/api'),
        'internal_secret' => env('INTERNAL_SERVICE_SECRET'),
        'timeout'         => (int) env('CMS_SERVICE_TIMEOUT', 5),
    ],

    /*
    |--------------------------------------------------------------------------
    | Ticketing System (TS) Integration
    |--------------------------------------------------------------------------
    |
    | Outbound base URL, optional status webhook URL, shared internal secret,
    | and request timeout for SERMS <-> Ticketing System integration.
    |
    */

    'ts' => [
        'api_url'                  => env('TS_API_URL'),
        'reimbursement_status_url' => env('TS_REIMBURSEMENT_STATUS_URL'),
        'internal_secret'          => env('TS_INTERNAL_SECRET') ?: env('INTERNAL_SERVICE_SECRET'),
        'timeout'                  => (int) env('TS_SERVICE_TIMEOUT', 10),
    ],

    /*
    |--------------------------------------------------------------------------
    | Exchange Rate API (Multi-Currency FX to PHP)
    |--------------------------------------------------------------------------
    |
    | Configuration for fetching live FX rates (default: ExchangeRate-API
    | Open Access endpoint with PHP as base) and cache staleness TTL.
    |
    */

    'exchange_rate' => [
        'url'       => env('EXCHANGE_RATE_API_URL', 'https://open.er-api.com/v6/latest/PHP'),
        'api_key'   => env('EXCHANGE_RATE_API_KEY'),
        'timeout'   => (int) env('EXCHANGE_RATE_API_TIMEOUT', 8),
        'ttl_hours' => (int) env('EXCHANGE_RATE_TTL_HOURS', 24),
    ],

];

