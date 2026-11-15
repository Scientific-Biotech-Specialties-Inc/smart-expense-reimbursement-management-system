// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import CashAdvanceFormView from "@/views/CashAdvanceFormView.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import SbsiReportDocumentEditor from "@/components/base/SbsiReportDocumentEditor.vue";

const { fetchRequestMock, updateRequestMock, createRequestMock } = vi.hoisted(() => ({
  fetchRequestMock: vi.fn(),
  updateRequestMock: vi.fn(),
  createRequestMock: vi.fn(),
}));

vi.mock("@/stores/cashAdvance", () => ({
  useCashAdvanceStore: () => ({
    fetchRequest: fetchRequestMock,
    updateRequest: updateRequestMock,
    createRequest: createRequestMock,
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: {
      id: 7,
      name: "Maria Santos",
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

function buildServerAdvance(overrides = {}) {
  return {
    id: 89,
    status: "revise",
    purpose: "Regional client site audit",
    amount: 5000,
    expected_disbursement_date: "2026-10-01",
    expected_liquidation_date: "2026-10-10",
    report_template_data: {
      purpose: "Regional client site audit",
      totalAmount: 5000,
      disbursementDate: "2026-10-01",
      liquidationDeadline: "2026-10-10",
      remarks: "Hotel and airfare",
      breakdownItems: [{ description: "Flight", amount: 5000 }],
    },
    ...overrides,
  };
}

function mountCashAdvanceForm(props = { id: "89" }, stubs = {}) {
  return mount(CashAdvanceFormView, {
    props,
    global: {
      stubs: {
        ConfirmModal: true,
        BaseSignaturePad: true,
        SbsiReportPreviewModal: true,
        ...stubs,
      },
    },
  });
}

describe("CashAdvanceFormView — revise submit button stays disabled until changed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps submit button disabled on initial load of a revise cash advance (real SbsiReportDocumentEditor)", async () => {
    fetchRequestMock.mockResolvedValueOnce(buildServerAdvance({ status: "revise" }));

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    expect(btn.exists()).toBe(true);
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("enables submit button when purpose or amount changes, and disables again when reverted", async () => {
    fetchRequestMock.mockResolvedValueOnce(buildServerAdvance({ status: "revise" }));

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    expect(btn.attributes("disabled")).toBeDefined();

    // Edit purpose
    const purposeInput = wrapper.find("#ca-purpose");
    await purposeInput.setValue("Updated regional client audit");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    // Revert purpose -> disabled again
    await purposeInput.setValue("Regional client site audit");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    // Edit amount
    const amountInput = wrapper.find("#ca-amount");
    await amountInput.setValue("6500");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    // Revert amount -> disabled again
    await amountInput.setValue("5000");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    // Clearing a required field after change keeps button disabled
    await purposeInput.setValue("Modified purpose");
    await amountInput.setValue("");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("enables submit button when manual report file is replaced in manual-mode revise request", async () => {
    fetchRequestMock.mockResolvedValueOnce(
      buildServerAdvance({
        status: "REVISE",
        report_template_data: null,
        document: {
          file_name: "old-ca.pdf",
          file_path: "ca-docs/old-ca.pdf",
        },
      }),
    );

    const wrapper = mountCashAdvanceForm({ id: "89" }, { SbsiReportDocumentEditor: true });
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    expect(btn.attributes("disabled")).toBeDefined();

    const editor = wrapper.findComponent({ name: "SbsiReportDocumentEditor" });
    const newFile = new File(["new"], "revised-ca.pdf", {
      type: "application/pdf",
      lastModified: 1700000000001,
    });
    editor.vm.$emit("update:reportFile", newFile);
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("enables submit button when template breakdown description changes in SbsiReportDocumentEditor, and disables on revert", async () => {
    fetchRequestMock.mockResolvedValueOnce(buildServerAdvance({ status: "revise" }));

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    expect(btn.attributes("disabled")).toBeDefined();

    const descInput = wrapper.find('[data-testid="breakdown-description-0"]');
    expect(descInput.exists()).toBe(true);
    await descInput.setValue("Flight & Ferry");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    await descInput.setValue("Flight");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("does not disable submit button for non-revise (pending) edits when valid", async () => {
    fetchRequestMock.mockResolvedValueOnce(buildServerAdvance({ status: "pending" }));

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("keeps submit disabled when switching template-mode revise (with data.document) to manual without file, and re-disables on switching back after file upload", async () => {
    fetchRequestMock.mockResolvedValueOnce(
      buildServerAdvance({
        status: "revise",
        document: { file_name: "generated-template.pdf", file_path: "cash-advances/generated-template.pdf" },
      })
    );

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    const confirmModal = wrapper.findComponent(ConfirmModal);
    expect(btn.attributes("disabled")).toBeDefined();

    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();
    expect(confirmModal.props("isOpen")).toBe(false);
    expect(updateRequestMock).not.toHaveBeenCalled();

    const fileInput = wrapper.find('[data-testid="manual-file-input"]');
    const manualFile = new File(["%PDF-1.4"], "manual-report.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput.element, "files", {
      value: [manualFile],
      configurable: true,
    });
    await fileInput.trigger("change");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("keeps submit disabled when template-mode revise (with report_file_path) uploads and removes manual file then switches back to template", async () => {
    fetchRequestMock.mockResolvedValueOnce(
      buildServerAdvance({
        status: "revise",
        report_file_path: "cash-advances/generated-template.pdf",
      })
    );

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    expect(btn.attributes("disabled")).toBeDefined();

    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    const fileInput = wrapper.find('[data-testid="manual-file-input"]');
    const manualFile = new File(["%PDF-1.4"], "manual-upload.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput.element, "files", {
      value: [manualFile],
      configurable: true,
    });
    await fileInput.trigger("change");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    await wrapper.find('button[aria-label="Remove report attachment"]').trigger("click");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("reacts to stubbed SbsiReportDocumentEditor @update:mode without DOM aria-pressed clicks", async () => {
    fetchRequestMock.mockResolvedValueOnce(
      buildServerAdvance({
        status: "revise",
        document: { file_name: "generated.pdf", file_path: "cash-advances/generated.pdf" },
      })
    );

    const wrapper = mountCashAdvanceForm(
      { id: "89" },
      { SbsiReportDocumentEditor: true }
    );
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    const editor = wrapper.findComponent(SbsiReportDocumentEditor);
    expect(editor.exists()).toBe(true);
    expect(btn.attributes("disabled")).toBeDefined();

    editor.vm.$emit("update:mode", "manual");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    const manualFile = new File(["%PDF-1.4"], "stubbed-manual.pdf", { type: "application/pdf" });
    editor.vm.$emit("update:reportFile", manualFile);
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    editor.vm.$emit("update:mode", "template");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("disables submit when removing existing attachment in manual-mode revise cash advance", async () => {
    fetchRequestMock.mockResolvedValueOnce(
      buildServerAdvance({
        status: "revise",
        report_template_data: null,
        document: { file_name: "manual-old.pdf", file_path: "cash-advances/manual-old.pdf" },
      })
    );

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    expect(btn.attributes("disabled")).toBeDefined();

    await wrapper.find('button[aria-label="Remove report attachment"]').trigger("click");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("allows selecting all and clearing purpose or deleting down past the first character", async () => {
    fetchRequestMock.mockResolvedValueOnce(buildServerAdvance({ status: "revise" }));

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const purposeInput = wrapper.find("#ca-purpose");
    expect(purposeInput.element.value).toBe("Regional client site audit");

    // Select-all and delete entire purpose
    await purposeInput.setValue("");
    await flushPromises();
    expect(purposeInput.element.value).toBe("");

    // Type back then backspace down to first character and remove it
    await purposeInput.setValue("Regional client site audit");
    await flushPromises();
    await purposeInput.setValue("R");
    await flushPromises();
    expect(purposeInput.element.value).toBe("R");
    await purposeInput.setValue("");
    await flushPromises();
    expect(purposeInput.element.value).toBe("");
  });

  it("enables submit button when ONLY expected_disbursement_date changes (valid date, via form input or DatePill, with real BaseSignaturePad)", async () => {
    fetchRequestMock.mockResolvedValueOnce(
      buildServerAdvance({
        status: "revise",
        expected_disbursement_date: "2026-10-01T00:00:00.000000Z",
        expected_liquidation_date: "2026-10-10T00:00:00.000000Z",
      }),
    );

    const wrapper = mount(CashAdvanceFormView, {
      props: { id: "89" },
      global: {
        stubs: {
          ConfirmModal: true,
          SbsiReportPreviewModal: true,
        },
      },
    });
    await flushPromises();

    const btn = wrapper.find("#submit-advance-btn");
    expect(btn.attributes("disabled")).toBeDefined();

    const disbInput = wrapper.find("#ca-disbursement");
    await disbInput.setValue("2026-10-03");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    // Reverting disables again
    await disbInput.setValue("2026-10-01");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();

    // Changing via DatePill in SbsiReportDocumentEditor enables submit
    const datePillInput = wrapper.find('[data-testid="field-disbursementDate"] input');
    await datePillInput.setValue("2026-10-04");
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("allows clearing disbursement date during keyboard edit without snapping back, shows inline error when >= liquidation date, and enables manual-mode disbursement edits", async () => {
    fetchRequestMock.mockResolvedValueOnce(buildServerAdvance({ status: "revise" }));

    const wrapper = mountCashAdvanceForm();
    await flushPromises();

    const disbInput = wrapper.find("#ca-disbursement");
    const btn = wrapper.find("#submit-advance-btn");

    // Clearing via keyboard edit must not snap back
    await disbInput.setValue("");
    await flushPromises();
    expect(disbInput.element.value).toBe("");

    // Setting disbursement >= liquidation shows inline error and keeps template submit disabled
    await disbInput.setValue("2026-10-12");
    await flushPromises();
    expect(wrapper.find('[data-testid="ca-date-range-error"]').exists()).toBe(true);
    expect(btn.attributes("disabled")).toBeDefined();

    // Moving to a valid earlier/between date clears inline error and enables submit
    await disbInput.setValue("2026-10-05");
    await flushPromises();
    expect(wrapper.find('[data-testid="ca-date-range-error"]').exists()).toBe(false);
    expect(btn.attributes("disabled")).toBeUndefined();

    // Clearing inline template purpose input keeps both inputs empty without snapping back
    const inlinePurpose = wrapper.find('[data-testid="field-purpose"]');
    await inlinePurpose.setValue("");
    await flushPromises();
    expect(wrapper.find("#ca-purpose").element.value).toBe("");
    expect(inlinePurpose.element.value).toBe("");

    // Manual-mode revise cash advance also enables submit when ONLY disbursement date changes
    fetchRequestMock.mockResolvedValueOnce(
      buildServerAdvance({
        status: "revise",
        report_template_data: null,
        document: { file_name: "manual-ca.pdf", file_path: "cash-advances/manual-ca.pdf" },
      }),
    );
    const manualWrapper = mountCashAdvanceForm();
    await flushPromises();
    const manualBtn = manualWrapper.find("#submit-advance-btn");
    expect(manualBtn.attributes("disabled")).toBeDefined();
    await manualWrapper.find("#ca-disbursement").setValue("2026-10-06");
    await flushPromises();
    expect(manualBtn.attributes("disabled")).toBeUndefined();
  });
});
