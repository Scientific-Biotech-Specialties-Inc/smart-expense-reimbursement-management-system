<?php

namespace Tests\Feature;

use Tests\TestCase;

class SecurityHardeningTest extends TestCase
{
    public function test_api_responses_include_security_headers_and_omit_x_powered_by(): void
    {
        $response = $this->getJson('/api/crypto/key');

        $response->assertStatus(200);
        $response->assertHeaderMissing('X-Powered-By');
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    }

    public function test_cors_blocks_untrusted_origins_and_never_uses_wildcard(): void
    {
        $allowedOrigins = config('cors.allowed_origins');
        $this->assertIsArray($allowedOrigins);
        $this->assertNotContains('*', $allowedOrigins);

        $blocked = $this->withHeaders([
            'Origin' => 'https://evil.example',
        ])->getJson('/api/crypto/key');

        $blocked->assertStatus(200);
        $this->assertNull($blocked->headers->get('Access-Control-Allow-Origin'));

        $preflightBlocked = $this->withHeaders([
            'Origin' => 'https://evil.example',
            'Access-Control-Request-Method' => 'GET',
        ])->options('/api/crypto/key');

        $this->assertNotSame('*', $preflightBlocked->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('https://evil.example', $preflightBlocked->headers->get('Access-Control-Allow-Origin'));
    }

    public function test_cors_allows_configured_serms_origin(): void
    {
        $response = $this->withHeaders([
            'Origin' => 'http://localhost:5173',
        ])->getJson('/api/crypto/key');

        $response->assertStatus(200);
        $response->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        $response->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    public function test_dockerfile_and_cors_config_enforce_hardening(): void
    {
        $dockerfile = file_get_contents(base_path('Dockerfile'));
        $this->assertStringContainsString('expose_php = Off', $dockerfile);

        $corsConfig = file_get_contents(base_path('config/cors.php'));
        $this->assertStringNotContainsString("'allowed_origins' => ['*']", $corsConfig);
        $this->assertStringContainsString("'supports_credentials' => true", $corsConfig);
    }
}
