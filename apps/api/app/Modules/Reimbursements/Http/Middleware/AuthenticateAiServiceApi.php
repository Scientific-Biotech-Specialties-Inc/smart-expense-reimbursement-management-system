<?php

namespace App\Modules\Reimbursements\Http\Middleware;

use App\Modules\Shared\Http\Middleware\BaseBearerTokenMiddleware;

/**
 * Validates that an incoming request from the AI service carries the correct bearer token.
 * Uses the same shared-secret pattern as AuthenticatePrsReimbursementApi.
 */
class AuthenticateAiServiceApi extends BaseBearerTokenMiddleware
{
    protected function configKey(): string
    {
        return 'services.ai_service.api_key';
    }

    protected function envKey(): string
    {
        return 'AI_SERVICE_API_KEY';
    }
}
