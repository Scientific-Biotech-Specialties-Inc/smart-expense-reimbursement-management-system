import { describe, expect, it } from "vitest";
import {
  canEditReceipt,
  canDeleteReceipt,
  EDIT_FORBIDDEN_STATUSES,
  DELETE_FORBIDDEN_STATUSES,
} from "./receiptUtils";

describe("canEditReceipt (My Expense edit gating)", () => {
  const forbidden = [
    "approved",
    "pending",
    "pending-admin-re-review",
    "final-rejected",
  ];
  const editable = [
    "processing",
    "processed",
    "flagged",
    "rejected",
    "failed",
    "automatic-rejected",
  ];

  it("blocks the four forbidden statuses", () => {
    for (const status of forbidden) {
      expect(canEditReceipt({ status })).toBe(false);
    }
  });

  it("allows processing, processed, rejected, failed, and other non-forbidden statuses", () => {
    for (const status of editable) {
      expect(canEditReceipt({ status })).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(canEditReceipt({ status: "APPROVED" })).toBe(false);
    expect(canEditReceipt({ status: "Processing" })).toBe(true);
    expect(canEditReceipt({ status: "PENDING-ADMIN-RE-REVIEW" })).toBe(false);
  });

  it("falls back to complianceStatus when status is missing", () => {
    expect(canEditReceipt({ complianceStatus: "pending" })).toBe(false);
    expect(canEditReceipt({ complianceStatus: "processed" })).toBe(true);
    expect(canEditReceipt({ complianceStatus: "final-rejected" })).toBe(false);
  });

  it("returns false for null/undefined/empty receipt", () => {
    expect(canEditReceipt(null)).toBe(false);
    expect(canEditReceipt(undefined)).toBe(false);
    expect(canEditReceipt({})).toBe(false);
  });

  it("exposes the exact forbidden-status list", () => {
    expect(EDIT_FORBIDDEN_STATUSES).toEqual([
      "approved",
      "pending",
      "pending-admin-re-review",
      "final-rejected",
    ]);
  });
});

describe("canDeleteReceipt (delete gating, allows final-rejected)", () => {
  const forbidden = [
    "approved",
    "pending",
    "pending-admin-re-review",
  ];
  const deletable = [
    "processing",
    "processed",
    "flagged",
    "rejected",
    "failed",
    "automatic-rejected",
    "final-rejected",
  ];

  it("blocks the forbidden statuses", () => {
    for (const status of forbidden) {
      expect(canDeleteReceipt({ status })).toBe(false);
    }
  });

  it("allows processing, processed, flagged, rejected, failed, automatic-rejected, and final-rejected", () => {
    for (const status of deletable) {
      expect(canDeleteReceipt({ status })).toBe(true);
    }
  });

  it("allows final-rejected even though edit does not", () => {
    expect(canDeleteReceipt({ status: "final-rejected" })).toBe(true);
    expect(canEditReceipt({ status: "final-rejected" })).toBe(false);
  });

  it("matches canEditReceipt for all statuses except final-rejected", () => {
    const others = [
      ...forbidden,
      "processing",
      "processed",
      "flagged",
      "rejected",
      "failed",
      "automatic-rejected",
    ];
    for (const status of others) {
      expect(canDeleteReceipt({ status })).toBe(canEditReceipt({ status }));
    }
  });

  it("is case-insensitive", () => {
    expect(canDeleteReceipt({ status: "APPROVED" })).toBe(false);
    expect(canDeleteReceipt({ status: "Processing" })).toBe(true);
    expect(canDeleteReceipt({ status: "PENDING-ADMIN-RE-REVIEW" })).toBe(false);
  });

  it("falls back to complianceStatus when status is missing", () => {
    expect(canDeleteReceipt({ complianceStatus: "pending" })).toBe(false);
    expect(canDeleteReceipt({ complianceStatus: "processed" })).toBe(true);
    expect(canDeleteReceipt({ complianceStatus: "final-rejected" })).toBe(true);
  });

  it("returns false for null/undefined/empty receipt", () => {
    expect(canDeleteReceipt(null)).toBe(false);
    expect(canDeleteReceipt(undefined)).toBe(false);
    expect(canDeleteReceipt({})).toBe(false);
  });

  it("exposes the exact delete forbidden-status list", () => {
    expect(DELETE_FORBIDDEN_STATUSES).toEqual([
      "approved",
      "pending",
      "pending-admin-re-review",
    ]);
  });
});

describe("getMissingReceiptFields and isReceiptFieldMissing", () => {
  const completeReceipt = {
    invoiceNumber: "INV-101",
    date: "2026-10-01",
    tin: "123-456-789-000",
    merchantName: "Acme Corp",
    location: "BGC Taguig",
    categoryId: 2,
    amount: 500,
    subtotal: 446.43,
  };

  it("returns no missing fields when receipt is fully populated", async () => {
    const { getMissingReceiptFields } = await import("./receiptUtils");
    expect(getMissingReceiptFields(completeReceipt)).toEqual([]);
  });

  it("identifies missing required fields", async () => {
    const { getMissingReceiptFields } = await import("./receiptUtils");
    const partialReceipt = {
      ...completeReceipt,
      invoiceNumber: "",
      location: "   ",
      categoryId: null,
      amount: 0,
    };
    const missing = getMissingReceiptFields(partialReceipt);
    const missingKeys = missing.map((m) => m.key);
    expect(missingKeys).toContain("invoiceNumber");
    expect(missingKeys).toContain("location");
    expect(missingKeys).toContain("categoryId");
    expect(missingKeys).toContain("amount");
    expect(missingKeys).not.toContain("merchantName");
    expect(missingKeys).not.toContain("date");
  });

  it("does not report field missing if hasOcrReturned is false", async () => {
    const { isReceiptFieldMissing } = await import("./receiptUtils");
    const receipt = {
      invoiceNumber: "",
      hasOcrReturned: false,
    };
    expect(isReceiptFieldMissing(receipt, "invoiceNumber")).toBe(false);
  });

  it("reports field missing if hasOcrReturned is true and value is empty", async () => {
    const { isReceiptFieldMissing } = await import("./receiptUtils");
    const receipt = {
      invoiceNumber: "",
      hasOcrReturned: true,
    };
    expect(isReceiptFieldMissing(receipt, "invoiceNumber")).toBe(true);
  });
});

describe("itemGrossAmount and receiptGrossAmount (line-total price contract)", () => {
  it("treats item.price as already the line total without multiplying by quantity", async () => {
    const { itemGrossAmount, itemsGrossAmount } = await import("./receiptUtils");
    expect(itemGrossAmount({ name: "Organic Bananas", quantity: 2, price: 3.18 })).toBe(3.18);
    expect(
      itemsGrossAmount([
        { name: "Organic Bananas", qty: 2, price: 3.18 },
        { name: "Greek Yogurt 6oz", qty: 3, price: 5.97 },
      ]),
    ).toBeCloseTo(9.15, 2);
  });

  it("prioritizes explicit total_amount over items sum on prefill", async () => {
    const { buildPrefilledReceiptDraft, receiptGrossAmount } = await import("./receiptUtils");
    const draft = buildPrefilledReceiptDraft({
      id: 19,
      receiptData: {
        total_amount: 44.04,
        vat_amount: 2.88,
        items: [
          { name: "Organic Bananas", quantity: 2, price: 3.18 },
          { name: "2% Milk Gallon", quantity: 1, price: 4.99 },
        ],
      },
    });
    expect(draft.amount).toBe(44.04);
    expect(draft.items[0]).toEqual({ name: "Organic Bananas", qty: 2, price: 3.18 });
    expect(receiptGrossAmount({ amount: 0, items: draft.items })).toBeCloseTo(8.17, 2);
  });

  it("preserves extracted subtotal without forcing automatic 12% calculation", async () => {
    const { buildPrefilledReceiptDraft } = await import("./receiptUtils");
    // Receipt with exclusive tax: subtotal 100, vat 12, total 112
    const draft = buildPrefilledReceiptDraft({
      id: 20,
      receiptData: {
        total_amount: 112.00,
        subtotal: 100.00,
        vat_amount: 12.00,
        vat_classification: "vat",
      },
    });
    expect(draft.subtotal).toBe("100.00");
    expect(draft.amount).toBe(112);
    expect(draft.tax).toBe("12.00");
  });

  it("falls back to calculated subtotal for VAT receipts if subtotal was not extracted", async () => {
    const { buildPrefilledReceiptDraft } = await import("./receiptUtils");
    const draft = buildPrefilledReceiptDraft({
      id: 21,
      receiptData: {
        total_amount: 50.00,
        vat_amount: 5.36,
        vat_classification: "vat",
      },
    });
    expect(draft.subtotal).toBe("44.64");
    expect(draft.amount).toBe(50);
  });

  it("defaults subtotal to total_amount for NON-VAT receipts if subtotal not extracted", async () => {
    const { buildPrefilledReceiptDraft } = await import("./receiptUtils");
    const draft = buildPrefilledReceiptDraft({
      id: 22,
      receiptData: {
        total_amount: 80.00,
        vat_classification: "non-vat",
      },
    });
    expect(draft.subtotal).toBe("80.00");
    expect(draft.tax).toBe("0.00");
  });

  it("truncates total amount into two digits without rounding", async () => {
    const { buildPrefilledReceiptDraft } = await import("./receiptUtils");
    const draft = buildPrefilledReceiptDraft({
      id: 23,
      receiptData: {
        total_amount: 150.999,
        vat_classification: "vat",
      },
    });
    expect(draft.amount).toBe(150.99);
  });
});

