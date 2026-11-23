// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import ReimbursementFormView from "@/views/ReimbursementFormView.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";

const {
  mockRouteState,
  fetchOneMock,
  submitReimbursementMock,
  updateReimbursementMock,
  receiptsState,
} = vi.hoisted(() => ({
  mockRouteState: { query: {}, params: {} },
  fetchOneMock: vi.fn(),
  submitReimbursementMock: vi.fn().mockResolvedValue(true),
  updateReimbursementMock: vi.fn().mockResolvedValue(true),
  receiptsState: { value: [] },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
  useRoute: () => mockRouteState,
  onBeforeRouteLeave: vi.fn(),
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

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: 10, name: "Juan Dela Cruz", department: "Field Service" },
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
    submitReimbursement: submitReimbursementMock,
    updateReimbursement: updateReimbursementMock,
  }),
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

const MetaAndAttachmentsStub = {
  name: "MetaAndAttachments",
  props: [
    "reportFile",
    "reportTemplateData",
    "userComment",
    "contractId",
    "clientName",
    "ticketId",
    "ticketNumber",
  ],
  emits: [
    "update:reportFile",
    "update:reportTemplateData",
    "update:userComment",
    "update:contractId",
    "update:clientName",
    "update:ticketId",
    "update:ticketNumber",
    "update:isManualMode",
  ],
  template: `<div data-testid="meta-stub" :data-ticket-id="ticketId" :data-ticket-number="ticketNumber"></div>`,
};

describe("ReimbursementFormView — TS Ticket Prefill & Hydration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockRouteState.query = {};
    mockRouteState.params = {};
    receiptsState.value = [
      {
        id: "rcpt-1",
        fileName: "receipt.pdf",
        merchantName: "Jollibee",
        categoryId: 1,
        eventType: "Field Service",
        date: "2026-11-21",
        amount: 250,
        isUploading: false,
      },
    ];
  });

  function mountForm(id = null) {
    return mount(ReimbursementFormView, {
      props: { forwardedReceipts: [], id },
      global: {
        stubs: {
          ReimbursementFormHeader: true,
          ReceiptsManagementHeader: true,
          ScannedReceiptsList: true,
          MetaAndAttachments: MetaAndAttachmentsStub,
          ReimbursementSummaryPanel: true,
          SegmentedReceiptUpload: true,
          ReceiptQualityRejectionModal: true,
          teleport: true,
          BaseButton: { template: "<button @click=\"$emit('click', $event)\"><slot /></button>" },
        },
      },
    });
  }

  it("prefills ticketId and ticketNumber from URL query params on create and submits them", async () => {
    mockRouteState.query = { ticket_id: "42", ticket_number: "TKT-0042" };

    const wrapper = mountForm(null);
    await flushPromises();

    const meta = wrapper.findComponent(MetaAndAttachmentsStub);
    expect(meta.props("ticketId")).toBe(42);
    expect(meta.props("ticketNumber")).toBe("TKT-0042");

    wrapper.vm.reportFile = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    wrapper.vm.isManualMode = true;
    await flushPromises();

    const submitBtn = wrapper.find("button.btn-cta");
    await submitBtn.trigger("click");
    const submitModal = wrapper
      .findAllComponents(ConfirmModal)
      .find((m) => m.props("title") === "Submit Request");
    expect(submitModal.props("isOpen")).toBe(true);
    await submitModal.vm.$emit("confirm");
    await flushPromises();

    expect(submitReimbursementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 42,
        ticketNumber: "TKT-0042",
      }),
    );
  });

  it("shows receipt upload prompt when launched via ?ticket_id= with zero receipts yet", async () => {
    receiptsState.value = [];
    mockRouteState.query = { ticket_id: "55", ticket_number: "TKT-0055" };

    const wrapper = mountForm(null);
    await flushPromises();

    expect(wrapper.text()).toContain("TKT-0055");
    expect(wrapper.text()).toContain("Attach Single Receipt");
  });

  it("hydrates ticketId and ticketNumber on edit/revise and enables Update & Resubmit when changed", async () => {
    fetchOneMock.mockResolvedValueOnce({
      id: 99,
      status: "revise",
      ticket_id: 77,
      ticket_number: "TKT-0077",
      report_file_path: "reports/rep.pdf",
      report_template_data: { mode: "manual" },
      user_comment: "Note",
      receipts: [
        {
          id: 101,
          vendor_name: "Jollibee",
          transaction_date: "2026-11-20",
          total_amount: 500,
          vat_classification: "vat",
          expense_category_id: 1,
          event_type: "Field Service",
        },
      ],
    });

    const wrapper = mountForm("99");
    await flushPromises();
    await flushPromises();

    const meta = wrapper.findComponent(MetaAndAttachmentsStub);
    expect(meta.props("ticketId")).toBe(77);
    expect(meta.props("ticketNumber")).toBe("TKT-0077");

    const submitBtn = wrapper.find("button.btn-cta");
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Update ticket selection -> revision guard unlocks button
    meta.vm.$emit("update:ticketId", 88);
    meta.vm.$emit("update:ticketNumber", "TKT-0088");
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    await submitBtn.trigger("click");
    const submitModal = wrapper
      .findAllComponents(ConfirmModal)
      .find((m) => m.props("title") === "Submit Request");
    expect(submitModal.props("isOpen")).toBe(true);
    await submitModal.vm.$emit("confirm");
    await flushPromises();

    expect(updateReimbursementMock).toHaveBeenCalledWith(
      "99",
      expect.objectContaining({
        ticketId: 88,
        ticketNumber: "TKT-0088",
      }),
    );
  });
});
