// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import ReimbursementFormView from "@/views/ReimbursementFormView.vue";

const {
  routerPushMock,
  receiptsState,
  qualityRejectionState,
  clearQualityRejectionMock,
  addReceiptFilesMock,
  submitSegmentsMock,
  handleReceiptSelectMock,
} = vi.hoisted(() => {
  return {
    routerPushMock: vi.fn(),
    receiptsState: { value: [] },
    qualityRejectionState: { value: null },
    clearQualityRejectionMock: vi.fn(),
    addReceiptFilesMock: vi.fn(),
    submitSegmentsMock: vi.fn(),
    handleReceiptSelectMock: vi.fn(),
  };
});

vi.mock("@/stores/policy", () => ({
  usePolicyStore: () => ({ fetchAll: vi.fn() }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({ fetchCategories: vi.fn(), categories: [] }),
}));

vi.mock("@/stores/reimbursement", () => ({
  useReimbursementStore: () => ({ fetchOne: vi.fn() }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/composables/reimbursements/useReimbursementSubmit", () => ({
  useReimbursementSubmit: () => ({
    submitting: ref(false),
    submitReimbursement: vi.fn(),
    updateReimbursement: vi.fn(),
  }),
}));

vi.mock("@/composables/useUnsavedChanges", () => ({
  useUnsavedChanges: () => ({
    showConfirmModal: ref(false),
    handleConfirmLeave: vi.fn(),
    handleCancelLeave: vi.fn(),
    dismissWithConfirm: (cb) => cb(),
  }),
}));

vi.mock("@/utils/ocrErrors", () => ({
  isOcrOfflineFailure: () => false,
}));

vi.mock("@/composables/reimbursements/useReceiptUploads", () => ({
  useReceiptUploads: () => ({
    localReceipts: receiptsState,
    receiptDrag: ref(false),
    receiptInput: ref(null),
    handleReceiptDrop: vi.fn(),
    handleReceiptSelect: handleReceiptSelectMock,
    addReceiptFiles: addReceiptFilesMock,
    removeReceipt: vi.fn(),
    clearDraftReceipts: vi.fn(),
    qualityRejection: qualityRejectionState,
    clearQualityRejection: clearQualityRejectionMock,
    showSegmentedUpload: ref(false),
    continueAnyway: vi.fn(),
    submitWithForce: vi.fn(),
    submitSegments: submitSegmentsMock,
  }),
}));

vi.mock("vue-router", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRouter: () => ({
      push: routerPushMock,
      back: vi.fn(),
      replace: vi.fn(),
    }),
  };
});

function mountForm() {
  return mount(ReimbursementFormView, {
    props: { forwardedReceipts: [], id: null },
    global: {
      stubs: {
        ReimbursementFormHeader: true,
        ReceiptsManagementHeader: true,
        ScannedReceiptsList: true,
        MetaAndAttachments: true,
        ReimbursementSummaryPanel: true,
        SegmentedReceiptUpload: true,
        ConfirmModal: true,
        ReceiptQualityRejectionModal: {
          name: "ReceiptQualityRejectionModal",
          props: ["isOpen", "rejectionCode", "rejectionReason"],
          emits: ["close", "retake", "upload-segmented"],
          template: `<div class="quality-modal-stub" :data-open="isOpen" />`,
        },
        BaseToggleSwitch: true,
      },
    },
  });
}

