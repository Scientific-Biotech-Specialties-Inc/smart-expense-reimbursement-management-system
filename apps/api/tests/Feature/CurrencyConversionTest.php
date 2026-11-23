<?php

namespace Tests\Feature;

use App\Modules\CashAdvances\Models\CashAdvance;
use App\Modules\Liquidations\Models\Liquidation;
use App\Modules\Reimbursements\Models\ExpenseCategory;
use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Reimbursements\Models\Reimbursement;
use App\Modules\Shared\Models\CurrencyRate;
use App\Modules\Shared\Services\CurrencyConversionService;
use App\Modules\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CurrencyConversionTest extends TestCase
{
    use RefreshDatabase;

    private User $employee;
    private ExpenseCategory $category;
    private string $aiApiKey = 'test-ai-service-key';

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('supabase');
        Queue::fake();

        config([
            'services.ai_service.api_key' => $this->aiApiKey,
            'services.exchange_rate.url' => 'https://open.er-api.com/v6/latest/PHP',
            'services.exchange_rate.ttl_hours' => 24,
        ]);

        $this->employee = User::create([
            'name' => 'John Doe',
            'email' => 'john.fx@example.com',
            'role' => 'employee',
            'grade' => 'L2',
            'department' => 'Sales',
        ]);

        $this->category = ExpenseCategory::firstOrCreate(['name' => 'Meals']);
    }

    private function authHeaders(?User $user = null): array
    {
        $actor = $user ?? $this->employee;

        return [
            'Authorization' => 'Bearer ' . $this->generateMockToken([
                'email' => $actor->email,
                'role' => $actor->role,
                'department' => $actor->department,
                'first_name' => 'John',
                'last_name' => 'Doe',
            ]),
            'Accept' => 'application/json',
        ];
    }

    public function test_currencies_sync_command_inverts_open_er_api_rates_and_upserts_currency_rates(): void
    {
        Http::fake([
            'https://open.er-api.com/v6/latest/PHP' => Http::response([
                'result' => 'success',
                'base_code' => 'PHP',
                'rates' => [
                    'PHP' => 1,
                    'USD' => 0.02,   // 1 / 0.02 = 50.000000 PHP
                    'EUR' => 0.016,  // 1 / 0.016 = 62.500000 PHP
                    'JPY' => 2.5,    // 1 / 2.5 = 0.400000 PHP
                ],
            ], 200),
        ]);

        $this->artisan('currencies:sync')->assertExitCode(0);

        $this->assertDatabaseHas('currency_rates', [
            'currency_code' => 'PHP',
            'rate_to_php' => '1.000000',
            'source' => 'open.er-api.com',
        ]);
        $this->assertDatabaseHas('currency_rates', [
            'currency_code' => 'USD',
            'rate_to_php' => '50.000000',
            'source' => 'open.er-api.com',
        ]);
        $this->assertDatabaseHas('currency_rates', [
            'currency_code' => 'EUR',
            'rate_to_php' => '62.500000',
            'source' => 'open.er-api.com',
        ]);
        $this->assertDatabaseHas('currency_rates', [
            'currency_code' => 'JPY',
            'rate_to_php' => '0.400000',
            'source' => 'open.er-api.com',
        ]);
    }

    public function test_currencies_sync_command_returns_non_zero_exit_code_when_provider_fails(): void
    {
        Http::fake([
            'https://open.er-api.com/v6/latest/PHP' => Http::response(['error' => 'upstream down'], 500),
        ]);

        $this->artisan('currencies:sync')->assertExitCode(1);
    }

    public function test_on_demand_refresh_triggers_when_stale_and_falls_back_gracefully_on_500(): void
    {
        // 1. Stale rate (>24h old) refreshes from live API when reachable
        CurrencyRate::where('currency_code', 'USD')->update([
            'rate_to_php' => 58.500000,
            'fetched_at' => now()->subHours(25),
            'source' => 'baseline-seed',
        ]);

        Http::fake([
            'https://open.er-api.com/v6/latest/PHP' => Http::response([
                'result' => 'success',
                'base_code' => 'PHP',
                'rates' => [
                    'PHP' => 1,
                    'USD' => 0.02, // 50.00 PHP
                ],
            ], 200),
        ]);

        $resolvedUsd = app(CurrencyConversionService::class)->resolveRateToPhp('USD');
        $this->assertEquals(50.0, $resolvedUsd['rate_to_php']);
        $this->assertEquals('open.er-api.com', $resolvedUsd['source']);

        // 2. Stale rate (>24h old) gracefully falls back to cached rate when provider returns 500
        CurrencyRate::where('currency_code', 'EUR')->update([
            'rate_to_php' => 61.900000,
            'fetched_at' => now()->subHours(26),
            'source' => 'baseline-seed',
        ]);

        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake([
            'https://open.er-api.com/v6/latest/PHP' => Http::response(['error' => 'service unavailable'], 500),
        ]);

        $resolvedEur = app(CurrencyConversionService::class)->resolveRateToPhp('EUR');
        $this->assertEquals(61.9, $resolvedEur['rate_to_php']);
        $this->assertEquals('baseline-seed', $resolvedEur['source']);
    }

    public function test_get_currency_rates_endpoint_returns_rates_and_rejects_unknown_currency(): void
    {
        $unauth = $this->getJson('/api/currencies/rates');
        $unauth->assertStatus(401);

        $response = $this->withHeaders($this->authHeaders())
            ->getJson('/api/currencies/rates');

        $response->assertStatus(200)
            ->assertJsonPath('base', 'PHP');

        $rates = collect($response->json('rates'));
        $usd = $rates->firstWhere('currency_code', 'USD');
        $this->assertNotNull($usd);
        $this->assertEquals('58.500000', $usd['rate_to_php']);

        Http::fake([
            'https://open.er-api.com/v6/latest/PHP' => Http::response([
                'result' => 'success',
                'base_code' => 'PHP',
                'rates' => ['PHP' => 1, 'USD' => 0.017094],
            ], 200),
        ]);

        $unknown = $this->withHeaders($this->authHeaders())
            ->getJson('/api/currencies/rates?currency=ZZZ');

        $unknown->assertStatus(422)
            ->assertJsonValidationErrors(['currency']);
    }

    public function test_unknown_three_letter_currency_code_returns_422_on_receipt_and_liquidation_endpoints(): void
    {
        Http::fake([
            'https://open.er-api.com/v6/latest/PHP' => Http::response([
                'result' => 'success',
                'base_code' => 'PHP',
                'rates' => ['PHP' => 1, 'USD' => 0.017094],
            ], 200),
        ]);

        $uploadRes = $this->withHeaders($this->authHeaders())
            ->post('/api/reimbursements/receipts', [
                'file' => UploadedFile::fake()->image('bad_fx.png'),
                'vendor_name' => 'Unknown FX Shop',
                'total_amount' => 100.00,
                'currency' => 'ZZZ',
            ]);

        $uploadRes->assertStatus(422)
            ->assertJsonValidationErrors(['currency']);

        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/valid_php.png'],
            'file_hash' => [hash('sha256', 'valid_php_for_zzz')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Valid Shop',
            'total_amount' => 500.00,
            'currency' => 'PHP',
            'status' => 'processed',
        ]);

        $updateRes = $this->withHeaders($this->authHeaders())
            ->patchJson("/api/reimbursements/receipts/{$receipt->id}", [
                'currency' => 'ZZZ',
            ]);

        $updateRes->assertStatus(422)
            ->assertJsonValidationErrors(['currency']);

        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'FX Validation Test',
            'amount' => 500.00,
            'outstanding_balance' => 500.00,
            'status' => 'signed',
            'acknowledged_at' => Carbon::now()->subDay(),
            'expected_disbursement_date' => Carbon::now()->addDays(2),
            'expected_liquidation_date' => Carbon::now()->addDays(7),
        ]);

        $liqRes = $this->withHeaders($this->authHeaders())
            ->postJson('/api/liquidations', [
                'cash_advance_id' => $advance->id,
                'receipts' => [
                    [
                        'id' => $receipt->id,
                        'vendor_name' => 'Valid Shop',
                        'transaction_date' => '2026-11-22',
                        'total_amount' => 500.00,
                        'currency' => 'ZZZ',
                    ],
                ],
                'total_expense_amount' => 500.00,
            ]);

        $liqRes->assertStatus(422)
            ->assertJsonValidationErrors(['currency']);
    }

    public function test_receipt_store_update_and_resubmit_enforce_system_locked_fx_snapshots(): void
    {
        $storeRes = $this->withHeaders($this->authHeaders())
            ->post('/api/reimbursements/receipts', [
                'file' => UploadedFile::fake()->image('usd_rcpt.png'),
                'vendor_name' => 'Seattle Coffee',
                'transaction_date' => '2026-11-22',
                'total_amount' => 50.00,
                'currency' => 'USD',
                // Attempted client spoofing of locked fields must be ignored:
                'exchange_rate' => 999.00,
                'converted_php_amount' => 99999.00,
            ]);

        $storeRes->assertStatus(201);
        $receiptId = $storeRes->json('data.id');

        $this->assertDatabaseHas('receipts', [
            'id' => $receiptId,
            'currency' => 'USD',
            'total_amount' => '50.00',
            'exchange_rate' => '58.500000',
            'converted_php_amount' => '2925.00',
            'exchange_rate_source' => 'baseline-seed',
        ]);

        // Simulate rate moving in DB; metadata-only update must NOT alter locked snapshot
        CurrencyRate::where('currency_code', 'USD')->update(['rate_to_php' => 60.000000]);

        $metaUpdate = $this->withHeaders($this->authHeaders())
            ->patchJson("/api/reimbursements/receipts/{$receiptId}", [
                'vendor_name' => 'Seattle Coffee Co.',
            ]);

        $metaUpdate->assertStatus(200);
        $this->assertDatabaseHas('receipts', [
            'id' => $receiptId,
            'vendor_name' => 'Seattle Coffee Co.',
            'exchange_rate' => '58.500000',
            'converted_php_amount' => '2925.00',
        ]);

        // Changing total_amount recalculates FX snapshot
        $amountUpdate = $this->withHeaders($this->authHeaders())
            ->patchJson("/api/reimbursements/receipts/{$receiptId}", [
                'total_amount' => 100.00,
            ]);

        $amountUpdate->assertStatus(200);
        $this->assertDatabaseHas('receipts', [
            'id' => $receiptId,
            'total_amount' => '100.00',
            'exchange_rate' => '60.000000',
            'converted_php_amount' => '6000.00',
        ]);

        // Resubmit with SGD updates FX snapshot to SGD @ 43.20
        $resubmit = $this->withHeaders($this->authHeaders())
            ->postJson("/api/reimbursements/receipts/{$receiptId}/resubmit", [
                'currency' => 'SGD',
                'total_amount' => 10.00,
            ]);

        $resubmit->assertStatus(200);
        $this->assertDatabaseHas('receipts', [
            'id' => $receiptId,
            'currency' => 'SGD',
            'total_amount' => '10.00',
            'exchange_rate' => '43.200000',
            'converted_php_amount' => '432.00',
            'status' => 'processed',
        ]);

        // Legacy receipt with null converted_php_amount is backfilled on metadata-only update
        $legacyReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/legacy_null_fx.png'],
            'file_hash' => [hash('sha256', 'legacy_null_fx')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Legacy Foreign Vendor',
            'total_amount' => 10.00,
            'currency' => 'EUR',
            'converted_php_amount' => null,
            'status' => 'processed',
        ]);

        $backfillRes = $this->withHeaders($this->authHeaders())
            ->patchJson("/api/reimbursements/receipts/{$legacyReceipt->id}", [
                'vendor_name' => 'Legacy Foreign Vendor Edited',
            ]);

        $backfillRes->assertStatus(200);
        $this->assertDatabaseHas('receipts', [
            'id' => $legacyReceipt->id,
            'vendor_name' => 'Legacy Foreign Vendor Edited',
            'currency' => 'EUR',
            'exchange_rate' => '61.900000',
            'converted_php_amount' => '619.00',
        ]);
    }

    public function test_ocr_callback_enriches_fx_snapshot_and_formats_foreign_currency_notification(): void
    {
        $receipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/ocr_usd.png'],
            'file_hash' => [hash('sha256', 'ocr_usd')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'status' => 'processing',
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->aiApiKey,
        ])->postJson("/api/reimbursements/receipts/{$receipt->id}/ocr-callback", [
            'receipt_id' => $receipt->id,
            'vendor_name' => 'Global Hotel',
            'transaction_date' => '2026-11-22',
            'total_amount' => 50.00,
            'currency' => 'USD',
            'ocr_confidence_score' => 0.94,
            'expense_category' => 'Lodging',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'processed');

        $showRes = $this->withHeaders($this->authHeaders())
            ->getJson("/api/reimbursements/receipts/{$receipt->id}");

        $showRes->assertStatus(200)
            ->assertJsonPath('data.currency', 'USD')
            ->assertJsonPath('data.exchange_rate', '58.500000')
            ->assertJsonPath('data.converted_php_amount', '2925.00');

        $this->assertDatabaseHas('receipts', [
            'id' => $receipt->id,
            'currency' => 'USD',
            'total_amount' => '50.00',
            'exchange_rate' => '58.500000',
            'converted_php_amount' => '2925.00',
            'exchange_rate_source' => 'baseline-seed',
        ]);

        $notif = \App\Modules\Notifications\Models\Notification::where('user_id', $this->employee->id)
            ->where('type', 'receipt_processed')
            ->where('record_id', $receipt->id)
            ->firstOrFail();

        $this->assertStringContainsString('USD 50.00', $notif->message);
        $this->assertStringContainsString('₱2,925.00', $notif->message);
    }

    public function test_mixed_currency_reimbursement_create_and_update_compute_authoritative_php_total(): void
    {
        $phpReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/mix_php.png'],
            'file_hash' => [hash('sha256', 'mix_php')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Local Bistro',
            'transaction_date' => '2026-11-22',
            'total_amount' => 1000.00,
            'currency' => 'PHP',
            'status' => 'processed',
        ]);

        $usdReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/mix_usd.png'],
            'file_hash' => [hash('sha256', 'mix_usd')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'US SaaS',
            'transaction_date' => '2026-11-22',
            'total_amount' => 50.00,
            'currency' => 'USD',
            'status' => 'processed',
        ]);

        // Client submits naive sum (1050.00); backend must store PHP 3,925.00 (1000 + 50 * 58.50)
        $createRes = $this->withHeaders($this->authHeaders())
            ->post('/api/reimbursements', [
                'description' => 'Mixed Currency Expenses',
                'expense_category_id' => $this->category->id,
                'event_type' => 'Client Meeting',
                'amount' => 1050.00,
                'date' => '2026-11-22',
                'receipt_ids' => [$phpReceipt->id, $usdReceipt->id],
                'receipts' => [
                    [
                        'id' => $phpReceipt->id,
                        'total_amount' => 1000.00,
                        'currency' => 'PHP',
                    ],
                    [
                        'id' => $usdReceipt->id,
                        'total_amount' => 50.00,
                        'currency' => 'USD',
                    ],
                ],
                'report_file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
            ]);

        $createRes->assertStatus(201)
            ->assertJsonPath('data.amount', '3925.00');

        $reimbursementId = $createRes->json('data.id');

        $this->assertDatabaseHas('reimbursements', [
            'id' => $reimbursementId,
            'amount' => '3925.00',
        ]);

        $this->assertDatabaseHas('receipts', [
            'id' => $usdReceipt->id,
            'currency' => 'USD',
            'total_amount' => '50.00',
            'exchange_rate' => '58.500000',
            'converted_php_amount' => '2925.00',
        ]);

        // Employee updates inline receipt WITHOUT passing receipt_ids, attempting stale amount=1050
        $updateRes = $this->withHeaders($this->authHeaders())
            ->patchJson("/api/reimbursements/{$reimbursementId}", [
                'amount' => 1050.00,
                'receipts' => [
                    [
                        'id' => $usdReceipt->id,
                        'currency' => 'EUR', // 61.90
                        'total_amount' => 100.00, // 6190.00 PHP
                    ],
                ],
            ]);

        $updateRes->assertStatus(200)
            ->assertJsonPath('data.amount', '7190.00');

        $this->assertDatabaseHas('reimbursements', [
            'id' => $reimbursementId,
            'amount' => '7190.00',
        ]);
        $this->assertDatabaseHas('receipts', [
            'id' => $usdReceipt->id,
            'currency' => 'EUR',
            'total_amount' => '100.00',
            'exchange_rate' => '61.900000',
            'converted_php_amount' => '6190.00',
        ]);
    }

    public function test_mixed_currency_liquidation_scan_store_and_update_convert_to_php(): void
    {
        // Check scan() includes FX fields
        $scanRes = $this->withHeaders($this->authHeaders())
            ->post('/api/liquidations/scan', [
                'files' => [UploadedFile::fake()->image('scan_liq.png')],
            ]);

        $scanRes->assertStatus(201)
            ->assertJsonStructure([
                'data' => ['id', 'exchange_rate', 'converted_php_amount', 'exchange_rate_date'],
            ]);

        $advance = CashAdvance::create([
            'user_id' => $this->employee->id,
            'purpose' => 'International Conference',
            'amount' => 3500.00,
            'outstanding_balance' => 3500.00,
            'status' => 'signed',
            'acknowledged_at' => Carbon::now()->subDay(),
            'expected_disbursement_date' => Carbon::now()->addDays(2),
            'expected_liquidation_date' => Carbon::now()->addDays(7),
        ]);

        $phpReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/liq_php.png'],
            'file_hash' => [hash('sha256', 'liq_php')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Manila Taxi',
            'transaction_date' => '2026-11-22',
            'total_amount' => 1000.00,
            'currency' => 'PHP',
            'status' => 'processed',
        ]);

        $usdReceipt = Receipt::create([
            'uploaded_by' => $this->employee->id,
            'file_path' => ['receipts/liq_usd.png'],
            'file_hash' => [hash('sha256', 'liq_usd')],
            'file_type' => ['png'],
            'file_size_bytes' => [1024],
            'vendor_name' => 'Hotel US',
            'transaction_date' => '2026-11-22',
            'total_amount' => 20.00,
            'currency' => 'USD',
            'status' => 'processed',
        ]);

        // 1. Converted sum (1000 + 20 * 58.5 = 2170.00) < 3500.00 must be blocked even if client inflates total_expense_amount
        $blockedRes = $this->withHeaders($this->authHeaders())
            ->postJson('/api/liquidations', [
                'cash_advance_id' => $advance->id,
                'receipts' => [
                    [
                        'id' => $phpReceipt->id,
                        'vendor_name' => 'Manila Taxi',
                        'transaction_date' => '2026-11-22',
                        'total_amount' => 1000.00,
                        'currency' => 'PHP',
                    ],
                    [
                        'id' => $usdReceipt->id,
                        'vendor_name' => 'Hotel US',
                        'transaction_date' => '2026-11-22',
                        'total_amount' => 20.00,
                        'currency' => 'USD',
                    ],
                ],
                'total_expense_amount' => 5000.00,
            ]);

        $blockedRes->assertStatus(422)
            ->assertJsonValidationErrors(['total_expense_amount']);
        $this->assertDatabaseCount('liquidations', 0);

        // 2. Converted sum (1000 + 50 * 58.5 = 3925.00) >= 3500.00 passes even if client sent naive sum (1050.00)
        $okRes = $this->withHeaders($this->authHeaders())
            ->postJson('/api/liquidations', [
                'cash_advance_id' => $advance->id,
                'receipts' => [
                    [
                        'id' => $phpReceipt->id,
                        'vendor_name' => 'Manila Taxi',
                        'transaction_date' => '2026-11-22',
                        'total_amount' => 1000.00,
                        'currency' => 'PHP',
                    ],
                    [
                        'id' => $usdReceipt->id,
                        'vendor_name' => 'Hotel US',
                        'transaction_date' => '2026-11-22',
                        'total_amount' => 50.00,
                        'currency' => 'USD',
                    ],
                ],
                'total_expense_amount' => 1050.00,
            ]);

        $okRes->assertStatus(210)
            ->assertJsonPath('data.total_expense_amount', '3925.00');

        $liquidationId = $okRes->json('data.id');

        $this->assertDatabaseHas('liquidations', [
            'id' => $liquidationId,
            'total_expense_amount' => '3925.00',
        ]);
        $this->assertDatabaseHas('receipts', [
            'id' => $usdReceipt->id,
            'currency' => 'USD',
            'total_amount' => '50.00',
            'exchange_rate' => '58.500000',
            'converted_php_amount' => '2925.00',
        ]);

        // 3. Employee update recomputes authoritative PHP total from updated receipts
        $updateLiq = $this->withHeaders($this->authHeaders())
            ->putJson("/api/liquidations/{$liquidationId}", [
                'receipts' => [
                    [
                        'id' => $phpReceipt->id,
                        'vendor_name' => 'Manila Taxi',
                        'transaction_date' => '2026-11-22',
                        'total_amount' => 1000.00,
                        'currency' => 'PHP',
                    ],
                    [
                        'id' => $usdReceipt->id,
                        'vendor_name' => 'Hotel US',
                        'transaction_date' => '2026-11-22',
                        'total_amount' => 60.00,
                        'currency' => 'USD',
                    ],
                ],
                'total_expense_amount' => 1060.00,
            ]);

        $updateLiq->assertStatus(200)
            ->assertJsonPath('data.total_expense_amount', '4510.00');

        $this->assertDatabaseHas('liquidations', [
            'id' => $liquidationId,
            'total_expense_amount' => '4510.00',
        ]);

        // 4. Updating total_expense_amount WITHOUT receipts must still resolve authoritative PHP total
        $tamperWithoutReceipts = $this->withHeaders($this->authHeaders())
            ->putJson("/api/liquidations/{$liquidationId}", [
                'total_expense_amount' => 9999.00,
            ]);

        $tamperWithoutReceipts->assertStatus(200)
            ->assertJsonPath('data.total_expense_amount', '4510.00');

        $this->assertDatabaseHas('liquidations', [
            'id' => $liquidationId,
            'total_expense_amount' => '4510.00',
        ]);

        // If outstanding balance rises above receipts' converted PHP total (4510.00), client cannot bypass via inflated total_expense_amount
        Liquidation::where('id', $liquidationId)->update(['outstanding_balance' => 5000.00]);
        $bypassAttempt = $this->withHeaders($this->authHeaders())
            ->putJson("/api/liquidations/{$liquidationId}", [
                'total_expense_amount' => 5500.00,
            ]);

        $bypassAttempt->assertStatus(422)
            ->assertJsonValidationErrors(['total_expense_amount']);
    }
}
