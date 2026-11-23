<?php

namespace App\Modules\Reimbursements\Http\Middleware;

use App\Modules\Shared\Http\Middleware\BaseBearerTokenMiddleware;

class AuthenticatePrsReimbursementApi extends BaseBearerTokenMiddleware
{
    protected function configKey(): string
    {
        return 'services.prs.reimbursement_api_key';
    }

    protected function envKey(): string
    {
        return 'PRS_REIMBURSEMENT_API_KEY';
    }
}
