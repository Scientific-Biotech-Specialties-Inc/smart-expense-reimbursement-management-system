<?php

namespace App\Modules\Shared\Services;

use Illuminate\Support\Facades\Config;

/**
 * PayloadDecryptionService
 *
 * Handles decryption of client-side encrypted payloads (per SDD §5 "Payload Security").
 *
 * Wire envelope (JSON) produced by the SPA (apps/web/src/utils/crypto.js):
 *   {
 *     "encryptedKey": base64( RSA-OAEP-SHA256( AES-256 key ) ),
 *     "iv":           base64( 12-byte random IV ),
 *     "ciphertext":   base64( AES-256-GCM( plaintext ) + 16-byte GCM tag )
 *   }
 *
 * The RSA private key is the SERMS server key (CRYPTO_PRIVATE_KEY_PATH /
 * CRYPTO_PUBLIC_KEY_PATH). PHP's native openssl_private_decrypt only supports
 * OAEP with SHA-1, so RSA-OAEP-SHA-256 is implemented here as raw RSA
 * (OPENSSL_NO_PADDING) followed by a pure-PHP OAEP-SHA-256 decode (PKCS#1 v2.2).
 *
 * This service is intentionally dependency-free (no phpseclib) to keep the
 * modular monolith self-contained.
 */
class PayloadDecryptionService
{
    private const RSA_KEY_BITS = 2048;
    private const OAEP_HASH = 'sha256';
    private const AES_KEY_BYTES = 32;   // 256-bit AES
    private const GCM_IV_BYTES = 12;
    private const GCM_TAG_BYTES = 16;

