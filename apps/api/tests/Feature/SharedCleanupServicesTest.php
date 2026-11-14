<?php

namespace Tests\Feature;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Liquidations\Models\PenaltyRecord;
use App\Modules\Reimbursements\Http\Middleware\AuthenticateAiServiceApi;
use App\Modules\Reimbursements\Http\Middleware\AuthenticatePrsReimbursementApi;
use App\Modules\Shared\Services\CashAdvanceEnrichmentService;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class SharedCleanupServicesTest extends TestCase
{
    use RefreshDatabase;

    public function test_cash_advance_enrichment_service_enriches_basic_and_extra_roadmap_fields(): void
    {
        $employee = User::create([
            'email' => 'enrich-emp@serms.com',
            'name' => 'Enrich Employee',
            'role' => 'employee',
            'department' => 'Operations',
        ]);

        $advance = CashAdvance::create([
            'user_id' => $employee->id,
            'purpose' => 'Field travel',
            'amount' => 1000,
            'outstanding_balance' => 1000,
            'expected_disbursement_date' => Carbon::now()->subDays(10)->toDateString(),
            'expected_liquidation_date' => Carbon::now()->subDays(3)->toDateString(),
            'status' => 'signed',
            'acknowledged_at' => Carbon::now()->subDays(9),
        ]);

        PenaltyRecord::create([
            'cash_advance_id' => $advance->id,
            'days_overdue' => 2,
            'penalty_amount' => 150,
            'applied_at' => Carbon::now()->subDay(),
        ]);

        Liquidation::create([
            'cash_advance_id' => $advance->id,
            'user_id' => $employee->id,
            'reimbursement_ids' => [],
            'total_expense_amount' => 1250,
            'outstanding_balance' => 1000,
            'variance' => -250,
            'status' => 'pending',
        ]);

        $advance->load(['penalties', 'liquidations', 'statusHistory', 'approvalActions']);

        $service = app(CashAdvanceEnrichmentService::class);

        $basic = $service->enrich(clone $advance, false);
        $this->assertSame(150.0, $basic->getAttribute('penalties_total'));
        $this->assertSame(150.0, $basic->getAttribute('penalties_sum'));
        $this->assertSame(-3, $basic->getAttribute('days_overdue'));
        $this->assertNotNull($basic->getAttribute('linked_liquidation'));
        $this->assertSame(1000.0, $basic->getAttribute('balance'));
        $this->assertNull($basic->getAttribute('overpayment_amount'));

        $full = $service->enrich(clone $advance, true);
        $this->assertSame(250.0, $full->getAttribute('overpayment_amount'));
        $this->assertSame(250.0, $full->getAttribute('overpaymentAmount'));
        $this->assertNotNull($full->getAttribute('approval_actions'));
        $this->assertNotNull($full->getAttribute('approvalActions'));
    }

    public function test_bearer_token_middlewares_validate_configured_keys(): void
    {
        config(['services.ai_service.api_key' => 'ai-secret']);
        config(['services.prs.reimbursement_api_key' => 'prs-secret']);

        $aiMiddleware = new AuthenticateAiServiceApi();
        $prsMiddleware = new AuthenticatePrsReimbursementApi();
        $okNext = fn () => response()->json(['ok' => true], 200);

        $badRequest = Request::create('/test', 'POST');
        $badRequest->headers->set('Authorization', 'Bearer wrong');
        $this->assertSame(Response::HTTP_UNAUTHORIZED, $aiMiddleware->handle($badRequest, $okNext)->getStatusCode());
        $this->assertSame(Response::HTTP_UNAUTHORIZED, $prsMiddleware->handle($badRequest, $okNext)->getStatusCode());

        $validAiRequest = Request::create('/test', 'POST');
        $validAiRequest->headers->set('Authorization', 'Bearer ai-secret');
        $this->assertSame(Response::HTTP_OK, $aiMiddleware->handle($validAiRequest, $okNext)->getStatusCode());

        $validPrsRequest = Request::create('/test', 'POST');
        $validPrsRequest->headers->set('Authorization', 'Bearer prs-secret');
        $this->assertSame(Response::HTTP_OK, $prsMiddleware->handle($validPrsRequest, $okNext)->getStatusCode());
    }
}
