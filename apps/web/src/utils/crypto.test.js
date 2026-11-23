import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { withEncryptedPassword } from "./crypto";

describe("withEncryptedPassword", () => {
  let originalCrypto;
  let originalFetch;

  beforeEach(() => {
    originalCrypto = globalThis.crypto;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
    globalThis.fetch = originalFetch;
  });

  it("encrypts password with Web Crypto Subtle and strips plaintext password", async () => {
    const { publicKey } = await webcrypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    );
    const spki = await webcrypto.subtle.exportKey("spki", publicKey);
    const pemBody = Buffer.from(spki)
      .toString("base64")
      .match(/.{1,64}/g)
      .join("\n");
    const pem = `-----BEGIN PUBLIC KEY-----\n${pemBody}\n-----END PUBLIC KEY-----`;

    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
      writable: true,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ public_key: pem }),
    });

    const result = await withEncryptedPassword("secret-pass", {
      comment: "Approved",
      password: "secret-pass",
    });

    expect(result.comment).toBe("Approved");
    expect(result.password).toBeUndefined();
    expect(typeof result.encryptedKey).toBe("string");
    expect(typeof result.iv).toBe("string");
    expect(typeof result.ciphertext).toBe("string");
    expect(result.encryptedKey.length).toBeGreaterThan(0);
    expect(result.iv.length).toBeGreaterThan(0);
    expect(result.ciphertext.length).toBeGreaterThan(0);
  });

  it("falls back to plaintext password when crypto.subtle is unavailable", async () => {
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const result = await withEncryptedPassword("fallback-pass", {
      action: "revise",
    });

    expect(result).toEqual({
      action: "revise",
      password: "fallback-pass",
    });
  });

  it("handles undefined or empty password without calling fetch", async () => {
    globalThis.fetch = vi.fn();

    expect(await withEncryptedPassword(undefined, { comment: "ok" })).toEqual({
      comment: "ok",
    });
    expect(await withEncryptedPassword("", { comment: "ok" })).toEqual({
      comment: "ok",
      password: "",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
