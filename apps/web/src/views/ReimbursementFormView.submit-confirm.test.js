// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import ReimbursementFormView from "@/views/ReimbursementFormView.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";

const { submitReimbursementMock, receiptsState } = vi.hoisted(() => {
  return {
    submitReimbursementMock: vi.fn().mockResolvedValue(true),
    receiptsState: { value: [] },
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

vi.mock("@/composables/useOcrMode", () => ({
  useOcrMode: () => ({ isMockOcr: ref(false), setMockMode: vi.fn() }),
}));

vi.mock("@/composables/reimbursements/useReimbursementSubmit", () => ({
  useReimbursementSubmit: () => ({
    submitting: ref(false),
    submitReimbursement: submitReimbursementMock,
    updateReimbursement: vi.fn().mockResolvedValue(true),
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
    handleReceiptSelect: vi.fn(),
    addReceiptFiles: vi.fn(),
    removeReceipt: vi.fn(),
    clearDraftReceipts: vi.fn(),
    qualityRejection: ref(null),
    clearQualityRejection: vi.fn(),
    showSegmentedUpload: ref(false),
    continueAnyway: vi.fn(),
    submitWithForce: vi.fn(),
    submitSegments: vi.fn(),
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("ReimbursementFormView — Submit Confirmation Modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    receiptsState.value = [
      {
        id: "rcpt-1",
        fileName: "test.pdf",
        merchantName: "Merchant",
        amount: 100,
        categoryId: "cat-1",
        eventType: "Client Meeting",
        date: "2026-10-01",
        isUploading: false,
      },
    ];
  });

  function mountForm() {
    return mount(ReimbursementFormView, {
      props: { forwardedReceipts: [], id: null },
      global: {
        stubs: {
          ReimbursementFormHeader: true,
          ReceiptsManagementHeader: true,
          ScannedReceiptsList: true,
          MetaAndAttachments: {
            template: "<div class='meta-stub'></div>",
            props: ["reportFile", "userComment"],
          },
          ReimbursementSummaryPanel: true,
          SegmentedReceiptUpload: true,
          ReceiptQualityRejectionModal: true,
          BaseToggleSwitch: true,
        },
      },
    });
  }

  it("opens confirmation modal when submit button is clicked instead of submitting immediately", async () => {
    const wrapper = mountForm();

    // Set report file so canProceed is true
    wrapper.vm.reportFile = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    await wrapper.vm.$nextTick();

    const submitBtn = wrapper.find("button.btn-cta");
    expect(submitBtn.exists()).toBe(true);
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    // Click submit button
    await submitBtn.trigger("click");

    // Submission should not have happened yet
    expect(submitReimbursementMock).not.toHaveBeenCalled();

    // Find the submit confirmation modal
    const confirmModals = wrapper.findAllComponents(ConfirmModal);
    const submitModal = confirmModals.find(
      (m) =>
        m.props("message")?.toLowerCase().includes("are you sure do you want to submit this request?") ||
        m.props("message")?.toLowerCase().includes("are you sure you want to submit this request?")
    );

    expect(submitModal).toBeDefined();
    expect(submitModal.props("isOpen")).toBe(true);
    expect(submitModal.props("confirmText")).toBe("Done");
    expect(submitModal.props("cancelText")).toBe("Cancel");
  });

  it("closes confirmation modal and does not submit if user cancels", async () => {
    const wrapper = mountForm();
    wrapper.vm.reportFile = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    await wrapper.vm.$nextTick();

    const submitBtn = wrapper.find("button.btn-cta");
    await submitBtn.trigger("click");

    const confirmModals = wrapper.findAllComponents(ConfirmModal);
    const submitModal = confirmModals.find(
      (m) =>
        m.props("message")?.toLowerCase().includes("are you sure do you want to submit this request?") ||
        m.props("message")?.toLowerCase().includes("are you sure you want to submit this request?")
    );

    // Cancel modal
    await submitModal.vm.$emit("close");
    await wrapper.vm.$nextTick();

    expect(submitReimbursementMock).not.toHaveBeenCalled();
    expect(submitModal.props("isOpen")).toBe(false);
  });

  it("submits the request when user clicks Done in confirmation modal", async () => {
    const wrapper = mountForm();
    wrapper.vm.reportFile = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    await wrapper.vm.$nextTick();

    const submitBtn = wrapper.find("button.btn-cta");
    await submitBtn.trigger("click");

    const confirmModals = wrapper.findAllComponents(ConfirmModal);
    const submitModal = confirmModals.find(
      (m) =>
        m.props("message")?.toLowerCase().includes("are you sure do you want to submit this request?") ||
        m.props("message")?.toLowerCase().includes("are you sure you want to submit this request?")
    );

    // Confirm modal
    await submitModal.vm.$emit("confirm");
    await wrapper.vm.$nextTick();

    expect(submitReimbursementMock).toHaveBeenCalled();
  });
});
