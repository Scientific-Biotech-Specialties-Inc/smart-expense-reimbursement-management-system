// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useReceiptUploads } from "./useReceiptUploads";

const { addToastMock } = vi.hoisted(() => {
  return { addToastMock: vi.fn() };
});

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ token: "fake-token" }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

vi.mock("@/composables/useOcrMode", () => ({
  useOcrMode: () => ({ isMockOcr: ref(false) }),
}));

describe("useReceiptUploads — OCR missing fields notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers warning toast with missing field names when direct OCR upload completes with missing fields", async () => {
    // Mock direct upload response returning processed receipt with missing invoice number & location
    const fakeResponseData = {
      data: {
        id: "rcpt-123",
        status: "processed",
        vendor_name: "Acme Store",
        transaction_date: "2026-10-01",
        invoice_number: "", // missing
        tin: "123-456-789-000",
        location: "", // missing
        expense_category_id: 1,
        total_amount: 250,
        vat_amount: 26.79,
        vat_classification: "vat",
        items: [{ name: "Item 1", qty: 1, price: 250 }],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeResponseData,
    });

    const { handleReceiptSelect, localReceipts } = useReceiptUploads({
      draftKey: "test_draft_key_1",
    });

    const file = new File(["dummy content"], "receipt.png", { type: "image/png" });
    await handleReceiptSelect({ target: { files: [file] } });

    expect(localReceipts.value.length).toBe(1);
    expect(localReceipts.value[0].hasOcrReturned).toBe(true);

    // Verify toast was triggered listing missing fields
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Invoice Number.*Location|Location.*Invoice Number/),
        type: "warning",
      })
    );
  });

  it("does not trigger missing fields toast when OCR returns all required fields", async () => {
    const fakeFullData = {
      data: {
        id: "rcpt-complete",
        status: "processed",
        vendor_name: "Supermart",
        transaction_date: "2026-10-01",
        invoice_number: "INV-8888",
        tin: "111-222-333-000",
        location: "Makati City",
        expense_category_id: 2,
        total_amount: 500,
        vat_amount: 53.57,
        vat_classification: "vat",
        items: [{ name: "Groceries", qty: 1, price: 500 }],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => fakeFullData,
    });

    const { handleReceiptSelect, localReceipts } = useReceiptUploads({
      draftKey: "test_draft_key_2",
    });

    const file = new File(["dummy content"], "receipt-full.png", { type: "image/png" });
    await handleReceiptSelect({ target: { files: [file] } });

    expect(localReceipts.value.length).toBe(1);
    expect(localReceipts.value[0].hasOcrReturned).toBe(true);

    // No warning toast about missing fields should be triggered
    const missingToastCalls = addToastMock.mock.calls.filter(
      ([arg]) => arg?.message?.includes("Missing required field")
    );
    expect(missingToastCalls.length).toBe(0);
  });
});
