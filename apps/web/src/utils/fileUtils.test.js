import { afterEach, describe, expect, it, vi } from "vitest";
import { getFileUrl } from "./fileUtils";

describe("getFileUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("returns empty string for null or undefined or empty inputs", () => {
    expect(getFileUrl(null)).toBe("");
    expect(getFileUrl(undefined)).toBe("");
    expect(getFileUrl("")).toBe("");
    expect(getFileUrl([])).toBe("");
  });

  it("returns absolute URLs unchanged", () => {
    expect(getFileUrl("https://example.com/image.png")).toBe(
      "https://example.com/image.png",
    );
    expect(getFileUrl("http://example.com/file.pdf")).toBe(
      "http://example.com/file.pdf",
    );
    expect(getFileUrl("blob:http://localhost/12345")).toBe(
      "blob:http://localhost/12345",
    );
  });

  it("resolves relative string path with default bucket", () => {
    const url = getFileUrl("receipts/sample.jpg");
    expect(url).toContain("supabase.co/storage/v1/object/public/cash_advances/receipts/sample.jpg");
  });

  it("resolves relative string path with custom bucket", () => {
    const url = getFileUrl("receipts/sample.jpg", "receipts");
    expect(url).toContain("supabase.co/storage/v1/object/public/receipts/receipts/sample.jpg");
  });

  it("handles array of file paths safely by extracting first item", () => {
    const url = getFileUrl(["receipts/sample.jpg", "receipts/other.jpg"]);
    expect(url).toContain("supabase.co/storage/v1/object/public/cash_advances/receipts/sample.jpg");
  });

  it("handles array with http URL safely", () => {
    const url = getFileUrl(["https://example.com/photo.png"]);
    expect(url).toBe("https://example.com/photo.png");
  });

  it("handles array with null or empty elements safely", () => {
    expect(getFileUrl([null])).toBe("");
    expect(getFileUrl([""])).toBe("");
  });

  it("uses VITE_SUPABASE_STORAGE_BASE_URL and strips trailing slashes", () => {
    vi.stubEnv(
      "VITE_SUPABASE_STORAGE_BASE_URL",
      "https://custom-storage.example.com/storage/v1/object/public///",
    );
    expect(getFileUrl("receipts/sample.jpg", "receipts")).toBe(
      "https://custom-storage.example.com/storage/v1/object/public/receipts/receipts/sample.jpg",
    );
  });
});
