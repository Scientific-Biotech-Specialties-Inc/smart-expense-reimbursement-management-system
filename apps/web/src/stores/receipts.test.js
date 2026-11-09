import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../utils/apiFetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../utils/apiFetch";
import { useReceiptStore } from "./receipts";

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
  setActivePinia(createPinia());
  apiFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const arrayFieldsReceipt = {
  id: 1,
  file_path: ["receipts/2026/jan/receipt-sample.pdf"],
  file_type: ["application/pdf"],
  file_size_bytes: ["2048"],
  file_hash: ["array-hash-abc123"],
  file_url: ["https://storage.example.com/receipts/receipt-sample.pdf"],
  transaction_date: "2026-01-15",
  created_at: "2026-01-15T00:00:00.000Z",
  total_amount: 1250,
  vat_amount: 133.93,
  category: { name: "Food & Dining" },
  expense_category_id: 2,
  status: "processed",
  vendor_name: "Sample Vendor",
  invoice_number: "INV-001",
  tin: "123-456-789-000",
  uploader: { name: "John Doe" },
  items: [],
};

const scalarFieldsReceipt = {
  id: 2,
  file_path: "legacy/receipts/legacy-receipt.jpg",
  file_type: "image/jpeg",
  file_size_bytes: 4096,
  file_hash: "scalar-hash-xyz789",
  transaction_date: "2026-02-01",
  created_at: "2026-02-01T00:00:00.000Z",
  total_amount: 350,
  vat_amount: 37.5,
  category: { name: "Transportation" },
  expense_category_id: 3,
  status: "processed",
  vendor_name: "Legacy Vendor",
  invoice_number: "INV-002",
  uploader: { name: "Jane Doe" },
  items: [],
};

const okJson = (data, total) => ({
  ok: true,
  json: async () => ({
    data,
    meta: {
      current_page: 1,
      last_page: 1,
      per_page: 10,
      total,
      from: 1,
      to: total,
    },
  }),
});

