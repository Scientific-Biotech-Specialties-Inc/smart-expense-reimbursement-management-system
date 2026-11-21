// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import FileUpload from "./FileUpload.vue";

const { apiFetchMock, addToastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  addToastMock: vi.fn(),
}));

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

function mountFileUpload(initialReceipts = []) {
  const receipts = ref(initialReceipts);
  const wrapper = mount(
    {
      components: { FileUpload },
      setup: () => ({ receipts }),
      template: `<FileUpload v-model="receipts" />`,
    },
    {
      global: {
        stubs: {
          ConfirmModal: true,
          ReceiptQualityRejectionModal: {
            name: "ReceiptQualityRejectionModal",
            props: ["isOpen", "rejectionCode", "rejectionReason"],
            template: `<div class="quality-modal-stub" :data-open="isOpen" :data-code="rejectionCode">{{ rejectionReason }}</div>`,
          },
        },
      },
    },
  );
  return { wrapper, receipts, fileUpload: wrapper.findComponent(FileUpload) };
}

describe("FileUpload — Liquidation smart multi-receipt split", () => {
  let blobCounter;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    blobCounter = 0;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => `blob:liq-${++blobCounter}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps 1 long receipt entry unchanged when polling returns no split_receipts", async () => {
    vi.useFakeTimers();
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: { id: 1001, status: "processing" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 1001,
            status: "processed",
            vendor_name: "Long Supermarket",
            transaction_date: "2026-11-20",
            total_amount: 1250,
            vat_amount: 133.93,
            vat_classification: "vat",
            invoice_number: "OR-1001",
            tin: "123-456-789-000",
            location: "Makati",
            expense_category_id: 1,
          },
        }),
      });

    const { wrapper, receipts, fileUpload } = mountFileUpload();
    const f1 = new File(["1"], "part1.jpg", { type: "image/jpeg" });
    const f2 = new File(["2"], "part2.jpg", { type: "image/jpeg" });

    fileUpload.vm.processFiles([f1, f2], "multi");
    await flushPromises();
    expect(receipts.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();
    await nextTick();

    expect(receipts.value).toHaveLength(1);
    expect(receipts.value[0].id).toBe(1001);
    expect(receipts.value[0].ocrStatus).toBe("done");
    expect(receipts.value[0].pages).toHaveLength(2);
    expect(receipts.value[0].previews).toHaveLength(2);
    expect(addToastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "info" }),
    );
    wrapper.unmount();
  });

  it("expands split_receipts into individual entries, partitions pages/previews, and shows info toast", async () => {
    vi.useFakeTimers();
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: { id: 2001, status: "processing" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 2001,
            status: "processed",
            vendor_name: "Vendor One",
            transaction_date: "2026-11-20",
            total_amount: 300,
            vat_amount: 32.14,
            vat_classification: "vat",
            invoice_number: "INV-2001",
            tin: "111-222-333-000",
            location: "Manila",
            expense_category_id: 1,
            segment_indices: [0, 1],
            file_path: ["r1a.jpg", "r1b.jpg"],
            split_receipts: [
              {
                id: 2002,
                status: "processed",
                vendor_name: "Vendor Two",
                transaction_date: "2026-11-21",
                total_amount: 450,
                vat_amount: 48.21,
                vat_classification: "vat",
                invoice_number: "INV-2002",
                tin: "444-555-666-000",
                location: "Quezon City",
                expense_category_id: 2,
                segment_indices: [2],
                file_path: ["r2.jpg"],
              },
            ],
          },
        }),
      });

    const { wrapper, receipts, fileUpload } = mountFileUpload();
    const f0 = new File(["aa"], "r1a.jpg", { type: "image/jpeg" });
    const f1 = new File(["bbb"], "r1b.jpg", { type: "image/jpeg" });
    const f2 = new File(["cccc"], "r2.jpg", { type: "image/jpeg" });

    fileUpload.vm.processFiles([f0, f1, f2], "multi");
    await flushPromises();
    expect(receipts.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();
    await nextTick();

    expect(addToastMock).toHaveBeenCalledWith({
      message: "Detected 2 separate receipts — split into individual receipt cards.",
      type: "info",
    });

    expect(receipts.value).toHaveLength(2);
    const [e0, e1] = receipts.value;

    expect(e0.id).toBe(2001);
    expect(e0.ocrStatus).toBe("done");
    expect(e0.merchantName).toBe("Vendor One");
    expect(e0.pages).toEqual([f0, f1]);
    expect(e0.previews).toEqual(["blob:liq-1", "blob:liq-2"]);
    expect(e0.name).toBe("Multi-page Receipt (2 pages)");
    expect(e0.size).toBe(f0.size + f1.size);

    expect(e1.id).toBe(2002);
    expect(e1.ocrStatus).toBe("done");
    expect(e1.merchantName).toBe("Vendor Two");
    expect(e1.pages).toEqual([f2]);
    expect(e1.previews).toEqual(["blob:liq-3"]);
    expect(e1.name).toBe("r2.jpg");
    expect(e1.size).toBe(f2.size);

    const emittedModels = fileUpload.emitted("update:modelValue") || [];
    expect(emittedModels.length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it("isolates rejected Group 0 and duplicate Group 2 while preserving valid Group 1", async () => {
    vi.useFakeTimers();
    const dupEvents = [];
    const onDup = (e) => dupEvents.push(e.detail);
    window.addEventListener("receipt-duplicate-detected", onDup);

    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 3001, status: "processing" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 3001,
            status: "rejected",
            rejection_code: "blurry",
            rejection_reason: "Group 0 image is too blurry.",
            segment_indices: [0],
            file_path: ["bad0.jpg"],
            split_receipts: [
              {
                id: 3002,
                status: "processed",
                vendor_name: "Good Middle Receipt",
                transaction_date: "2026-11-20",
                total_amount: 600,
                vat_amount: 64.29,
                vat_classification: "vat",
                invoice_number: "OR-3002",
                tin: "123-456-789-000",
                location: "Taguig",
                expense_category_id: 1,
                segment_indices: [1],
                file_path: ["good1.jpg"],
              },
              {
                id: 3003,
                status: "rejected",
                rejection_code: "duplicate",
                rejection_reason: "Duplicate receipt detected.",
                segment_indices: [2],
                file_path: ["dup2.jpg"],
              },
            ],
          },
        }),
      })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const { wrapper, receipts, fileUpload } = mountFileUpload();
    const f0 = new File(["0"], "bad0.jpg", { type: "image/jpeg" });
    const f1 = new File(["1"], "good1.jpg", { type: "image/jpeg" });
    const f2 = new File(["2"], "dup2.jpg", { type: "image/jpeg" });

    fileUpload.vm.processFiles([f0, f1, f2], "multi");
    await flushPromises();

    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();
    await nextTick();

    expect(receipts.value).toHaveLength(1);
    expect(receipts.value[0].id).toBe(3002);
    expect(receipts.value[0].merchantName).toBe("Good Middle Receipt");
    expect(receipts.value[0].ocrStatus).toBe("done");
    expect(receipts.value[0].previews).toEqual(["blob:liq-2"]);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:liq-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:liq-3");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:liq-2");

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/serms/reimbursements/receipts/3001",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/serms/reimbursements/receipts/3003",
      expect.objectContaining({ method: "DELETE" }),
    );

    expect(dupEvents).toHaveLength(1);
    expect(dupEvents[0].receiptId).toBe(3003);
    expect(wrapper.find(".quality-modal-stub").attributes("data-open")).toBe("true");
    expect(wrapper.find(".quality-modal-stub").attributes("data-code")).toBe("blurry");

    const uploadErrors = fileUpload.emitted("upload-error") || [];
    expect(uploadErrors).toHaveLength(2);
    expect(uploadErrors.map((e) => e[0].type)).toEqual(["quality", "duplicate"]);

    window.removeEventListener("receipt-duplicate-detected", onDup);
    wrapper.unmount();
  });

  it("isolates failed OCR status on one split entry while hydrating valid siblings", async () => {
    vi.useFakeTimers();
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 4001, status: "processing" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 4001,
            status: "processed",
            vendor_name: "Valid One",
            transaction_date: "2026-11-20",
            total_amount: 100,
            invoice_number: "OR-1",
            tin: "111-111-111-000",
            location: "Manila",
            expense_category_id: 1,
            file_path: ["ok.jpg"],
            split_receipts: [
              {
                id: 4002,
                status: "failed",
                rejection_code: "ocr_failed",
                rejection_reason: "OCR processing failed. You can retry OCR.",
                file_path: ["err.jpg"],
              },
            ],
          },
        }),
      });

    const { wrapper, receipts, fileUpload } = mountFileUpload();
    fileUpload.vm.processFiles(
      [
        new File(["ok"], "ok.jpg", { type: "image/jpeg" }),
        new File(["err"], "err.jpg", { type: "image/jpeg" }),
      ],
      "multi",
    );
    await flushPromises();

    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();
    await nextTick();

    expect(receipts.value).toHaveLength(2);
    expect(receipts.value[0].ocrStatus).toBe("done");
    expect(receipts.value[1].id).toBe(4002);
    expect(receipts.value[1].ocrStatus).toBe("failed");
    expect(receipts.value[1].rejectionCode).toBe("ocr_failed");
    const uploadErrors = fileUpload.emitted("upload-error") || [];
    expect(uploadErrors).toHaveLength(1);
    expect(uploadErrors[0][0].type).toBe("failed");
    wrapper.unmount();
  });
});
