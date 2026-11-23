<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected static $mockPrivateKey;
    protected static $mockPublicKeyPath;
    protected static $mockCnfPath;

    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();
        
        self::$mockCnfPath = tempnam(sys_get_temp_dir(), 'openssl_cnf');
        file_put_contents(self::$mockCnfPath, "[ req ]\ndistinguished_name = req_distinguished_name\n[ req_distinguished_name ]\n");

        $res = openssl_pkey_new([
            "private_key_bits" => 2048,
            "private_key_type" => OPENSSL_KEYTYPE_RSA,
            "config" => self::$mockCnfPath,
        ]);
        openssl_pkey_export($res, self::$mockPrivateKey, null, [
            "config" => self::$mockCnfPath,
        ]);
        $details = openssl_pkey_get_details($res);
        
        self::$mockPublicKeyPath = tempnam(sys_get_temp_dir(), 'jwt_public_key');
        file_put_contents(self::$mockPublicKeyPath, $details["key"]);
    }

    public static function tearDownAfterClass(): void
    {
        if (file_exists(self::$mockPublicKeyPath)) {
            unlink(self::$mockPublicKeyPath);
        }
        if (file_exists(self::$mockCnfPath)) {
            unlink(self::$mockCnfPath);
        }
        parent::tearDownAfterClass();
    }

    public function createApplication()
    {
        putenv('DB_CONNECTION=sqlite');
        putenv('DB_DATABASE=:memory:');
        $_ENV['DB_CONNECTION'] = 'sqlite';
        $_ENV['DB_DATABASE'] = ':memory:';
        $_SERVER['DB_CONNECTION'] = 'sqlite';
        $_SERVER['DB_DATABASE'] = ':memory:';

        $app = parent::createApplication();

        $app['config']->set('database.default', 'sqlite');
        $app['config']->set('database.connections.sqlite.database', ':memory:');
        $app['config']->set('session.driver', 'array');
        $app['config']->set('cache.default', 'array');

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();
        
        putenv('JWT_PUBLIC_KEY_PATH=' . self::$mockPublicKeyPath);
        $_ENV['JWT_PUBLIC_KEY_PATH'] = self::$mockPublicKeyPath;
        $_SERVER['JWT_PUBLIC_KEY_PATH'] = self::$mockPublicKeyPath;
    }

    protected function generateMockToken(array $claims = [])
    {
        $payload = array_merge([
            'jti' => uniqid('mock_'),
            'sub' => $claims['sub'] ?? 'auth_' . md5($claims['email'] ?? 'employee@serms.com'),
            'email' => 'employee@serms.com',
            'first_name' => 'John',
            'last_name' => 'Santos',
            'role' => 'employee',
            'department' => 'SALES',
            'iat' => time(),
            'exp' => time() + 3600,
        ], $claims);

        return \Firebase\JWT\JWT::encode($payload, self::$mockPrivateKey, 'RS256');
    }
}
