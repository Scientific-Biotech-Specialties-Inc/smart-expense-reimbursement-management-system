// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import ReimbursementFormView from "@/views/ReimbursementFormView.vue";
import { createDefaultTemplateData } from "@/utils/sbsiReportTemplateUtils";

const { fetchOneMock, localReceiptsState, updateMock } = vi.hoisted(() => ({
  fetchOneMock: vi.fn(),
  localReceiptsState: { ref: null },
  updateMock: vi.fn(),
}));

vi.mock("@/stores/policy", () => ({
  usePolicyStore: () => ({
    fetchAll: vi.fn(),
    categories: [],
    activePolicy: null,
  }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({
    fetchCategories: vi.fn(),
    categories: [
      { id: 1, name: "Meals" },
      { id: 2, name: "Travel" },
    ],
  }),
}));

vi.mock("@/stores/reimbursement", () => ({
  useReimbursementStore: () => ({
    fetchOne: fetchOneMock,
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: {
      id: 10,
      name: "Juan Dela Cruz",
      department: "Operations",
      signature: "data:image/png;base64,sig",
    },
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
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

vi.mock("@/composables/reimbursements/useReimbursementSubmit", () => ({
  useReimbursementSubmit: () => ({
    submitting: ref(false),
    submitReimbursement: vi.fn(),
    updateReimbursement: updateMock,
  }),
}));

vi.mock("@/composables/reimbursements/useReceiptUploads", async () => {
  const { ref: vueRef } = await import("vue");
  localReceiptsState.ref = vueRef([]);
  return {
    useReceiptUploads: () => ({
      localReceipts: localReceiptsState.ref,
      receiptDrag: vueRef(false),
      receiptInput: vueRef(null),
      handleReceiptDrop: vi.fn(),
      handleReceiptSelect: vi.fn(),
      addReceiptFiles: vi.fn(),
      removeReceipt: (id) => {
        localReceiptsState.ref.value = localReceiptsState.ref.value.filter(
          (r) => r.id !== id,
        );
      },
      clearDraftReceipts: vi.fn(),
      qualityRejection: vueRef(null),
      clearQualityRejection: vi.fn(),
      showSegmentedUpload: vueRef(false),
      continueAnyway: vi.fn(),
      submitWithForce: vi.fn(),
      submitSegments: vi.fn(),
    }),
  };
});

vi.mock("vue-router", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      back: vi.fn(),
      replace: vi.fn(),
    }),
  };
});

function buildServerReimbursement(overrides = {}) {
  const defaultTemplate = createDefaultTemplateData("reimbursement", {
    user: {
      id: 10,
      name: "Juan Dela Cruz",
      department: "Operations",
      signature: "data:image/png;base64,sig",
    },
    receipts: [
      {
        id: 101,
        category: "Meals",
        vendor_name: "Jollibee",
        total_amount: 500,
        date: "2026-09-01",
      },
    ],
    purpose: "Team Lunch",
    recordId: 42,
  });
  defaultTemplate.additionalNotes = "Initial remarks";
  defaultTemplate.mode = "template";

  return {
    id: 42,
    status: "revise",
    admin_notes: "Please correct vendor TIN and remarks",
    revision_count: 1,
    user_comment: "Original comment",
    expense_category_id: 1,
    event_type: "meal",
    report_file_path: null,
    report_template_data: defaultTemplate,
    receipts: [
      {
        id: 101,
        vendor_name: "Jollibee",
        transaction_date: "2026-09-01",
        total_amount: 500,
        subtotal: 446.43,
        vat_amount: 53.57,
        vat_classification: "vat",
        tin: "123-456-789-000",
        invoice_number: "INV-001",
        location: "Makati",
        expense_category_id: 1,
        category: { id: 1, name: "Meals" },
        event_type: "meal",
        file_path: "receipts/101.jpg",
        items: [{ name: "Chickenjoy", quantity: 2, price: 250 }],
      },
    ],
    ...overrides,
  };
}

const mountedWrappers = [];

function mountForm(options = {}) {
  const w = mount(ReimbursementFormView, {
    props: { forwardedReceipts: [], id: "42" },
    global: {
      stubs: {
        ReimbursementFormHeader: true,
        ReceiptsManagementHeader: true,
        ReimbursementSummaryPanel: true,
        SegmentedReceiptUpload: true,
        ConfirmModal: true,
        ReceiptQualityRejectionModal: true,
        BaseSignaturePad: true,
        SbsiReportPreviewModal: true,
        ReceiptImagePreview: true,
        ...(options.stubs || {}),
      },
    },
  });
  mountedWrappers.push(w);
  return w;
}

function findSubmitButton(wrapper) {
  return wrapper.find("button.btn-cta");
}

describe("ReimbursementFormView — revise submit button stays disabled until changed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (localReceiptsState.ref) {
      localReceiptsState.ref.value = [];
    }
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop().unmount();
    }
  });

  it("keeps Update & Resubmit disabled immediately after hydrating a revise request (with real child editors)", async () => {
    fetchOneMock.mockResolvedValueOnce(buildServerReimbursement({ status: "revise" }));

    const wrapper = mountForm();
    await flushPromises();

    const btn = findSubmitButton(wrapper);
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("Update & Resubmit");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("also enforces disabled gate when status is uppercase REVISE", async () => {
    fetchOneMock.mockResolvedValueOnce(buildServerReimbursement({ status: "REVISE" }));

    const wrapper = mountForm();
    await flushPromises();

    const btn = findSubmitButton(wrapper);
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("enables button when userComment or receipt field changes, and disables again when reverted", async () => {
    fetchOneMock.mockResolvedValueOnce(buildServerReimbursement({ status: "revise" }));

    const wrapper = mountForm();
    await flushPromises();

    const btn = findSubmitButton(wrapper);
    expect(btn.attributes("disabled")).toBeDefined();

    // Edit user comment
    const commentBox = wrapper.find("textarea");
    await commentBox.setValue("Updated explanation per admin feedback");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    // Revert user comment -> disabled again
    await commentBox.setValue("Original comment");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    // Edit a receipt field
    localReceiptsState.ref.value[0].merchantName = "Jollibee Makati";
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    // Revert receipt field -> disabled again
    localReceiptsState.ref.value[0].merchantName = "Jollibee";
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    // Clearing a required receipt date keeps button disabled even if comment changed
    await commentBox.setValue("Changed again");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();
    localReceiptsState.ref.value[0].date = "";
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("enables button when uploading a new report file in manual mode, and stays disabled if report becomes invalid", async () => {
    fetchOneMock.mockResolvedValueOnce(
      buildServerReimbursement({
        status: "revise",
        report_file_path: "reports/existing.pdf",
        report_template_data: {
          mode: "manual",
        },
      }),
    );

    const wrapper = mountForm({
      stubs: {
        MetaAndAttachments: true,
        ScannedReceiptsList: true,
      },
    });
    await flushPromises();

    const btn = findSubmitButton(wrapper);
    expect(btn.attributes("disabled")).toBeDefined();

    // Replacing existing file string with a new File upload enables button
    const meta = wrapper.findComponent({ name: "MetaAndAttachments" });
    const replacementFile = new File(["pdf"], "revised-report.pdf", {
      type: "application/pdf",
      lastModified: 1700000000000,
    });
    meta.vm.$emit("update:reportFile", replacementFile);
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    // Reverting to original path disables again
    meta.vm.$emit("update:reportFile", "reports/existing.pdf");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("keeps Update Reimbursement enabled when editing a non-revise (pending) request", async () => {
    fetchOneMock.mockResolvedValueOnce(buildServerReimbursement({ status: "pending" }));

    const wrapper = mountForm();
    await flushPromises();

    const btn = findSubmitButton(wrapper);
    expect(btn.text()).toContain("Update Reimbursement");
    expect(btn.attributes("disabled")).toBeUndefined();
  });
});
