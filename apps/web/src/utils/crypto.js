/**
 * Client-side payload encryption for SERMS sensitive operations.
 *
 * Scheme (must stay byte-for-byte compatible with the backend
 * App\Modules\Shared\Services\PayloadDecryptionService):
 *   - RSA: 2048-bit, OAEP padding, SHA-256 (server public key from GET /api/serms/crypto/key)
 *   - AES: 256-bit key (random per request), GCM mode, 12-byte random IV
 *   - Wire envelope (JSON):
 *       {
 *         "encryptedKey": base64( RSA-OAEP-SHA256( AES_key ) ),
 *         "iv":           base64( 12-byte IV ),
 *         "ciphertext":   base64( AES-256-GCM( plaintext ) + 16-byte GCM tag )
 *       }
 *
 * Uses the native Web Crypto Subtle API only — no additional npm dependency.
 */

let cachedPublicKeyPem = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert a PEM (SPKI) public key to a DER ArrayBuffer for Web Crypto importKey.
 */
function pemToDer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  return base64ToArrayBuffer(base64);
}

/**
 * Fetch (and cache) the SERMS server RSA public key.
 */
async function fetchServerPublicKey() {
  if (cachedPublicKeyPem) {
    return cachedPublicKeyPem;
  }

  const response = await fetch('/api/serms/crypto/key', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch server public key for payload encryption.');
  }

  const data = await response.json();
  cachedPublicKeyPem = data.public_key;
  return cachedPublicKeyPem;
}

/**
 * Encrypt a plaintext string into the SERMS crypto envelope.
 *
 * @param {string} plaintext - The value to encrypt (e.g. a password).
 * @returns {Promise<{encryptedKey: string, iv: string, ciphertext: string}>}
 */
export async function encryptPayload(plaintext) {
  const pem = await fetchServerPublicKey();

  const publicKey = await crypto.subtle.importKey(
    'spki',
    pemToDer(pem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  // Generate a fresh random AES-256-GCM key for this request.
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintextBytes
  );

  // Export the raw AES key and wrap it with RSA-OAEP (SHA-256).
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const encryptedKeyBuffer = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    rawAesKey
  );

  return {
    encryptedKey: arrayBufferToBase64(encryptedKeyBuffer),
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
  };
}

/**
 * Encrypt a password into a SERMS crypto envelope and merge it into a request payload.
 * Removes any plaintext `password` property from the returned object when encrypted.
 * Falls back to `{ ...payload, password }` only if Web Crypto Subtle is unavailable
 * (e.g. JSDOM unit-test environments).
 *
 * @param {string|null|undefined} password - The confirmation password.
 * @param {Record<string, any>} [payload={}] - Base request payload.
 * @returns {Promise<Record<string, any>>}
 */
export async function withEncryptedPassword(password, payload = {}) {
  const base = payload && typeof payload === 'object' ? { ...payload } : {};
  delete base.password;

  if (password === undefined || password === null || password === '') {
    return password === undefined ? base : { ...base, password };
  }

  if (!globalThis.crypto?.subtle) {
    return { ...base, password };
  }

  const { encryptedKey, iv, ciphertext } = await encryptPayload(String(password));
  return {
    ...base,
    encryptedKey,
    iv,
    ciphertext,
  };
}
