// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  const wrapper = mount(
    {
      template: "<div />",
      setup() {
        result = useReceiptUploads(options);
        return {};
      },
    },
  );
  return { wrapper, ...result };
}

describe("useReceiptUploads — non-overridable rejection & auto-purge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("auto-purges temp receipt and sets qualityRejection on HTTP 422 non-duplicate rejection", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        rejection_code: "unreadable",
        rejection_reason: "Critical fields (Total Amount) could not be read.",
      }),
    });

    const { wrapper, addReceiptFiles, localReceipts, qualityRejection } = mountComposable({
      draftKey: "test_purge_422",
    });

    const file = new File(["img"], "broken.jpg", { type: "image/jpeg" });
    await addReceiptFiles([file]);

    expect(localReceipts.value).toHaveLength(0);
    expect(qualityRejection.value).toMatchObject({
      file,
      rejectionCode: "unreadable",
      rejectionReason: "Critical fields (Total Amount) could not be read.",
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("auto-purges persisted rejected receipt from form and backend DELETE on initial 201 status='rejected'", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 505,
            status: "rejected",
            rejection_code: "faded",
            rejection_reason: "Receipt ink is too faded.",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

    const { wrapper, addReceiptFiles, localReceipts, qualityRejection } = mountComposable({
      draftKey: "test_purge_201",
    });

    const file = new File(["img"], "faded.jpg", { type: "image/jpeg" });
    await addReceiptFiles([file]);

    expect(localReceipts.value).toHaveLength(0);
    expect(qualityRejection.value).toMatchObject({
      receiptId: 505,
      rejectionCode: "faded",
      rejectionReason: "Receipt ink is too faded.",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/serms/reimbursements/receipts/505",
      expect.objectContaining({ method: "DELETE" }),
    );
    wrapper.unmount();
  });

  it("auto-purges persisted duplicate receipt and dispatches receipt-duplicate-detected", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 606,
            status: "rejected",
            rejection_code: "duplicate",
            rejection_reason: "Duplicate receipt detected.",
          },
        }),
      })
      .mockRejectedValueOnce(new Error("non-fatal delete error"));

    const dupEvents = [];
    const onDup = (e) => dupEvents.push(e.detail);
    window.addEventListener("receipt-duplicate-detected", onDup);

    const { wrapper, addReceiptFiles, localReceipts, qualityRejection } = mountComposable({
      draftKey: "test_purge_dup",
    });

    const file = new File(["img"], "dup.jpg", { type: "image/jpeg" });
    await addReceiptFiles([file]);

    expect(localReceipts.value).toHaveLength(0);
    expect(qualityRejection.value).toBeNull();
    expect(dupEvents).toHaveLength(1);
    expect(dupEvents[0].receiptId).toBe(606);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/serms/reimbursements/receipts/606",
      expect.objectContaining({ method: "DELETE" }),
    );

    window.removeEventListener("receipt-duplicate-detected", onDup);
    wrapper.unmount();
  });

  it("auto-purges segmented upload on 422 or 201 rejected", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 707,
            status: "rejected",
            rejection_code: "unreadable",
            rejection_reason: "Segments were unreadable.",
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const { wrapper, submitSegments, localReceipts, qualityRejection } = mountComposable({
      draftKey: "test_purge_seg",
    });

    const files = [
      new File(["1"], "seg1.jpg", { type: "image/jpeg" }),
      new File(["2"], "seg2.jpg", { type: "image/jpeg" }),
    ];
    await submitSegments(files);

    expect(localReceipts.value).toHaveLength(0);
    expect(qualityRejection.value).toMatchObject({
      receiptId: 707,
      rejectionCode: "unreadable",
      rejectionReason: "Segments were unreadable.",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/serms/reimbursements/receipts/707",
      expect.objectContaining({ method: "DELETE" }),
    );
    wrapper.unmount();
  });

  it("auto-purges receipt when polling transitions from processing to rejected", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: { id: 808, status: "processing" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 808,
            status: "rejected",
            rejection_code: "unreadable",
            rejection_reason: "Post-OCR text unreadable.",
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const { wrapper, addReceiptFiles, localReceipts, qualityRejection } = mountComposable({
      draftKey: "test_purge_poll",
    });

    const file = new File(["img"], "poll.jpg", { type: "image/jpeg" });
    await addReceiptFiles([file]);
    expect(localReceipts.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(3100);

    expect(localReceipts.value).toHaveLength(0);
    expect(qualityRejection.value).toMatchObject({
      receiptId: 808,
      rejectionCode: "unreadable",
      rejectionReason: "Post-OCR text unreadable.",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/serms/reimbursements/receipts/808",
      expect.objectContaining({ method: "DELETE" }),
    );
    wrapper.unmount();
  });

  it("keeps OCR-offline failed receipts in localReceipts with toast and does NOT purge or open qualityRejection", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 909,
          status: "failed",
          rejection_code: "ocr_failed",
          rejection_reason: "OCR processing failed. You can retry OCR.",
        },
      }),
    });

    const { wrapper, addReceiptFiles, localReceipts, qualityRejection } = mountComposable({
      draftKey: "test_ocr_offline",
    });

    const file = new File(["img"], "offline.jpg", { type: "image/jpeg" });
    await addReceiptFiles([file]);

    expect(localReceipts.value).toHaveLength(1);
    expect(qualityRejection.value).toBeNull();
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("continueAnyway and submitWithForce only clear qualityRejection without overriding", () => {
    const {
      wrapper,
      qualityRejection,
      localReceipts,
      continueAnyway,
      submitWithForce,
    } = mountComposable({
      draftKey: "test_no_override",
    });

    localReceipts.value = [{ id: 123, isRejected: true }];
    qualityRejection.value = { receiptId: 123, rejectionCode: "blurry", rejectionReason: "Blurry" };

    continueAnyway();
    expect(qualityRejection.value).toBeNull();
    expect(localReceipts.value[0].isRejected).toBe(true);
    expect(localReceipts.value[0].isQualityOverridden).toBeUndefined();

    qualityRejection.value = { receiptId: 123, rejectionCode: "unreadable", rejectionReason: "Unreadable" };
    submitWithForce();
    expect(qualityRejection.value).toBeNull();
    wrapper.unmount();
  });
});