describe("ReimbursementFormView — duplicate Upload New One cancel goes to /reimbursements", () => {
  beforeEach(() => {
    routerPushMock.mockClear();
    receiptsState.value = [];
    delete window.__serms_pending_files;
    sessionStorage.clear();
  });

  it("canceling file chooser with zero receipts navigates to /reimbursements", async () => {
    receiptsState.value = [];
    const wrapper = mountForm();
    const input = wrapper.find('input[type="file"]');
    expect(input.exists()).toBe(true);
    await input.trigger("cancel");
    expect(routerPushMock).toHaveBeenCalledWith("/reimbursements");
  });

  it("canceling file chooser with existing receipts stays on form", async () => {
    receiptsState.value = [
      { id: "1", amount: 100, date: "2026-09-01", categoryId: 1 },
    ];
    const wrapper = mountForm();
    const input = wrapper.find('input[type="file"]');
    await input.trigger("cancel");
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("does not render upload-receipt empty-state section when empty", () => {
    receiptsState.value = [];
    const wrapper = mountForm();
    const html = wrapper.html().toLowerCase();
    const text = wrapper.text();
    // Empty-state upload section removed per request — no recovery dropzone
    expect(html).not.toContain("reimbursement-empty-state");
    expect(text).not.toContain("Upload Receipts");
    expect(text).not.toContain("Drag and drop receipt images here");
  });

  it("wires @close on ReceiptQualityRejectionModal to clearQualityRejection and navigates to /reimbursements when no receipts remain", async () => {
    clearQualityRejectionMock.mockClear();
    receiptsState.value = [];
    qualityRejectionState.value = {
      receiptId: "temp-1",
      file: null,
      rejectionCode: "unreadable",
      rejectionReason: "Critical details unreadable.",
    };
    const wrapper = mountForm();
    await wrapper.vm.$nextTick();

    const modal = wrapper.findComponent({ name: "ReceiptQualityRejectionModal" });
    expect(modal.exists()).toBe(true);
    expect(modal.props("isOpen")).toBe(true);

    await modal.vm.$emit("close");
    expect(clearQualityRejectionMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith("/reimbursements");
    qualityRejectionState.value = null;
  });

  it("keeps user on ReimbursementFormView when @close fires on ReceiptQualityRejectionModal with existing receipts", async () => {
    clearQualityRejectionMock.mockClear();
    receiptsState.value = [
      { id: "1", amount: 100, date: "2026-09-01", categoryId: 1 },
    ];
    qualityRejectionState.value = {
      receiptId: "temp-2",
      file: null,
      rejectionCode: "blurry",
      rejectionReason: "Image is blurry.",
    };
    const wrapper = mountForm();
    await wrapper.vm.$nextTick();

    const modal = wrapper.findComponent({ name: "ReceiptQualityRejectionModal" });
    await modal.vm.$emit("close");
    expect(clearQualityRejectionMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).not.toHaveBeenCalled();
    qualityRejectionState.value = null;
  });

  it("falls back to addReceiptFiles when uploadMode is multi and 1 file is selected, and caps multi select at 6 files", async () => {
    addReceiptFilesMock.mockClear();
    submitSegmentsMock.mockClear();
    handleReceiptSelectMock.mockClear();

    receiptsState.value = [
      { id: "1", amount: 100, date: "2026-09-01", categoryId: 1, eventType: "Meals" },
    ];
    const wrapper = mountForm();

    // Trigger Multi Receipt mode via ReceiptsManagementHeader event
    wrapper.findComponent({ name: "ReceiptsManagementHeader" }).vm.$emit("open-segmented-upload");
    await wrapper.vm.$nextTick();

    const input = wrapper.find('input[type="file"]');
    const singleFile = new File(["1"], "one.jpg", { type: "image/jpeg" });
    Object.defineProperty(input.element, "files", {
      value: [singleFile],
      configurable: true,
    });
    await input.trigger("change");

    expect(addReceiptFilesMock).toHaveBeenCalledWith([singleFile]);
    expect(submitSegmentsMock).not.toHaveBeenCalled();

    // Subsequent normal select uses handleReceiptSelect because uploadMode reset to single
    Object.defineProperty(input.element, "files", {
      value: [singleFile],
      configurable: true,
    });
    await input.trigger("change");
    expect(handleReceiptSelectMock).toHaveBeenCalledTimes(1);

    // Multi-file selection > 6 caps at 6 and calls submitSegments
    addReceiptFilesMock.mockClear();
    submitSegmentsMock.mockClear();
    wrapper.findComponent({ name: "ReceiptsManagementHeader" }).vm.$emit("open-segmented-upload");
    await wrapper.vm.$nextTick();

    const eightFiles = Array.from({ length: 8 }, (_, idx) =>
      new File([`${idx}`], `f${idx}.jpg`, { type: "image/jpeg" }),
    );
    Object.defineProperty(input.element, "files", {
      value: eightFiles,
      configurable: true,
    });
    await input.trigger("change");

    expect(submitSegmentsMock).toHaveBeenCalledTimes(1);
    expect(submitSegmentsMock.mock.calls[0][0]).toHaveLength(6);
    expect(addReceiptFilesMock).not.toHaveBeenCalled();
  });
});
