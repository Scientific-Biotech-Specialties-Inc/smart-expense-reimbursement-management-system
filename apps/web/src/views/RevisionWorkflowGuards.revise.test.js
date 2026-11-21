// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { isManualReportTemplate } from "@/composables/useRevisionGuard";

const mockPush = vi.fn();
const mockAddToast = vi.fn();
const mockFetchOneReimb = vi.fn();
const mockUpdateReimb = vi.fn();
const mockFetchCategories = vi.fn();
const mockFetchCARequest = vi.fn();
const mockUpdateCARequest = vi.fn();
const mockLocalReceipts = ref([]);

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: {}, params: {} }),
  onBeforeRouteLeave: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("@/composables/useUnsavedChanges", () => ({
  useUnsavedChanges: () => ({
    showConfirmModal: ref(false),
    handleConfirmLeave: vi.fn(),
    handleCancelLeave: vi.fn(),
    dismissWithConfirm: (cb) => cb?.(),
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: {
      id: 5,
      name: "Jane Employee",
      role: "employee",
      signature: "data:image/png;base64,SAVEDSIG==",
    },
    isAdmin: false,
    departmentName: "Operations",
  }),
}));

vi.mock("@/stores/reimbursement", () => ({
  useReimbursementStore: () => ({
    fetchOne: (...args) => mockFetchOneReimb(...args),
    submit: vi.fn(),
    updateRequest: (...args) => mockUpdateReimb(...args),
    items: [],
  }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({
    categories: [{ id: 1, name: "Meals" }],
    fetchCategories: (...args) => mockFetchCategories(...args),
  }),
}));

vi.mock("@/stores/cashAdvance", () => ({
  useCashAdvanceStore: () => ({
    items: [],
    fetchRequest: (...args) => mockFetchCARequest(...args),
    updateRequest: (...args) => mockUpdateCARequest(...args),
    createRequest: vi.fn(),
  }),
}));

vi.mock("@/composables/reimbursements/useReceiptUploads", () => ({
  useReceiptUploads: () => ({
    localReceipts: mockLocalReceipts,
    hasPendingReceipts: ref(false),
    isUploading: ref(false),
    uploadStatusMessage: ref(""),
    uploadErrorMessage: ref(""),
    duplicateConflict: ref(null),
    qualityRejection: ref(null),
    resetReceipts: vi.fn(),
    handleReceiptFiles: vi.fn(),
    removeReceipt: vi.fn(),
    retryReceiptOcr: vi.fn(),
    resolveDuplicate: vi.fn(),
    dismissQualityRejection: vi.fn(),
    restoreDraftIfAny: vi.fn(),
    clearDraftStorage: vi.fn(),
    abortUploadedReceipts: vi.fn(),
  }),
}));

import CashAdvanceFormView from "./CashAdvanceFormView.vue";
import ReimbursementFormView from "./ReimbursementFormView.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import SbsiReportDocumentEditor from "@/components/base/SbsiReportDocumentEditor.vue";

describe("Revision workflow edge cases (manual markers, submit bypass, signature reset)", () => {
  const mounted = [];
  const trackMount = (c, o) => {
    const w = mount(c, o);
    mounted.push(w);
    return w;
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockLocalReceipts.value = [];
    mockFetchCategories.mockResolvedValue([]);
    mockUpdateCARequest.mockResolvedValue({ id: 77 });
    mockUpdateReimb.mockResolvedValue({ id: 42 });
  });

  afterEach(() => {
    while (mounted.length) mounted.pop().unmount();
  });

  it("detects manual report markers case-insensitively", () => {
    expect(isManualReportTemplate({ mode: "manual" })).toBe(true);
    expect(isManualReportTemplate({ mode: " MANUAL " })).toBe(true);
    expect(isManualReportTemplate({ mode: "template" })).toBe(false);
    expect(isManualReportTemplate(null)).toBe(false);
  });

  it("blocks CashAdvance form submit bypass when revise request is unchanged, and allows submit after editing", async () => {
    mockFetchCARequest.mockResolvedValue({
      id: 77,
      status: "revise",
      purpose: "Field Audit",
      amount: "5000.00",
      expected_disbursement_date: "2026-12-10",
      expected_liquidation_date: "2026-12-20",
      report_file_path: null,
      report_template_data: {
        type: "cash_advance",
        payTo: "Jane Employee",
        department: "Operations",
        date: "2026-12-10",
        purpose: "Field Audit",
        breakdownItems: [{ qty: 1, description: "Field Audit", amount: 5000 }],
        signatoryName: "Jane Employee",
        signatorySignature: "data:image/png;base64,SAVEDSIG==",
      },
    });

    const wrapper = trackMount(CashAdvanceFormView, {
      props: { id: "77" },
      global: { stubs: { teleport: true } },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find("#submit-advance-btn").attributes("disabled")).toBeDefined();
    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();
    expect(wrapper.findComponent(ConfirmModal).props("isOpen")).toBe(false);

    await wrapper.find("#ca-purpose").setValue("Updated Field Audit");
    await flushPromises();
    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();
    expect(wrapper.findComponent(ConfirmModal).props("isOpen")).toBe(true);
  });

  it("hydrates CashAdvance manual revise requests with report_template_data: { mode: 'manual' } in manual mode and keeps submit disabled", async () => {
    mockFetchCARequest.mockResolvedValue({
      id: 77,
      status: "revise",
      purpose: "Field Audit",
      amount: "5000.00",
      expected_disbursement_date: "2026-12-10",
      expected_liquidation_date: "2026-12-20",
      report_file_path: "reports/ca-77.pdf",
      report_template_data: { mode: "manual" },
    });

    const wrapper = trackMount(CashAdvanceFormView, {
      props: { id: "77" },
      global: { stubs: { teleport: true } },
    });
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.find("#submit-advance-btn").attributes("disabled")).toBeDefined();

    await wrapper.find("#ca-amount").setValue("6500");
    await flushPromises();
    expect(wrapper.find("#submit-advance-btn").attributes("disabled")).toBeUndefined();

    await wrapper.find("#ca-amount").setValue("5000");
    await flushPromises();
    expect(wrapper.find("#submit-advance-btn").attributes("disabled")).toBeDefined();
  });

  it("hydrates Reimbursement manual { mode: 'manual' } in manual mode, keeps Update & Resubmit disabled when removing file or switching to manual without file", async () => {
    mockFetchOneReimb.mockResolvedValue({
      id: 42,
      status: "revise",
      admin_notes: "Fix report",
      user_comment: "Initial comment",
      report_file_path: "reports/existing.pdf",
      report_template_data: { mode: "manual" },
      receipts: [
        {
          id: 101,
          vendor_name: "Jollibee",
          transaction_date: "2026-12-01",
          total_amount: 500,
          vat_amount: 53.57,
          tin: "123-456-789-000",
          invoice_number: "INV-1",
          expense_category_id: 1,
          vat_classification: "vat",
          file_path: "receipts/1.jpg",
          items: [{ name: "Meal", qty: 1, price: 500 }],
        },
      ],
    });

    const wrapper = trackMount(ReimbursementFormView, {
      props: { id: "42", forwardedReceipts: [] },
      global: { stubs: { teleport: true } },
    });
    await flushPromises();
    await flushPromises();

    const submitBtn = () =>
      wrapper.findAll("button").find((b) => b.text().includes("Update & Resubmit"));

    expect(wrapper.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Clearing the manual file must keep Update & Resubmit disabled
    wrapper.findComponent(SbsiReportDocumentEditor).vm.$emit("update:reportFile", null);
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();
  });

  it("blocks Reimbursement switching to manual mode without uploading a file and restores disabled state when reverting signature/mode", async () => {
    mockFetchOneReimb.mockResolvedValue({
      id: 42,
      status: "revise",
      admin_notes: "Fix receipt",
      user_comment: "Initial comment",
      report_file_path: null,
      report_template_data: {
        type: "reimbursement",
        payTo: "Jane Employee",
        department: "Operations",
        date: "2026-12-01",
        purpose: "Client Visit",
        breakdownItems: [{ qty: 1, description: "Lunch", amount: 500 }],
        signatoryName: "Jane Employee",
        signatorySignature: "data:image/png;base64,SAVEDSIG==",
      },
      receipts: [
        {
          id: 101,
          vendor_name: "Jollibee",
          transaction_date: "2026-12-01",
          total_amount: 500,
          vat_amount: 53.57,
          tin: "123-456-789-000",
          invoice_number: "INV-1",
          expense_category_id: 1,
          vat_classification: "vat",
          file_path: "receipts/1.jpg",
          items: [{ name: "Meal", qty: 1, price: 500 }],
        },
      ],
    });

    const wrapper = trackMount(ReimbursementFormView, {
      props: { id: "42", forwardedReceipts: [] },
      global: { stubs: { teleport: true } },
    });
    await flushPromises();
    await flushPromises();

    const submitBtn = () =>
      wrapper.findAll("button").find((b) => b.text().includes("Update & Resubmit"));
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Switching to manual without a file must keep button disabled
    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Back to template -> disabled
    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Edit comment -> enabled -> switch to manual without file -> disabled
    await wrapper.find("textarea").setValue("Updated comment");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeUndefined();

    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Switch back to template + revert comment -> disabled
    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await wrapper.find("textarea").setValue("Initial comment");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();
  });
});
