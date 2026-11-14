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

];

