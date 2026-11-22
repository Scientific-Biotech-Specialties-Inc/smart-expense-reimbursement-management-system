import { describe, expect, it, vi } from "vitest";

// `reimbursementForwarding.js` imports helpers from `@/utils/receiptUtils`.
// Those helpers are only exercised by `mapReceiptToReimbursement`, not by the
// forwarding-gate logic under test, so we stub them to keep the unit test
// focused on the block-reason message logic.
vi.mock("@/utils/receiptUtils", () => ({
  cleanName: (v) => v,
  getItems: () => ["Receipt total"],
  normalizeVatClassification: (v) => v,
  receiptFinancials: () => ({
    gross: 0,
    subtotal: 0,
    vat: 0,
    vatClassification: "vat",
  }),
  tinFor: () => "TIN",
}));

import {
  canForwardToReimbursement,
  getForwardingBlockReason,
  mapReceiptToReimbursement,
} from "@/utils/reimbursementForwarding";

// A freshly uploaded, un-attached receipt as it arrives from the store's
// `mapReceipt` (status `pending`, reimbursements_count 0 -> isReimbursed false).
const freshPendingReceipt = {
  id: "RCPT-2026-001",
  dbId: 1,
  status: "pending",
  isReimbursed: false,
  reimbursements_count: 0,
};

describe("reimbursementForwarding block reasons", () => {
  it("does NOT report a fresh, un-attached, pending receipt as already attached", () => {
    const reason = getForwardingBlockReason(freshPendingReceipt);

    expect(reason).not.toMatch(/already attached/i);
    expect(reason).toMatch(/processed/i);
    expect(canForwardToReimbursement(freshPendingReceipt)).toBe(false);
  });

  it("reports the status reason (not the attached reason) for an unprocessed, un-attached receipt", () => {
    expect(getForwardingBlockReason(freshPendingReceipt)).toBe(
      "Receipts must be processed before they can be forwarded to reimbursement.",
    );
  });

  it("reports the attached reason for a genuinely attached receipt", () => {
    const attached = {
      ...freshPendingReceipt,
      status: "processed",
      isReimbursed: true,
      reimbursements_count: 1,
    };

    expect(getForwardingBlockReason(attached)).toBe(
      "This receipt is already attached to a reimbursement request.",
    );
    expect(canForwardToReimbursement(attached)).toBe(false);
  });

  it("allows a processed, un-attached receipt to be forwarded", () => {
    const processed = {
      ...freshPendingReceipt,
      status: "processed",
      isReimbursed: false,
      reimbursements_count: 0,
    };

    expect(getForwardingBlockReason(processed)).toBe("");
    expect(canForwardToReimbursement(processed)).toBe(true);
  });

  it("prioritizes the attached reason when a list mixes attached and unprocessed receipts", () => {
    const attached = {
      ...freshPendingReceipt,
      dbId: 2,
      status: "processed",
      isReimbursed: true,
      reimbursements_count: 1,
    };
    const pending = { ...freshPendingReceipt, dbId: 3 };

    expect(getForwardingBlockReason([attached, pending])).toMatch(
      /already attached/i,
    );
  });

  it("reports the status reason when a list contains only unprocessed, un-attached receipts", () => {
    expect(
      getForwardingBlockReason([
        freshPendingReceipt,
        { ...freshPendingReceipt, dbId: 9 },
      ]),
    ).toBe(
      "Receipts must be processed before they can be forwarded to reimbursement.",
    );
  });

  it("prompts for selection when no receipts are provided", () => {
    expect(getForwardingBlockReason([])).toBe(
      "Select at least one receipt to forward.",
    );
  });
});

describe("mapReceiptToReimbursement", () => {
  it("preserves eventType and subtotal when present on the receipt", () => {
    const mapped = mapReceiptToReimbursement({
      id: "RCPT-2026-010",
      dbId: 10,
      vendorName: "Bistro",
      date: "2026-06-01",
      amount: 112,
      subtotal: 100.5,
      vatAmount: 12,
      vatClassification: "vat",
      eventType: "Client Meeting",
      location: "Makati",
      items: [],
    });

    expect(mapped.eventType).toBe("Client Meeting");
    expect(mapped.subtotal).toBe("100.50");
    expect(mapped.location).toBe("Makati");
  });

  it("defaults eventType to empty string and falls back to computed subtotal when subtotal is missing", () => {
    const mapped = mapReceiptToReimbursement({
      id: "RCPT-2026-011",
      dbId: 11,
      vendorName: "Cafe",
      date: "2026-06-02",
      amount: 0,
      subtotal: null,
      vatClassification: "vat",
      items: [],
    });

    expect(mapped.eventType).toBe("");
    expect(mapped.subtotal).toBe("0.00");
  });
});
