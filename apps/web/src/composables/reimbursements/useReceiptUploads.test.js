// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toRaw } from "vue";
import { mount } from "@vue/test-utils";
import { useReceiptUploads } from "./useReceiptUploads";

const { addToastMock } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ token: "fake-token" }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

function mountComposable(options = {}) {
  let result;
  const wrapper = mount({
    template: "<div />",
    setup() {
      result = useReceiptUploads(options);
      return {};
    },
  });
  return { wrapper, ...result };
}

describe("useReceiptUploads — smart multi-receipt split & fallback", () => {
  let blobCounter;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    blobCounter = 0;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => `blob:mock-${++blobCounter}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("delegates submitSegments with 1 file to addReceiptFiles single-file upload", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 101,
          status: "processed",
          vendor_name: "Solo Store",
          transaction_date: "2026-11-20",
          total_amount: 150,
          vat_amount: 16.07,
          vat_classification: "vat",
          invoice_number: "INV-101",
          tin: "123-456-789-000",
          location: "Makati",
          expense_category_id: 1,
        },
      }),
    });

    const { wrapper, submitSegments, localReceipts } = mountComposable({
      draftKey: "test_split_1file_fallback",
    });

    const file = new File(["img"], "solo.jpg", { type: "image/jpeg" });
    await submitSegments([file]);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/serms/reimbursements/receipts",
      expect.objectContaining({ method: "POST" }),
    );
    expect(localReceipts.value).toHaveLength(1);
    expect(localReceipts.value[0].id).toBe(101);
    expect(localReceipts.value[0].isMultiReceipt).toBeFalsy();
    wrapper.unmount();
  });

  it("caps submitSegments at 6 files when more than 6 are passed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: { id: 102, status: "processing" },
      }),
    });

    const { wrapper, submitSegments, localReceipts } = mountComposable({
      draftKey: "test_split_6cap",
    });

    const files = Array.from({ length: 8 }, (_, idx) =>
      new File([`p${idx}`], `seg-${idx}.jpg`, { type: "image/jpeg" }),
    );
    await submitSegments(files);

    const [, fetchInit] = globalThis.fetch.mock.calls[0];
    const sentFiles = fetchInit.body.getAll("files[]");
    expect(sentFiles).toHaveLength(6);
    expect(localReceipts.value[0].images).toHaveLength(6);
    wrapper.unmount();
  });

  it("preserves 1 long receipt card unchanged when polling returns no split_receipts", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: { id: 201, status: "processing" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 201,
            status: "processed",
            vendor_name: "Long Mart",
            transaction_date: "2026-11-20",
            total_amount: 850,
            vat_amount: 91.07,
            vat_classification: "vat",
            invoice_number: "OR-201",
            tin: "111-222-333-000",
            location: "BGC",
            expense_category_id: 2,
            file_url: ["https://cdn/p1.jpg", "https://cdn/p2.jpg"],
          },
        }),
      });

    const { wrapper, submitSegments, localReceipts } = mountComposable({
      draftKey: "test_long_receipt_unchanged",
    });

    const files = [
      new File(["1"], "top.jpg", { type: "image/jpeg" }),
      new File(["2"], "bottom.jpg", { type: "image/jpeg" }),
    ];
    await submitSegments(files);
    expect(localReceipts.value).toHaveLength(1);
    expect(localReceipts.value[0].isProcessing).toBe(true);

    await vi.advanceTimersByTimeAsync(3100);

    expect(localReceipts.value).toHaveLength(1);
    expect(localReceipts.value[0].id).toBe(201);
    expect(localReceipts.value[0].merchantName).toBe("Long Mart");
    expect(localReceipts.value[0].isMultiReceipt).toBe(true);
    expect(localReceipts.value[0].images).toHaveLength(2);
    expect(localReceipts.value[0].isProcessing).toBe(false);
    expect(addToastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "info" }),
    );
    wrapper.unmount();
  });

  it("expands split_receipts using segment_indices, shows info toast, and isolates single vs multi images", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: { id: 301, status: "processing" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 301,
            status: "processed",
            vendor_name: "Jollibee",
            transaction_date: "2026-11-20",
            total_amount: 245,
            vat_amount: 26.25,
            vat_classification: "vat",
            invoice_number: "OR-301",
            tin: "123-456-789-000",
            location: "Makati",
            expense_category_id: 1,
            segment_indices: [0, 1],
            file_path: ["receipts/a.jpg", "receipts/b.jpg"],
            split_receipts: [
              {
                id: 302,
                status: "processed",
                vendor_name: "Mercury Drug",
                transaction_date: "2026-11-21",
                total_amount: 510,
                vat_amount: 54.64,
                vat_classification: "vat",
                invoice_number: "SI-302",
                tin: "987-654-321-000",
                location: "Pasig",
                expense_category_id: 3,
                segment_indices: [2],
                file_path: ["receipts/c.jpg"],
              },
            ],
          },
        }),
      });

    const { wrapper, submitSegments, localReceipts } = mountComposable({
      draftKey: "test_split_mixed_batch",
    });

    const f0 = new File(["0"], "long-top.jpg", { type: "image/jpeg" });
    const f1 = new File(["1"], "long-bottom.jpg", { type: "image/jpeg" });
    const f2 = new File(["2"], "mercury.jpg", { type: "image/jpeg" });
    await submitSegments([f0, f1, f2]);

    await vi.advanceTimersByTimeAsync(3100);

    expect(addToastMock).toHaveBeenCalledWith({
      message: "Detected 2 separate receipts — split into individual receipt cards.",
      type: "info",
    });
    expect(localReceipts.value).toHaveLength(2);

    const [card0, card1] = localReceipts.value;
    expect(card0.id).toBe(301);
    expect(card0.merchantName).toBe("Jollibee");
    expect(card0.isMultiReceipt).toBe(true);
    expect(card0.images).toHaveLength(2);
    expect(toRaw(card0.sourceFile)).toBe(f0);
    expect(card0.thumbnail).toBe("blob:mock-1");
    expect(card0.isProcessing).toBe(false);
    expect(card0.isUploading).toBe(false);

    expect(card1.id).toBe(302);
    expect(card1.merchantName).toBe("Mercury Drug");
    expect(card1.isMultiReceipt).toBe(false);
    expect(card1.images).toBeUndefined();
    expect(toRaw(card1.sourceFile)).toBe(f2);
    expect(card1.thumbnail).toBe("blob:mock-3");
    expect(card1.isProcessing).toBe(false);
    expect(card1.isUploading).toBe(false);
    wrapper.unmount();
  });

  it("falls back to sequential file_path length slicing when segment_indices is absent", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 401, status: "processing" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 401,
            status: "processed",
            vendor_name: "Alpha",
            transaction_date: "2026-11-20",
            total_amount: 100,
            invoice_number: "A-1",
            tin: "111-111-111-000",
            location: "Manila",
            expense_category_id: 1,
            file_path: ["a.jpg"],
            split_receipts: [
              {
                id: 402,
                status: "processed",
                vendor_name: "Beta",
                transaction_date: "2026-11-20",
                total_amount: 200,
                invoice_number: "B-1",
                tin: "222-222-222-000",
                location: "Manila",
                expense_category_id: 1,
                file_path: ["b1.jpg", "b2.jpg"],
              },
            ],
          },
        }),
      });

    const { wrapper, submitSegments, localReceipts } = mountComposable({
      draftKey: "test_split_seq_fallback",
    });

    const f0 = new File(["0"], "a.jpg", { type: "image/jpeg" });
    const f1 = new File(["1"], "b1.jpg", { type: "image/jpeg" });
    const f2 = new File(["2"], "b2.jpg", { type: "image/jpeg" });
    await submitSegments([f0, f1, f2]);

    await vi.advanceTimersByTimeAsync(3100);

    expect(localReceipts.value).toHaveLength(2);
    expect(localReceipts.value[0].isMultiReceipt).toBe(false);
    expect(toRaw(localReceipts.value[0].sourceFile)).toBe(f0);
    expect(localReceipts.value[1].isMultiReceipt).toBe(true);
    expect(localReceipts.value[1].images).toHaveLength(2);
    expect(toRaw(localReceipts.value[1].sourceFile)).toBe(f1);
    wrapper.unmount();
  });

  it("isolates Group 0 rejection before early return, revokes only Group 0 blobs, and keeps Group 1 valid", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 501, status: "processing" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 501,
            status: "rejected",
            rejection_code: "blurry",
            rejection_reason: "First receipt is too blurry.",
            segment_indices: [0],
            file_path: ["blurry.jpg"],
            split_receipts: [
              {
                id: 502,
                status: "processed",
                vendor_name: "Valid Sibling",
                transaction_date: "2026-11-20",
                total_amount: 320,
                vat_amount: 34.29,
                vat_classification: "vat",
                invoice_number: "V-502",
                tin: "123-456-789-000",
                location: "Cebu",
                expense_category_id: 2,
                segment_indices: [1],
                file_path: ["valid.jpg"],
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const { wrapper, submitSegments, localReceipts, qualityRejection } = mountComposable({
      draftKey: "test_isolated_group0_reject",
    });

    const blurryFile = new File(["bad"], "blurry.jpg", { type: "image/jpeg" });
    const validFile = new File(["good"], "valid.jpg", { type: "image/jpeg" });
    await submitSegments([blurryFile, validFile]);

    await vi.advanceTimersByTimeAsync(3100);

    expect(localReceipts.value).toHaveLength(1);
    expect(localReceipts.value[0].id).toBe(502);
    expect(localReceipts.value[0].merchantName).toBe("Valid Sibling");
    expect(localReceipts.value[0].thumbnail).toBe("blob:mock-2");

    expect(qualityRejection.value).toMatchObject({
      receiptId: 501,
      file: blurryFile,
      rejectionCode: "blurry",
      rejectionReason: "First receipt is too blurry.",
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:mock-2");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/serms/reimbursements/receipts/501",
      expect.objectContaining({ method: "DELETE" }),
    );
    wrapper.unmount();
  });

  it("handles multiple split rejections with shifting indices while keeping valid middle card", async () => {
    vi.useFakeTimers();
    const dupEvents = [];
    const onDup = (e) => dupEvents.push(e.detail);
    window.addEventListener("receipt-duplicate-detected", onDup);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 601, status: "processing" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 601,
            status: "rejected",
            rejection_code: "duplicate",
            rejection_reason: "Duplicate receipt detected.",
            segment_indices: [0],
            file_path: ["dup.jpg"],
            split_receipts: [
              {
                id: 602,
                status: "processed",
                vendor_name: "Middle Valid",
                transaction_date: "2026-11-20",
                total_amount: 400,
                invoice_number: "MV-1",
                tin: "111-222-333-000",
                location: "Davao",
                expense_category_id: 1,
                segment_indices: [1],
                file_path: ["mid.jpg"],
              },
              {
                id: 603,
                status: "rejected",
                rejection_code: "faded",
                rejection_reason: "Third receipt ink is faded.",
                segment_indices: [2],
                file_path: ["faded.jpg"],
              },
            ],
          },
        }),
      })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const { wrapper, submitSegments, localReceipts, qualityRejection } = mountComposable({
      draftKey: "test_multi_split_rejects",
    });

    await submitSegments([
      new File(["0"], "dup.jpg", { type: "image/jpeg" }),
      new File(["1"], "mid.jpg", { type: "image/jpeg" }),
      new File(["2"], "faded.jpg", { type: "image/jpeg" }),
    ]);

    await vi.advanceTimersByTimeAsync(3100);

    expect(localReceipts.value).toHaveLength(1);
    expect(localReceipts.value[0].id).toBe(602);
    expect(localReceipts.value[0].merchantName).toBe("Middle Valid");
    expect(dupEvents).toHaveLength(1);
    expect(dupEvents[0].receiptId).toBe(601);
    expect(qualityRejection.value).toMatchObject({
      receiptId: 603,
      rejectionCode: "faded",
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-3");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:mock-2");

    window.removeEventListener("receipt-duplicate-detected", onDup);
    wrapper.unmount();
  });

  it("deletes backend draft receipt when an in-flight upload resolves after abortSessionReceipts", async () => {
    let resolveUpload;
    const uploadPromise = new Promise((resolve) => {
      resolveUpload = resolve;
    });

    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(() => uploadPromise)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const { wrapper, addReceiptFiles, abortSessionReceipts, localReceipts } =
      mountComposable({ draftKey: "test_inflight_abort" });

    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
    const pendingAdd = addReceiptFiles([file]);

    expect(localReceipts.value).toHaveLength(1);
    await abortSessionReceipts();
    expect(localReceipts.value).toHaveLength(0);

    resolveUpload({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 999,
          status: "processed",
          vendor_name: "Late Store",
        },
      }),
    });

    await pendingAdd;

    expect(localReceipts.value).toHaveLength(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/serms/reimbursements/receipts/999",
      expect.objectContaining({ method: "DELETE" }),
    );

    wrapper.unmount();
  });
});
