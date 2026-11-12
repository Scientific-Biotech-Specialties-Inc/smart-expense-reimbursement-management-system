// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import ReimbursementFormView from "@/views/ReimbursementFormView.vue";

const { routerPushMock, receiptsState } = vi.hoisted(() => {
  return { routerPushMock: vi.fn(), receiptsState: { value: [] } };
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
        ReceiptQualityRejectionModal: true,
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
});
