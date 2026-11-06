import { describe, it, expect } from "vitest";
import { formatPeso, formatAmount, formatKpiValue, formatDate, truncateText, truncateDecimal } from "./formatters";

describe("formatters", () => {
  describe("formatPeso", () => {
    it("formats amounts to 2 decimal places with PHP currency symbol", () => {
      expect(formatPeso(1200.12)).toBe("₱1,200.12");
      expect(formatPeso(7510.4)).toBe("₱7,510.40");
      expect(formatPeso(44750)).toBe("₱44,750.00");
      expect(formatPeso(0)).toBe("₱0.00");
    });
  });

  describe("formatAmount", () => {
    it("formats amounts with 2 decimal places for specified currency", () => {
      expect(formatAmount(1200.12, "PHP")).toBe("₱1,200.12");
      expect(formatAmount(150, "USD")).toBe("$150.00");
    });
  });

  describe("formatDate", () => {
    it("formats ISO and valid date strings to Medium Date format", () => {
      expect(formatDate("2026-09-01")).toBe("Sep 1, 2026");
      expect(formatDate("2026-01-15T10:30:00Z")).toMatch(/Jan 15, 2026/);
      expect(formatDate("2026-10-14")).toBe("Oct 14, 2026");
    });

    it("handles null, undefined and empty values gracefully", () => {
      expect(formatDate(null)).toBe("—");
      expect(formatDate(undefined)).toBe("—");
      expect(formatDate("")).toBe("—");
    });

    it("returns raw string if not a valid parseable date", () => {
      expect(formatDate("Invalid Date String")).toBe("Invalid Date String");
    });
  });

  describe("formatKpiValue", () => {
    it("formats float numbers to 2 decimal places", () => {
      expect(formatKpiValue(1200.12)).toBe("1,200.12");
      expect(formatKpiValue(1200.1)).toBe("1,200.10");
      expect(formatKpiValue(1200.128)).toBe("1,200.13");
      expect(formatKpiValue(7510.4)).toBe("7,510.40");
    });

    it("formats integer numbers without unnecessary decimal places", () => {
      expect(formatKpiValue(7)).toBe("7");
      expect(formatKpiValue(100)).toBe("100");
      expect(formatKpiValue(0)).toBe("0");
    });

    it("formats currency strings to exactly 2 decimals", () => {
      expect(formatKpiValue("₱7,510.4")).toBe("₱7,510.40");
      expect(formatKpiValue("₱44,750")).toBe("₱44,750.00");
      expect(formatKpiValue("₱1,200.12")).toBe("₱1,200.12");
      expect(formatKpiValue("₱1200.1234")).toBe("₱1,200.12");
      expect(formatKpiValue("$1200.1")).toBe("$1,200.10");
    });

    it("leaves non-numeric strings untouched", () => {
      expect(formatKpiValue("Ready to forward")).toBe("Ready to forward");
      expect(formatKpiValue("—")).toBe("—");
      expect(formatKpiValue(null)).toBe("—");
      expect(formatKpiValue(undefined)).toBe("—");
    });
  });

  describe("truncateText", () => {
    it("returns '—' for null, undefined, or empty text", () => {
      expect(truncateText(null)).toBe("—");
      expect(truncateText(undefined)).toBe("—");
      expect(truncateText("")).toBe("—");
    });

    it("leaves strings at or below maxLength untouched", () => {
      expect(truncateText("Short text")).toBe("Short text");
      expect(truncateText("123456789012345678")).toBe("123456789012345678");
    });

    it("truncates strings exceeding default cap of 18 characters (< 20) including spaces and appends '...'", () => {
      // 25 characters with spaces:
      // "Purchased office s" is 18 chars (9 + 1 + 6 + 1 + 1)
      const input = "Purchased office supplies";
      const result = truncateText(input);
      expect(result).toBe("Purchased office s...");
      expect("Purchased office s".length).toBe(18);
    });

    it("trims trailing spaces before the ellipsis", () => {
      // Character 18 is a space
      const textWithSpaceAt18 = "12345678 12345678 ABC";
      expect(textWithSpaceAt18.slice(0, 18)).toBe("12345678 12345678 ");
      expect(truncateText(textWithSpaceAt18, 18)).toBe("12345678 12345678...");
    });

    it("supports custom maxLength", () => {
      expect(truncateText("Hello World!", 5)).toBe("Hello...");
      expect(truncateText("Purchased office supplies and materials for Q4", 30)).toBe("Purchased office supplies and...");
    });
  });

  describe("truncateDecimal", () => {
    it("returns empty string for null, undefined, or empty value", () => {
      expect(truncateDecimal(null)).toBe("");
      expect(truncateDecimal(undefined)).toBe("");
      expect(truncateDecimal("")).toBe("");
    });

    it("returns integers unchanged", () => {
      expect(truncateDecimal(100)).toBe("100");
      expect(truncateDecimal("100")).toBe("100");
      expect(truncateDecimal(0)).toBe("0");
    });

    it("preserves trailing dot and values with 1 or 2 decimals while typing", () => {
      expect(truncateDecimal("100.")).toBe("100.");
      expect(truncateDecimal("100.5")).toBe("100.5");
      expect(truncateDecimal("100.55")).toBe("100.55");
      expect(truncateDecimal(100.5)).toBe("100.5");
    });

    it("truncates decimal digits exceeding 2 digits without rounding", () => {
      expect(truncateDecimal("100.559")).toBe("100.55");
      expect(truncateDecimal(100.559)).toBe("100.55");
      expect(truncateDecimal("12.345678")).toBe("12.34");
      expect(truncateDecimal(12.3499)).toBe("12.34");
      expect(truncateDecimal("0.999")).toBe("0.99");
      expect(truncateDecimal(".999")).toBe(".99");
    });

    it("supports custom digit lengths", () => {
      expect(truncateDecimal("12.3456", 3)).toBe("12.345");
      expect(truncateDecimal("12.3456", 1)).toBe("12.3");
      expect(truncateDecimal("12.3456", 0)).toBe("12");
    });
  });
});
