<?php

namespace App\Modules\Shared\Services;

use App\Modules\Reimbursements\Models\Receipt;
use App\Modules\Shared\Models\CurrencyRate;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class CurrencyConversionService
{
    /**
     * Baseline PHP-equivalent FX rates (1 unit of foreign currency = X PHP)
     * seeded into currency_rates by migration for offline/test resilience.
     *
     * @var array<string, float>
     */
    public const BASELINE_RATES = [
        'PHP' => 1.000000,
        'USD' => 58.500000,
        'SGD' => 43.200000,
        'MYR' => 13.100000,
        'BND' => 43.200000,
        'JPY' => 0.380000,
        'HKD' => 7.500000,
        'THB' => 1.680000,
        'AUD' => 38.100000,
        'GBP' => 73.800000,
        'EUR' => 61.900000,
        'CAD' => 41.800000,
        'CHF' => 66.100000,
        'CNY' => 8.100000,
        'KRW' => 0.042000,
        'TWD' => 1.810000,
        'INR' => 0.690000,
        'AED' => 15.930000,
        'NZD' => 34.400000,
    ];

    /**
     * Fetch live exchange rates from the configured provider and upsert them into currency_rates.
     *
     * @return array{synced_count: int, effective_date: string, source: string, rates: array<string, float>}
     *
     * @throws \Throwable When the HTTP request fails or the provider payload is invalid.
     */
    public function syncRatesFromProvider(): array
    {
        $url = trim((string) config('services.exchange_rate.url', 'https://open.er-api.com/v6/latest/PHP'));
        $apiKey = trim((string) config('services.exchange_rate.api_key', ''));
        $timeout = max(1, (int) config('services.exchange_rate.timeout', 8));

        if ($url === '') {
            $exception = new \RuntimeException('Exchange rate API URL is not configured.');
            Log::error('CurrencyConversionService: syncRatesFromProvider missing URL.', [
                'error' => $exception->getMessage(),
            ]);
            throw $exception;
        }

        if ($apiKey !== '' && (str_contains($url, '{api_key}') || str_contains($url, '{key}'))) {
            $url = str_replace(['{api_key}', '{key}'], urlencode($apiKey), $url);
        }

        try {
            $request = Http::timeout($timeout)->acceptJson();
            if ($apiKey !== '' && !str_contains($url, urlencode($apiKey))) {
                $request = $request->withToken($apiKey);
            }

            $response = $request->get($url);

            if ($response->failed()) {
                throw new \RuntimeException("Exchange rate provider returned HTTP {$response->status()}.");
            }

            $payload = $response->json();
            if (!is_array($payload) || ($payload['result'] ?? null) === 'error') {
                throw new \RuntimeException('Exchange rate provider returned an invalid or error payload.');
            }

            $rawRates = $payload['rates'] ?? $payload['conversion_rates'] ?? null;
            if (!is_array($rawRates) || empty($rawRates)) {
                throw new \RuntimeException('Exchange rate provider response is missing a valid rates map.');
            }

            $baseCode = strtoupper(trim((string) ($payload['base_code'] ?? 'PHP')));
            $phpMultiplier = 1.0;
            if ($baseCode !== '' && $baseCode !== 'PHP') {
                $phpRateInBase = $rawRates['PHP'] ?? null;
                if (!is_numeric($phpRateInBase) || (float) $phpRateInBase <= 0) {
                    throw new \RuntimeException("Exchange rate provider base '{$baseCode}' response is missing a positive PHP rate.");
                }
                $phpMultiplier = (float) $phpRateInBase;
            }

            $now = now();
            $today = $now->toDateString();
            $timestamp = $now->toDateTimeString();
            $source = 'open.er-api.com';

            $rateMap = [];
            $upsertRows = [];

            foreach ($rawRates as $rawCode => $foreignPerBase) {
                $code = strtoupper(trim((string) $rawCode));
                if (!preg_match('/^[A-Z]{3}$/', $code)) {
                    continue;
                }
                if (!is_numeric($foreignPerBase) || (float) $foreignPerBase <= 0) {
                    continue;
                }

                $rateToPhp = $code === 'PHP'
                    ? 1.000000
                    : round($phpMultiplier / (float) $foreignPerBase, 6);

                if ($rateToPhp <= 0) {
                    continue;
                }

                $rateMap[$code] = $rateToPhp;
                $upsertRows[$code] = [
                    'currency_code'  => $code,
                    'rate_to_php'    => $rateToPhp,
                    'effective_date' => $today,
                    'source'         => $source,
                    'fetched_at'     => $timestamp,
                    'created_at'     => $timestamp,
                    'updated_at'     => $timestamp,
                ];
            }

            if (empty($rateMap)) {
                throw new \RuntimeException('Exchange rate provider returned zero valid positive currency rates.');
            }

            // Always guarantee PHP=1.000000 is present alongside parsed provider rates.
            $rateMap['PHP'] = 1.000000;
            $upsertRows['PHP'] = [
                'currency_code'  => 'PHP',
                'rate_to_php'    => 1.000000,
                'effective_date' => $today,
                'source'         => $source,
                'fetched_at'     => $timestamp,
                'created_at'     => $timestamp,
                'updated_at'     => $timestamp,
            ];

            CurrencyRate::upsert(
                array_values($upsertRows),
                ['currency_code'],
                ['rate_to_php', 'effective_date', 'source', 'fetched_at', 'updated_at']
            );

            return [
                'synced_count'   => count($upsertRows),
                'effective_date' => $today,
                'source'         => $source,
                'rates'          => $rateMap,
            ];
        } catch (\Throwable $e) {
            Log::error('CurrencyConversionService: failed to sync rates from provider.', [
                'url'   => $url,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    /**
     * Resolve the rate to convert 1 unit of the given currency into PHP.
     * Refreshes from the provider on demand when missing or older than configured TTL,
     * falling back gracefully to the latest cached rate if the external API is unreachable.
     *
     * @return array{currency: string, rate_to_php: float, effective_date: string, source: string}
     *
     * @throws ValidationException When the currency code is malformed or unknown after refresh.
     */
    public function resolveRateToPhp(?string $currencyCode): array
    {
        $code = strtoupper(trim((string) ($currencyCode ?? '')));
        if ($code === '') {
            $code = 'PHP';
        }

        if ($code === 'PHP') {
            return [
                'currency'       => 'PHP',
                'rate_to_php'    => 1.0,
                'effective_date' => now()->toDateString(),
                'source'         => 'system',
            ];
        }

        if (!preg_match('/^[A-Z]{3}$/', $code)) {
            throw ValidationException::withMessages([
                'currency' => ["Unsupported or unrecognized currency code: {$code}."],
            ]);
        }

        $cached = CurrencyRate::where('currency_code', $code)->first();
        $ttlHours = max(0, (int) config('services.exchange_rate.ttl_hours', 24));
        $isStale = $cached === null
            || $cached->fetched_at === null
            || $cached->fetched_at->lt(now()->subHours($ttlHours));

        if ($isStale) {
            try {
                $this->syncRatesFromProvider();
                $cached = CurrencyRate::where('currency_code', $code)->first();
            } catch (\Throwable $e) {
                Log::warning('CurrencyConversionService: on-demand FX refresh failed; using cached fallback if available.', [
                    'currency_code' => $code,
                    'has_cached'    => $cached !== null,
                    'error'         => $e->getMessage(),
                ]);
            }
        }

        if ($cached === null || (float) $cached->rate_to_php <= 0) {
            throw ValidationException::withMessages([
                'currency' => ["Unsupported or unrecognized currency code: {$code}."],
            ]);
        }

        return [
            'currency'       => $code,
            'rate_to_php'    => (float) $cached->rate_to_php,
            'effective_date' => $cached->effective_date?->format('Y-m-d') ?? now()->toDateString(),
            'source'         => $cached->source ?? 'open.er-api.com',
        ];
    }

    /**
     * Convert a monetary amount in the given currency into its PHP snapshot payload.
     *
     * @return array{
     *     currency: string,
     *     exchange_rate: float,
     *     converted_php_amount: ?float,
     *     exchange_rate_date: string,
     *     exchange_rate_source: string
     * }
     */
    public function convertAmountToPhp(mixed $amount, ?string $currencyCode = null): array
    {
        $resolved = $this->resolveRateToPhp($currencyCode);
        $hasAmount = $amount !== null && $amount !== '';

        return [
            'currency'             => $resolved['currency'],
            'exchange_rate'        => (float) $resolved['rate_to_php'],
            'converted_php_amount' => $hasAmount
                ? round(((float) $amount) * (float) $resolved['rate_to_php'], 2)
                : null,
            'exchange_rate_date'   => $resolved['effective_date'],
            'exchange_rate_source' => $resolved['source'],
        ];
    }

    /**
     * Merge system-locked FX snapshot fields into a receipt create/update payload.
     */
    public function enrichReceiptPayload(array $payload, ?Receipt $existingReceipt = null): array
    {
        $rawCurrency = $payload['currency'] ?? null;
        $currency = (is_string($rawCurrency) && trim($rawCurrency) !== '')
            ? $rawCurrency
            : ($existingReceipt?->currency ?? 'PHP');

        $amount = array_key_exists('total_amount', $payload)
            ? $payload['total_amount']
            : (array_key_exists('amount', $payload)
                ? $payload['amount']
                : $existingReceipt?->total_amount);

        return array_merge($payload, $this->convertAmountToPhp($amount, $currency));
    }

    /**
     * Compute the authoritative PHP total from a set of receipt IDs, optionally
     * backfilling missing FX snapshots on receipts before summing.
     *
     * @param  array<int, int|string>  $receiptIds
     */
    public function resolveAuthoritativePhpTotal(
        array $receiptIds,
        ?float $fallbackAmount = null,
        bool $backfillMissing = false
    ): ?float {
        $ids = array_values(array_unique(array_filter(
            $receiptIds,
            fn ($id) => $id !== null && $id !== ''
        )));

        if (empty($ids)) {
            return $fallbackAmount;
        }

        $receipts = Receipt::whereIn('id', $ids)->get();
        if ($receipts->isEmpty()) {
            return $fallbackAmount;
        }

        if ($backfillMissing) {
            foreach ($receipts as $receipt) {
                if ($receipt->converted_php_amount === null) {
                    $receipt->update($this->enrichReceiptPayload([], $receipt));
                }
            }
        }

        $convertedPhpSum = round(
            (float) $receipts->sum(fn (Receipt $receipt) => $receipt->getEffectivePhpAmount()),
            2
        );

        $hasForeignCurrency = $receipts->contains(function (Receipt $receipt) {
            $currency = trim((string) ($receipt->currency ?? ''));

            return ($currency !== '' ? strtoupper($currency) : 'PHP') !== 'PHP';
        });

        if ($hasForeignCurrency || $convertedPhpSum > 0) {
            return $convertedPhpSum;
        }

        return $fallbackAmount;
    }
}
