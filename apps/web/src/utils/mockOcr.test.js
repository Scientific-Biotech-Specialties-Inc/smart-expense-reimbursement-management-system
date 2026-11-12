import { describe, it, expect } from "vitest";
import {
  generateMockOcrData,
  buildMockReimbursementReceipt,
  buildMockFileUploadEntry,
} from "./mockOcr";

function makeFile(name = "jollibee_receipt.jpg") {
  return { name, size: 142000, type: "image/jpeg" };
}

describe("generateMockOcrData (offline OCR replica, no backend)", () => {
  it("fills all Option-A fields with plausible values and no backend call", () => {
    const data = generateMockOcrData(makeFile());

    expect(data.vendor_name).toBeTruthy();
    expect(typeof data.vendor_name).toBe("string");
    expect(data.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.tin).toMatch(/^\d{3}-\d{3}-\d{3}-\d{3}$/);
    expect(data.invoice_number).toBeTruthy();
    expect(data.location).toBeTruthy();
    expect(Number(data.total_amount)).toBeGreaterThan(0);
    expect(data.currency).toBe("PHP");
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.confidence ?? data.ocr_confidence_score).toBeTruthy();
  });

  it("computes BIR VAT math vat = total * 0.12 / 1.12", () => {
    const data = generateMockOcrData(makeFile("sm_receipt.png"));
    const total = Number(data.total_amount);
    const vat = Number(data.vat_amount ?? data.vat);
    const expected = Math.round(((total * 0.12) / 1.12) * 100) / 100;
    expect(vat).toBe(expected);
    expect(Math.abs(vat - (total * 0.12) / 1.12)).toBeLessThanOrEqual(0.01);
    expect(Number(data.vat_amount)).toBeLessThanOrEqual(total);
  });

  it("handles boundary rounding cleanly without floating-point flakiness", () => {
    // 1735.58 yields raw VAT of 185.95499999999998, which rounds to 185.96
    const data = generateMockOcrData(makeFile("sm_receipt.png"), { total: 1735.58 });
    expect(data.total_amount).toBe(1735.58);
    expect(data.vat_amount).toBe(185.96);
    expect(data.subtotal).toBe(1549.62);
  });

  it("derives vendor hint from filename when recognizable", () => {
    const data = generateMockOcrData(makeFile("7-eleven_grab_receipt.jpg"));
    expect(String(data.vendor_name).length).toBeGreaterThan(2);
  });
});

describe("mock receipt adapters fill form inputs", () => {
  it("builds reimbursement draft compatible with ScannedReceiptsList inputs", () => {
    const draft = buildMockReimbursementReceipt(makeFile(), { categoryId: 3 });

    expect(draft.merchantName).toBeTruthy();
    expect(draft.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(draft.tin).toBeTruthy();
    expect(draft.invoiceNumber).toBeTruthy();
    expect(draft.location).toBeTruthy();
    expect(Number(draft.amount)).toBeGreaterThan(0);
    expect(draft.tax).toBeTruthy();
    expect(draft.subtotal).toBeTruthy();
    expect(draft.categoryId).toBe(3);
    expect(Array.isArray(draft.items)).toBe(true);
    expect(draft.isUploading).toBe(false);
    expect(draft.isProcessing).toBe(false);
  });

  it("builds FileUpload entry with ocrStatus done and previews preserved", () => {
    const entry = buildMockFileUploadEntry(makeFile(), {
      thumbnail: "blob:mock",
      previews: ["blob:mock"],
    });

    expect(entry.ocrStatus).toBe("done");
    expect(entry.merchantName).toBeTruthy();
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.tin).toBeTruthy();
    expect(entry.invoiceNumber).toBeTruthy();
    expect(Number(entry.amount)).toBeGreaterThan(0);
    expect(entry.ocrData).toBeTruthy();
    expect(entry.ocrData.vendor).toBe(entry.merchantName);
    expect(entry.thumbnail).toBe("blob:mock");
  });
});
