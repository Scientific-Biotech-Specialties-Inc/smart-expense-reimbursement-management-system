<?php

namespace App\Modules\Shared\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CmsClientService
{
    private function client(?int $timeout = null): PendingRequest
    {
        $secret = (string) (config('services.cms.internal_secret') ?: '');
        $effectiveTimeout = $timeout ?? (int) config('services.cms.timeout', 5);

        return Http::timeout($effectiveTimeout)
            ->acceptJson()
            ->asJson()
            ->withHeaders([
                'X-Internal-Secret' => $secret,
            ]);
    }

    private function contractBaseUrl(): string
    {
        return rtrim((string) config('services.cms.contract_url', ''), '/');
    }

    private function vendorBaseUrl(): string
    {
        return rtrim((string) config('services.cms.vendor_url', ''), '/');
    }

    /**
     * Fetch active contracts from CMS (Workflow 1.1).
     *
     * @return array{available: bool, data: array<int, array<string, mixed>>, error?: string}
     */
    public function getActiveContracts(?string $search = null, int $limit = 100): array
    {
        $baseUrl = $this->contractBaseUrl();
        if ($baseUrl === '') {
            return ['available' => false, 'data' => [], 'error' => 'CMS_CONTRACT_URL is not configured.'];
        }

        $query = ['limit' => max(1, min($limit, 200))];
        if ($search !== null && trim($search) !== '') {
            $query['search'] = trim($search);
        }

        try {
            $response = $this->client()->get("{$baseUrl}/active", $query);

            if ($response->failed()) {
                Log::warning('CmsClientService: getActiveContracts failed.', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);

                return [
                    'available' => false,
                    'data'      => [],
                    'error'     => "CMS returned HTTP {$response->status()}.",
                ];
            }

            $json = $response->json();

            return [
                'available' => true,
                'data'      => is_array($json['data'] ?? null) ? $json['data'] : [],
            ];
        } catch (\Throwable $e) {
            Log::warning('CmsClientService: getActiveContracts connection error.', [
                'error' => $e->getMessage(),
            ]);

            return [
                'available' => false,
                'data'      => [],
                'error'     => $e->getMessage(),
            ];
        }
    }

    /**
     * Look up vendor master data & accreditation status in CMS (Workflow 1.2).
     *
     * @return array{available: bool, data: ?array<string, mixed>, error?: string}
     */
    public function lookupVendor(?string $tin, ?string $name): array
    {
        $baseUrl = $this->vendorBaseUrl();
        $cleanTin = trim((string) $tin);
        $cleanName = trim((string) $name);

        if ($baseUrl === '' || ($cleanTin === '' && $cleanName === '')) {
            return ['available' => false, 'data' => null, 'error' => 'Missing CMS vendor URL or lookup criteria.'];
        }

        $query = array_filter([
            'tin'  => $cleanTin !== '' ? $cleanTin : null,
            'name' => $cleanName !== '' ? $cleanName : null,
        ], fn ($v) => $v !== null);

        try {
            $response = $this->client()->get("{$baseUrl}/internal/vendors/lookup", $query);

            if ($response->failed()) {
                Log::warning('CmsClientService: lookupVendor failed.', [
                    'status' => $response->status(),
                    'tin'    => $cleanTin,
                    'name'   => $cleanName,
                ]);

                return [
                    'available' => false,
                    'data'      => null,
                    'error'     => "CMS returned HTTP {$response->status()}.",
                ];
            }

            $json = $response->json();

            return [
                'available' => true,
                'data'      => is_array($json['data'] ?? null) ? $json['data'] : null,
            ];
        } catch (\Throwable $e) {
            Log::warning('CmsClientService: lookupVendor connection error.', [
                'error' => $e->getMessage(),
                'tin'   => $cleanTin,
                'name'  => $cleanName,
            ]);

            return [
                'available' => false,
                'data'      => null,
                'error'     => $e->getMessage(),
            ];
        }
    }

    /**
     * Suggest an unlisted vendor for onboarding in CMS (Workflow 1.2).
     *
     * @return array{status: int, data: mixed, message: string}
     */
    public function suggestVendor(array $payload): array
    {
        $baseUrl = $this->vendorBaseUrl();
        if ($baseUrl === '') {
            throw new \RuntimeException('CMS_VENDOR_URL is not configured.');
        }

        try {
            $response = $this->client(10)->post("{$baseUrl}/internal/vendors/suggest", $payload);
            $json = $response->json() ?? [];
            $status = $response->status();

            if (!in_array($status, [200, 201, 409], true) && $response->failed()) {
                Log::error('CmsClientService: suggestVendor failed.', [
                    'status' => $status,
                    'body'   => $response->body(),
                ]);
                throw new \RuntimeException($json['message'] ?? "CMS vendor suggest failed with HTTP {$status}.");
            }

            return [
                'status'  => $status,
                'data'    => $json['data'] ?? $json,
                'message' => (string) ($json['message'] ?? ($status === 409
                    ? 'TIN already exists in CMS suppliers.'
                    : ($status === 200 ? 'Vendor suggestion already pending in CMS.' : 'Vendor suggestion queued in CMS.'))),
            ];
        } catch (\RuntimeException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('CmsClientService: suggestVendor connection error.', [
                'error' => $e->getMessage(),
            ]);
            throw new \RuntimeException('Unable to reach CMS vendor service: ' . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Forward recurring expense summary to CMS as a Contract Request (Workflow 1.3).
     *
     * @return array{status: int, data: array<string, mixed>, message: string}
     */
    public function forwardContractRequest(array $payload): array
    {
        $baseUrl = $this->contractBaseUrl();
        if ($baseUrl === '') {
            throw new \RuntimeException('CMS_CONTRACT_URL is not configured.');
        }

        try {
            $response = $this->client(10)->post("{$baseUrl}/internal/contract-requests/from-serms", $payload);
            $json = $response->json() ?? [];
            $status = $response->status();

            if ($response->failed()) {
                Log::error('CmsClientService: forwardContractRequest failed.', [
                    'status' => $status,
                    'body'   => $response->body(),
                ]);
                throw new \RuntimeException($json['message'] ?? "CMS contract request failed with HTTP {$status}.");
            }

            $data = is_array($json['data'] ?? null) ? $json['data'] : $json;

            return [
                'status'  => $status,
                'data'    => $data,
                'message' => (string) ($json['message'] ?? 'Contract request forwarded to CMS.'),
            ];
        } catch (\RuntimeException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('CmsClientService: forwardContractRequest connection error.', [
                'error' => $e->getMessage(),
            ]);
            throw new \RuntimeException('Unable to reach CMS contract service: ' . $e->getMessage(), 0, $e);
        }
    }
}
