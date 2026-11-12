import { describe, it, expect, beforeEach } from "vitest";
import { useOcrMode } from "./useOcrMode";

function mockLocalStorage() {
  let store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

describe("useOcrMode (persisted mock/real toggle, default Real OCR)", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it("defaults to Real OCR (false) when nothing persisted", () => {
    const { isMockOcr } = useOcrMode();
    expect(isMockOcr.value).toBe(false);
  });

  it("persists ON choice to localStorage and restores on next use", () => {
    const first = useOcrMode();
    first.setMockMode(true);
    expect(first.isMockOcr.value).toBe(true);
    expect(globalThis.localStorage.getItem("serms_ocr_mock_mode")).toBe("1");

    const second = useOcrMode();
    expect(second.isMockOcr.value).toBe(true);
  });

  it("toggles back to Real OCR and persists OFF", () => {
    const { isMockOcr, setMockMode, toggleMockMode } = useOcrMode();
    setMockMode(true);
    toggleMockMode();
    expect(isMockOcr.value).toBe(false);
    expect(globalThis.localStorage.getItem("serms_ocr_mock_mode")).toBe("0");
  });
});
