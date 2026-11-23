import { describe, it, expect } from "vitest";
import { ref, nextTick } from "vue";
import {
  useRevisionGuard,
  serializeFileAttachment,
  serializeReceiptList,
  serializeTemplateData,
  canonicalizeSnapshot,
} from "./useRevisionGuard";

describe("useRevisionGuard", () => {
  it("stays locked until baseline is captured in revise mode", async () => {
    const isRevise = ref(true);
    const form = ref({ purpose: "Client Travel", amount: 1500 });

    const { isRevisionUnchanged, hasRevisionChanges, captureBaseline } =
      useRevisionGuard({
        isRevise,
        getSnapshot: () => form.value,
      });

    expect(isRevisionUnchanged.value).toBe(true);
    expect(hasRevisionChanges.value).toBe(false);

    captureBaseline();
    expect(isRevisionUnchanged.value).toBe(true);
    expect(hasRevisionChanges.value).toBe(false);

    form.value = { purpose: "Updated Client Travel", amount: 1500 };
    await nextTick();
    expect(isRevisionUnchanged.value).toBe(false);
    expect(hasRevisionChanges.value).toBe(true);

    form.value = { purpose: "Client Travel", amount: 1500 };
    await nextTick();
    expect(isRevisionUnchanged.value).toBe(true);
    expect(hasRevisionChanges.value).toBe(false);
  });

  it("never blocks submission when not in revise mode", () => {
    const isRevise = ref(false);
    const form = ref({ purpose: "Original" });

    const { isRevisionUnchanged, hasRevisionChanges, captureBaseline } =
      useRevisionGuard({
        isRevise,
        getSnapshot: () => form.value,
      });

    expect(isRevisionUnchanged.value).toBe(false);
    expect(hasRevisionChanges.value).toBe(true);

    captureBaseline();
    expect(isRevisionUnchanged.value).toBe(false);
    expect(hasRevisionChanges.value).toBe(true);
  });

  it("canonicalizes object key ordering and undefined keys consistently", () => {
    const a = canonicalizeSnapshot({ b: 2, a: 1, ignored: undefined });
    const b = canonicalizeSnapshot({ a: 1, b: 2 });
    expect(a).toEqual(b);
  });

  it("distinguishes existing path strings, ref objects, and File uploads by metadata", () => {
    const pathRef = serializeFileAttachment("reports/r1.pdf");
    const fileA = serializeFileAttachment(
      new File(["abc"], "r1.pdf", { type: "application/pdf", lastModified: 100 }),
    );
    const fileB = serializeFileAttachment(
      new File(["abcdef"], "r1.pdf", {
        type: "application/pdf",
        lastModified: 200,
      }),
    );

    expect(pathRef).not.toEqual(fileA);
    expect(fileA).not.toEqual(fileB);
    expect(serializeFileAttachment(null)).toBeNull();
    expect(serializeFileAttachment("")).toBeNull();
  });

  it("normalizes receipt monetary strings vs numbers and tracks discount/event edits", () => {
    const base = serializeReceiptList([
      {
        id: 1,
        merchantName: "Jollibee",
        date: "2026-09-01",
        amount: "1120.00",
        subtotal: 1000,
        tax: "120.00",
        vatClassification: "VAT",
        categoryId: 2,
        eventType: "meal",
        discountType: "",
        discountAmount: "",
        items: [{ name: "Chicken", qty: "1", price: 1120 }],
      },
    ]);
    const numericVariant = serializeReceiptList([
      {
        id: 1,
        merchantName: "Jollibee",
        date: "2026-09-01",
        amount: 1120,
        subtotal: "1000.00",
        tax: 120,
        vatClassification: "vat",
        categoryId: 2,
        eventType: "meal",
        discountType: "none",
        discountAmount: null,
        items: [{ name: "Chicken", qty: 1, price: "1120.00" }],
      },
    ]);
    const discountEdited = serializeReceiptList([
      {
        id: 1,
        merchantName: "Jollibee",
        date: "2026-09-01",
        amount: 1120,
        subtotal: "1000.00",
        tax: 120,
        vatClassification: "vat",
        categoryId: 2,
        eventType: "meal",
        discountType: "pwd",
        discountAmount: 200,
        items: [{ name: "Chicken", qty: 1, price: 1120 }],
      },
    ]);

    expect(base).toEqual(numericVariant);
    expect(base).not.toEqual(discountEdited);
  });

  it("ignores transient descriptionEdited/amountEdited UI flags and empty removedSourceIds when serializing template data", () => {
    const original = serializeTemplateData({
      purpose: "Field Audit",
      breakdownItems: [{ description: "Flight", amount: 5000 }],
    });
    const reverted = serializeTemplateData({
      purpose: "Field Audit",
      removedSourceIds: [],
      breakdownItems: [{ description: "Flight", amount: 5000, descriptionEdited: true, amountEdited: true }],
    });
    expect(canonicalizeSnapshot(original)).toEqual(canonicalizeSnapshot(reverted));
  });
});
