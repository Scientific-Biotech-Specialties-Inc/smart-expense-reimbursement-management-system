// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import ReimbursementFormView from "@/views/ReimbursementFormView.vue";
import { createDefaultTemplateData } from "@/utils/sbsiReportTemplateUtils";

const { receiptsState, fetchOneMock, submitReimbursementMock } = vi.hoisted(() => ({
  receiptsState: { value: [] },
  fetchOneMock: vi.fn(),
  submitReimbursementMock: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: 10, name: "Juan Dela Cruz", position: "Field Engineer", department: "Operations" },
  }),
}));

vi.mock("@/stores/policy", () => ({
  usePolicyStore: () => ({ fetchAll: vi.fn() }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({ fetchCategories: vi.fn(), categories: [{ id: 1, name: "Meals" }] }),
}));

vi.mock("@/stores/reimbursement", () => ({
  useReimbursementStore: () => ({ fetchOne: fetchOneMock }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
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
    abortSessionReceipts: vi.fn(),
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

describe("ReimbursementFormView — SBSI Report Template Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    receiptsState.value = [
      {
        id: "rcpt-1",
        fileName: "receipt.pdf",
        merchantName: "Jollibee",
        category: "Meals",
        amount: 250,
        categoryId: "cat-1",
        eventType: "Client Meeting",
        date: "2026-10-01",
        isUploading: false,
      },
    ];
  });

  function mountView(id = null) {
    return mount(ReimbursementFormView, {
      props: { forwardedReceipts: [], id },
      global: {
        stubs: {
          ReimbursementFormHeader: true,
          ReceiptsManagementHeader: true,
          ScannedReceiptsList: true,
          ReimbursementSummaryPanel: true,
          SegmentedReceiptUpload: true,
          ReceiptQualityRejectionModal: true,
          ConfirmModal: true,
          SbsiReportPreviewModal: true,
        },
      },
    });
  }

  it("renders SbsiReportDocumentEditor in template mode and enables submit once required template fields are filled", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="sbsi-report-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="document-canvas"]').exists()).toBe(true);

    const submitBtn = wrapper.find("button.btn-cta");
    expect(submitBtn.attributes("disabled")).toBeDefined();

    await wrapper.find('[data-testid="field-purpose"]').setValue("Client site visit");
    await flushPromises();

    expect(submitBtn.attributes("disabled")).toBeUndefined();
    expect(wrapper.vm.reportFile).toBeNull();
    expect(wrapper.vm.reportTemplateData.purpose).toBe("Client site visit");
  });

  it("switches to manual mode and requires a manual file before enabling submit", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-testid="field-purpose"]').setValue("Client site visit");
    await flushPromises();
    const submitBtn = wrapper.find("button.btn-cta");
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="manual-upload"]').exists()).toBe(true);
    expect(wrapper.vm.reportTemplateData.mode).toBe("manual");
    expect(submitBtn.attributes("disabled")).toBeDefined();

    const file = new File(["pdf"], "manual-report.pdf", { type: "application/pdf" });
    const input = wrapper.find('[data-testid="manual-file-input"]');
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");
    await flushPromises();

    expect(wrapper.vm.reportFile).toBeInstanceOf(File);
    expect(wrapper.vm.reportFile.name).toBe("manual-report.pdf");
    expect(submitBtn.attributes("disabled")).toBeUndefined();
  });

  it("hydrates template mode on edit when report_template_data is present", async () => {
    const savedTemplate = createDefaultTemplateData("reimbursement", {
      user: { name: "Juan Dela Cruz", position: "Field Engineer", department: "Operations" },
      purpose: "Saved template purpose",
      recordId: 42,
    });
    fetchOneMock.mockResolvedValueOnce({
      id: 42,
      status: "revise",
      report_file_path: "reports/generated.pdf",
      report_template_data: savedTemplate,
      user_comment: "Check updated breakdown",
      receipts: [
        {
          id: 101,
          total_amount: 250,
          vat_classification: "vat",
          transaction_date: "2026-10-01",
          expense_category_id: 1,
          vendor_name: "Jollibee",
          items: [{ name: "Meal", quantity: 1, price: 250 }],
        },
      ],
    });

    const wrapper = mountView(42);
    await flushPromises();

    expect(wrapper.find('[data-testid="document-canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="field-purpose"]').element.value).toBe("Saved template purpose");
    expect(wrapper.vm.reportTemplateData.mode).toBe("template");
  });

  it("opens in manual mode on edit when only legacy report_file_path exists without report_template_data", async () => {
    fetchOneMock.mockResolvedValueOnce({
      id: 43,
      status: "revise",
      report_file_path: "reports/legacy-report.pdf",
      report_template_data: null,
      user_comment: "",
      receipts: [
        {
          id: 102,
          total_amount: 100,
          vat_classification: "vat",
          transaction_date: "2026-10-01",
          expense_category_id: 1,
          vendor_name: "Vendor",
          items: [{ name: "Item", quantity: 1, price: 100 }],
        },
      ],
    });

    const wrapper = mountView(43);
    await flushPromises();

    expect(wrapper.find('[data-testid="manual-upload"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="manual-file-name"]').text()).toBe("legacy-report.pdf");
    expect(wrapper.vm.reportTemplateData).toBeNull();
  });
});