    /**
     * Decrypt a client envelope and return the recovered plaintext.
     *
     * @param array $envelope Must contain base64 'encryptedKey', 'iv', 'ciphertext'.
     * @return string Recovered plaintext (e.g. the password).
     * @throws \InvalidArgumentException|\RuntimeException on malformed/undecryptable input.
     */
    public static function decryptEnvelope(array $envelope): string
    {
        $encryptedKey = base64_decode($envelope['encryptedKey'] ?? '', true);
        $iv = base64_decode($envelope['iv'] ?? '', true);
        $ciphertext = base64_decode($envelope['ciphertext'] ?? '', true);

        if ($encryptedKey === false || $iv === false || $ciphertext === false) {
            throw new \InvalidArgumentException('Envelope contains invalid base64 payload.');
        }
        if (strlen($iv) !== self::GCM_IV_BYTES) {
            throw new \InvalidArgumentException('AES-GCM IV must be exactly 12 bytes.');
        }
        if (strlen($ciphertext) <= self::GCM_TAG_BYTES) {
            throw new \InvalidArgumentException('Ciphertext too short to contain GCM auth tag.');
        }

        // 1) RSA-OAEP-SHA-256 decrypt the wrapped AES key.
        $aesKey = self::rsaOaepSha256Decrypt($encryptedKey);
        if (strlen($aesKey) !== self::AES_KEY_BYTES) {
            throw new \RuntimeException('Decrypted AES key has unexpected length.');
        }

        // 2) AES-256-GCM decrypt the password (tag is appended to ciphertext).
        $tag = substr($ciphertext, -self::GCM_TAG_BYTES);
        $cipherBytes = substr($ciphertext, 0, -self::GCM_TAG_BYTES);

        $plaintext = openssl_decrypt(
            $cipherBytes,
            'aes-256-gcm',
            $aesKey,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ($plaintext === false) {
            throw new \RuntimeException('AES-256-GCM decryption failed (bad tag or key).');
        }

        return $plaintext;
    }

    /**
     * Return the server RSA public key (PEM / SPKI) for client-side encryption.
     */
    public static function getPublicKeyPem(): string
    {
        $publicKeyPath = Config::get('services.crypto.public_key_path', storage_path('crypto/public.pem'));

        if (!file_exists($publicKeyPath)) {
            self::generateKeyPair();
        }

        $pem = file_get_contents($publicKeyPath);
        if ($pem === false) {
            throw new \RuntimeException('Unable to read server public key file.');
        }

        return $pem;
    }

    /**
     * RSA-OAEP (SHA-256) decryption of $data using the server private key.
     *
     * PHP's openssl_private_decrypt only supports OAEP-SHA-1, so we perform a
     * raw RSA operation (OPENSSL_NO_PADDING) and then decode OAEP with SHA-256.
     */
    private static function rsaOaepSha256Decrypt(string $data): string
    {
        $k = (int) (self::RSA_KEY_BITS / 8); // 256 bytes for 2048-bit key

        if (strlen($data) !== $k) {
            throw new \InvalidArgumentException('RSA ciphertext length mismatch.');
        }

        $privateKey = self::loadPrivateKeyResource();

        $em = '';
        if (!openssl_private_decrypt($data, $em, $privateKey, OPENSSL_NO_PADDING)) {
            throw new \RuntimeException('Raw RSA decryption failed.');
        }

        // openssl strips leading zero bytes; re-pad to k bytes.
        $em = str_pad($em, $k, "\0", STR_PAD_LEFT);

        return self::oaepDecode($em, self::OAEP_HASH);
    }

    /**
     * EME-OAEP decoding (PKCS#1 v2.2) with the given hash (MGF1 uses same hash).
     * Label is empty (matches Web Crypto / OpenSSL default).
     */
    private static function oaepDecode(string $em, string $hashAlg): string
    {
        $hLen = strlen(hash($hashAlg, '', true));
        $k = strlen($em);

        if ($k < 2 * $hLen + 2) {
            throw new \RuntimeException('OAEP decode error: encoded message too short.');
        }
        if (ord($em[0]) !== 0x00) {
            throw new \RuntimeException('OAEP decode error: leading byte is not zero.');
        }

        $maskedSeed = substr($em, 1, $hLen);
        $maskedDB = substr($em, 1 + $hLen);

        $seedMask = self::mgf1($maskedDB, $hLen, $hashAlg);
        $seed = self::xorBytes($maskedSeed, $seedMask);

        $dbMask = self::mgf1($seed, $k - $hLen - 1, $hashAlg);
        $db = self::xorBytes($maskedDB, $dbMask);

        $lHash = hash($hashAlg, '', true); // empty label
        if (substr($db, 0, $hLen) !== $lHash) {
            throw new \RuntimeException('OAEP decode error: lHash mismatch.');
        }

        // DB = lHash || PS || 0x01 || M ; find the 0x01 separator.
        $rest = substr($db, $hLen);
        $sep = strpos($rest, "\x01");
        if ($sep === false) {
            throw new \RuntimeException('OAEP decode error: separator byte not found.');
        }

        return substr($rest, $sep + 1);
    }

    /**
     * MGF1 mask generation function (PKCS#1) using the given hash.
     */
    private static function mgf1(string $seed, int $length, string $hashAlg): string
    {
        $t = '';
        $counter = 0;

        while (strlen($t) < $length) {
            $t .= hash($hashAlg, $seed . pack('N', $counter), true);
            $counter++;
        }

        return substr($t, 0, $length);
    }

    private static function xorBytes(string $a, string $b): string
    {
        $len = strlen($a);
        $out = '';
        for ($i = 0; $i < $len; $i++) {
            $out .= chr(ord($a[$i]) ^ ord($b[$i]));
        }
        return $out;
    }

    /**
     * Load the RSA private key resource, generating the key pair on first use.
     */
    private static function loadPrivateKeyResource()
    {
        $privateKeyPath = Config::get('services.crypto.private_key_path', storage_path('crypto/private.pem'));

        if (!file_exists($privateKeyPath)) {
            self::generateKeyPair();
        }

        $key = file_get_contents($privateKeyPath);
        if ($key === false) {
            throw new \RuntimeException('Unable to read server private key file.');
        }

        $resource = openssl_pkey_get_private($key);
        if ($resource === false) {
            throw new \RuntimeException('Failed to load RSA private key.');
        }

        return $resource;
    }

    /**
     * Generate and persist the RSA key pair (private + public PEM) if missing.
     */
    private static function generateKeyPair(): void
    {
        $privateKeyPath = Config::get('services.crypto.private_key_path', storage_path('crypto/private.pem'));
        $publicKeyPath = Config::get('services.crypto.public_key_path', storage_path('crypto/public.pem'));

        $dir = dirname($privateKeyPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $config = self::opensslConfig();
        $resource = openssl_pkey_new(array_merge([
            'private_key_bits' => self::RSA_KEY_BITS,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ], $config));

        if ($resource === false) {
            throw new \RuntimeException('Failed to generate RSA key pair: ' . openssl_error_string());
        }

        $exported = openssl_pkey_export($resource, $privateKey, null, $config);
        if ($exported === false) {
            throw new \RuntimeException('Failed to export RSA private key: ' . openssl_error_string());
        }

        $details = openssl_pkey_get_details($resource);
        if ($details === false) {
            throw new \RuntimeException('Failed to read RSA key details.');
        }
        $publicKey = $details['key'];

        if (file_put_contents($privateKeyPath, $privateKey) === false) {
            throw new \RuntimeException('Failed to persist RSA private key.');
        }
        if (file_put_contents($publicKeyPath, $publicKey) === false) {
            throw new \RuntimeException('Failed to persist RSA public key.');
        }
    }

    /**
     * Resolve an OpenSSL config location. On some environments (notably Windows)
     * openssl_pkey_new requires an explicit config file.
     */
    private static function opensslConfig(): array
    {
        $candidates = [
            getenv('OPENSSL_CONF') ?: '',
            PHP_BINARY ? dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf' : '',
            PHP_OS_FAMILY === 'Windows'
                ? 'C:\\Program Files\\Common Files\\SSL\\openssl.cnf'
                : '/usr/lib/ssl/openssl.cnf',
            '',
        ];

        foreach ($candidates as $candidate) {
            if ($candidate !== '' && file_exists($candidate)) {
                return ['config' => $candidate];
            }
        }

        return [];
    }
}