describe("useReceiptStore", () => {
  it("maps array-typed file fields from fetchAll", async () => {
    apiFetch.mockResolvedValue(okJson([arrayFieldsReceipt], 1));

    const store = useReceiptStore();
    await store.fetchAll();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(store.receipts).toHaveLength(1);

    const receipt = store.receipts[0];
    expect(receipt.fileName).toBe("receipt-sample.pdf");
    expect(receipt.fileType).toBe("application/pdf");
    expect(receipt.fileSize).toBe(2048);
    expect(receipt.hash).toBe("array-hash-abc123");
    expect(typeof receipt.hash).toBe("string");
    expect(receipt.thumbnail).toBe(
      "https://storage.example.com/receipts/receipt-sample.pdf",
    );
    expect(store.existingHashes.has("array-hash-abc123")).toBe(true);
  });

  it("maps legacy scalar file fields from fetchAll", async () => {
    apiFetch.mockResolvedValue(okJson([scalarFieldsReceipt], 1));

    const store = useReceiptStore();
    await store.fetchAll();

    expect(store.receipts).toHaveLength(1);

    const receipt = store.receipts[0];
    expect(receipt.fileName).toBe("legacy-receipt.jpg");
    expect(receipt.fileType).toBe("image/jpeg");
    expect(receipt.fileSize).toBe(4096);
    expect(receipt.hash).toBe("scalar-hash-xyz789");
    expect(typeof receipt.hash).toBe("string");
    expect(receipt.thumbnail).toContain("legacy-receipt.jpg");
  });

  it("unshifts the receipt returned by uploadReceipt", async () => {
    apiFetch.mockResolvedValue(
      okJson(
        {
          id: 3,
          file_path: "uploads/2026/new-upload.pdf",
          file_type: "application/pdf",
          file_size_bytes: 5120,
          file_hash: "new-upload-hash",
          transaction_date: "2026-03-01",
          total_amount: 99,
          vat_amount: 10.61,
          status: "processed",
          vendor_name: "New Vendor",
          invoice_number: "INV-003",
          category: { name: "Supplies" },
          expense_category_id: 4,
          uploader: { name: "John Doe" },
          items: [],
        },
        1,
      ),
    );

    const store = useReceiptStore();
    const saved = await store.uploadReceipt(
      new File([""], "new-upload.pdf", { type: "application/pdf" }),
      { expense_category_id: 4 },
    );

    expect(store.receipts).toHaveLength(1);
    expect(store.receipts[0].fileName).toBe("new-upload.pdf");
    expect(saved.fileName).toBe("new-upload.pdf");
  });

  it("passes scope=mine to the receipts API when requested", async () => {
    apiFetch.mockResolvedValue(okJson([], 0));

    const store = useReceiptStore();
    await store.fetchAll({ scope: "mine" });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const url = apiFetch.mock.calls[0][0];
    expect(url).toContain("/api/serms/reimbursements/receipts?");
    expect(url).toContain("scope=mine");
  });

  it("omits the scope param by default", async () => {
    apiFetch.mockResolvedValue(okJson([], 0));

    const store = useReceiptStore();
    await store.fetchAll();

    const url = apiFetch.mock.calls[0][0];
    expect(url).not.toContain("scope=");
  });

  it("fetches receipts pending admin re-review into reReviewReceipts", async () => {
    apiFetch.mockResolvedValue(okJson([arrayFieldsReceipt], 1));

    const store = useReceiptStore();
    await store.fetchReReviewReceipts();

    const url = apiFetch.mock.calls[0][0];
    expect(url).toContain("status=pending-admin-re-review");
    expect(url).toContain("scope=all");
    expect(store.reReviewReceipts).toHaveLength(1);
  });

  it("finalizeReReview removes the receipt from the re-review queue", async () => {
    apiFetch.mockResolvedValue(okJson([arrayFieldsReceipt], 1));

    const store = useReceiptStore();
    await store.fetchReReviewReceipts();

    const queued = store.reReviewReceipts[0];
    const result = await store.finalizeReReview(
      queued.id,
      "approve",
      "Sufficient evidence provided.",
    );

    expect(result.status).toBe("Processed");
    expect(store.reReviewReceipts).toHaveLength(0);
  });

  it("patches and upserts the receipt returned by updateReceipt", async () => {
    const updated = {
      id: 5,
      file_path: "uploads/2026/upd.pdf",
      file_type: "application/pdf",
      file_size_bytes: 1024,
      file_hash: "upd-hash",
      transaction_date: "2026-04-01",
      total_amount: 500,
      vat_amount: 53.57,
      status: "processed",
      vendor_name: "Updated Vendor",
      invoice_number: "INV-005",
      category: { name: "Meals" },
      expense_category_id: 9,
      uploader: { name: "John Doe" },
      items: [],
    };

    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: updated }),
    });

    const store = useReceiptStore();
    store.receipts = [
      {
        id: "RCPT-2026-005",
        dbId: 5,
        amount: 0,
        categoryId: 1,
        vendorName: "Old Vendor",
      },
    ];

    const result = await store.updateReceipt(5, {
      vendor_name: "Updated Vendor",
      total_amount: 500,
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/serms/reimbursements/receipts/5");
    expect(opts.method).toBe("PATCH");
    expect(result.dbId).toBe(5);
    // Upsert replaced the existing receipt (same dbId) rather than unshifting.
    expect(store.receipts).toHaveLength(1);
    expect(store.receipts[0].vendorName).toBe("Updated Vendor");
  });

  it("throws a descriptive error when updateReceipt PATCH fails", async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "Validation failed" }),
    });

    const store = useReceiptStore();
    await expect(
      store.updateReceipt(1, { vendor_name: "X" }),
    ).rejects.toThrow("Validation failed");
  });

  it("appends status to the FormData when present in updateReceipt payload", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 7,
          file_path: "uploads/2026/upd.pdf",
          file_type: "application/pdf",
          file_size_bytes: 1024,
          file_hash: "upd-hash",
          status: "processed",
          vendor_name: "Updated Vendor",
          category: { name: "Meals" },
          expense_category_id: 9,
          uploader: { name: "John Doe" },
          items: [],
        },
      }),
    });

    const store = useReceiptStore();
    await store.updateReceipt(7, {
      vendor_name: "Updated Vendor",
      status: "processed",
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [, opts] = apiFetch.mock.calls[0];
    expect(opts.method).toBe("PATCH");
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get("status")).toBe("processed");
    expect(opts.body.get("vendor_name")).toBe("Updated Vendor");
  });

  it("orders visibleReceipts newest-uploaded-first (created_at desc)", async () => {
    // transaction_date and created_at deliberately disagree so a sort by
    // transaction_date would produce the WRONG order. The grid must follow
    // upload time (created_at), newest at the top.
    const oldestUpload = {
      id: 10,
      file_path: "receipts/old.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      file_hash: "old-hash",
      transaction_date: "2026-06-01", // newest transaction date
      created_at: "2026-01-01T00:00:00.000Z", // oldest upload
      total_amount: 100,
      category: { name: "Meals" },
      expense_category_id: 1,
      status: "processed",
      vendor_name: "Old Vendor",
      invoice_number: "INV-OLD",
      uploader: { name: "John Doe" },
      items: [],
    };
    const newestUpload = {
      id: 11,
      file_path: "receipts/new.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      file_hash: "new-hash",
      transaction_date: "2026-01-01", // oldest transaction date
      created_at: "2026-06-01T00:00:00.000Z", // newest upload
      total_amount: 200,
      category: { name: "Meals" },
      expense_category_id: 1,
      status: "processed",
      vendor_name: "New Vendor",
      invoice_number: "INV-NEW",
      uploader: { name: "John Doe" },
      items: [],
    };
    const middleUpload = {
      id: 12,
      file_path: "receipts/mid.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      file_hash: "mid-hash",
      transaction_date: "2026-03-01",
      created_at: "2026-03-01T00:00:00.000Z",
      total_amount: 150,
      category: { name: "Meals" },
      expense_category_id: 1,
      status: "processed",
      vendor_name: "Mid Vendor",
      invoice_number: "INV-MID",
      uploader: { name: "John Doe" },
      items: [],
    };

    apiFetch.mockResolvedValue(
      okJson([oldestUpload, newestUpload, middleUpload], 3),
    );

    const store = useReceiptStore();
    await store.fetchAll();

    const orderedDbIds = store.visibleReceipts.map((r) => r.dbId);
    expect(orderedDbIds).toEqual([11, 12, 10]);
  });

  it("refreshReceipt GETs the receipt and Object.assigns into the existing local item", async () => {
    const refreshed = {
      id: 5,
      file_path: "uploads/2026/upd.pdf",
      file_type: "application/pdf",
      file_size_bytes: 1024,
      file_hash: "upd-hash",
      transaction_date: "2026-04-01",
      total_amount: 500,
      vat_amount: 53.57,
      status: "processed",
      vendor_name: "Refreshed Vendor",
      invoice_number: "INV-005",
      category: { name: "Meals" },
      expense_category_id: 9,
      uploader: { name: "John Doe" },
      items: [],
    };

    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: refreshed }),
    });

    const store = useReceiptStore();
    const local = {
      id: "RCPT-2026-005",
      dbId: 5,
      amount: 0,
      categoryId: 1,
      vendorName: "Old Vendor",
      status: "processing",
    };
    store.receipts = [local];

    const result = await store.refreshReceipt(5);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/serms/reimbursements/receipts/5");
    expect(opts.method).toBeUndefined(); // GET
    // refreshReceipt returns the SAME local item (mutated in place) rather than
    // a fresh copy, so the modal's props.receiptToEdit reference stays in sync.
    expect(result).toBe(store.receipts[0]);
    // The local item was updated in place with the fetched data.
    expect(store.receipts[0].vendorName).toBe("Refreshed Vendor");
    expect(store.receipts[0].status).toBe("processed");
  });

  it("refreshReceipt returns fetched data when no local item exists", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 8,
          file_path: "uploads/2026/new.pdf",
          file_type: "application/pdf",
          file_size_bytes: 1,
          file_hash: "h",
          transaction_date: "2026-04-01",
          total_amount: 1,
          status: "processed",
          vendor_name: "V",
          invoice_number: "INV-8",
          category: { name: "Meals" },
          expense_category_id: 1,
          uploader: { name: "John Doe" },
          items: [],
        },
      }),
    });

    const store = useReceiptStore();
    const result = await store.refreshReceipt(8);

    expect(store.receipts).toHaveLength(0);
    expect(result.dbId).toBe(8);
  });

  it("propagates a processing status from resubmitReceipt when OCR re-runs", async () => {
    const store = useReceiptStore();
    store.receipts = [
      {
        id: "RCPT-2026-020",
        dbId: 20,
        amount: 0,
        categoryId: 1,
        vendorName: "Old Vendor",
        status: "processed",
      },
    ];

    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 20,
          file_path: ["uploads/2026/re.png"],
          file_type: ["image/png"],
          file_size_bytes: [1024],
          file_hash: ["h"],
          status: "processing",
          vendor_name: "Old Vendor",
          category: { name: "Meals" },
          expense_category_id: 1,
          uploader: { name: "John Doe" },
          items: [],
        },
      }),
    });

    const file = new File([""], "re.png", { type: "image/png" });
    const result = await store.resubmitReceipt(
      "RCPT-2026-020",
      { vendor_name: "Old Vendor" },
      file,
    );

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/serms/reimbursements/receipts/20/resubmit");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get("file")).toBe(file);
    // The backend is authoritative: the local receipt reflects "processing",
    // not the hardcoded "processed" the store sends in the FormData.
    expect(result.status).toBe("processing");
    expect(store.receipts[0].status).toBe("processing");
  });

  it("propagates a duplicate-flagged status from resubmitReceipt", async () => {
    const store = useReceiptStore();
    store.receipts = [
      {
        id: "RCPT-2026-021",
        dbId: 21,
        amount: 0,
        categoryId: 1,
        vendorName: "Old Vendor",
        status: "processed",
      },
    ];

    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 21,
          file_path: ["uploads/2026/re.png"],
          file_type: ["image/png"],
          file_size_bytes: [1024],
          file_hash: ["h"],
          status: "rejected",
          rejection_code: "duplicate",
          ocr_flagged: true,
          vendor_name: "Old Vendor",
          category: { name: "Meals" },
          expense_category_id: 1,
          uploader: { name: "John Doe" },
          items: [],
        },
      }),
    });

    const file = new File([""], "re.png", { type: "image/png" });
    const result = await store.resubmitReceipt(
      "RCPT-2026-021",
      { vendor_name: "Old Vendor" },
      file,
    );

    expect(result.status).toBe("rejected");
    expect(result.complianceStatus).toBe("rejected");
    expect(result.ocrFlagged).toBe(true);
  });

  it("sorts visibleReceipts by price-desc when sort=price-desc is passed to fetchAll", async () => {
    // 3,000 has a newer createdAt than 4,000 to ensure createdAt default sort doesn't override price-desc
    const receipt3000 = {
      id: 30,
      file_path: "receipts/3000.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      file_hash: "hash-3000",
      transaction_date: "2026-08-10",
      created_at: "2026-08-10T10:00:00.000Z", // Newer upload
      total_amount: 3000,
      category: { name: "Meals" },
      expense_category_id: 1,
      status: "processed",
      vendor_name: "Vendor B",
      invoice_number: "INV-3000",
      uploader: { name: "John Doe" },
      items: [],
    };
    const receipt4000 = {
      id: 40,
      file_path: "receipts/4000.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      file_hash: "hash-4000",
      transaction_date: "2026-08-01",
      created_at: "2026-08-01T10:00:00.000Z", // Older upload
      total_amount: 4000,
      category: { name: "Meals" },
      expense_category_id: 1,
      status: "processed",
      vendor_name: "Vendor A",
      invoice_number: "INV-4000",
      uploader: { name: "John Doe" },
      items: [],
    };

    apiFetch.mockResolvedValue(okJson([receipt4000, receipt3000], 2));

    const store = useReceiptStore();
    await store.fetchAll({ sort: "price-desc" });

    const orderedAmounts = store.visibleReceipts.map((r) => r.amount);
    expect(orderedAmounts).toEqual([4000, 3000]);
  });

  it("sorts visibleReceipts by price-asc when sort=price-asc is passed to fetchAll", async () => {
    const receipt3000 = {
      id: 30,
      file_path: "receipts/3000.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      file_hash: "hash-3000",
      transaction_date: "2026-08-10",
      created_at: "2026-08-10T10:00:00.000Z",
      total_amount: 3000,
      category: { name: "Meals" },
      expense_category_id: 1,
      status: "processed",
      vendor_name: "Vendor B",
      invoice_number: "INV-3000",
      uploader: { name: "John Doe" },
      items: [],
    };
    const receipt4000 = {
      id: 40,
      file_path: "receipts/4000.pdf",
      file_type: "application/pdf",
      file_size_bytes: 100,
      file_hash: "hash-4000",
      transaction_date: "2026-08-01",
      created_at: "2026-08-01T10:00:00.000Z",
      total_amount: 4000,
      category: { name: "Meals" },
      expense_category_id: 1,
      status: "processed",
      vendor_name: "Vendor A",
      invoice_number: "INV-4000",
      uploader: { name: "John Doe" },
      items: [],
    };

    apiFetch.mockResolvedValue(okJson([receipt3000, receipt4000], 2));

    const store = useReceiptStore();
    await store.fetchAll({ sort: "price-asc" });

    const orderedAmounts = store.visibleReceipts.map((r) => r.amount);
    expect(orderedAmounts).toEqual([3000, 4000]);
  });

  describe("softDelete", () => {
    it("successfully soft-deletes a receipt by string id or dbId", async () => {
      apiFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ message: "Receipt deleted successfully." }),
      });

      const store = useReceiptStore();
      store.receipts = [
        {
          id: "RCPT-2026-005",
          dbId: 5,
          isDeleted: false,
        },
      ];

      await store.softDelete("RCPT-2026-005");

      expect(apiFetch).toHaveBeenCalledWith(
        "/api/serms/reimbursements/receipts/5",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(store.receipts[0].isDeleted).toBe(true);
    });

    it("throws an Error with 422 message when deleting receipt attached to reimbursement", async () => {
      const errorMessage = "Cannot delete a receipt that is attached to a reimbursement.";
      apiFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: errorMessage }),
      });

      const store = useReceiptStore();
      store.receipts = [
        {
          id: "RCPT-2026-005",
          dbId: 5,
          isDeleted: false,
        },
      ];

      await expect(store.softDelete("RCPT-2026-005")).rejects.toThrow(errorMessage);
      expect(store.receipts[0].isDeleted).toBe(false);
    });
  });
});
