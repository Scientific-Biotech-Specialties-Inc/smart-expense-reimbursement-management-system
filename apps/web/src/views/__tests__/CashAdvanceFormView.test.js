// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CashAdvanceFormView from "@/views/CashAdvanceFormView.vue";

const { mockPush, mockRequest, mockUpdateRequest, mockFetchRequest, mockAddToast } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRequest: vi.fn(),
  mockUpdateRequest: vi.fn(),
  mockFetchRequest: vi.fn(),
  mockAddToast: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: 7, name: "Juan Dela Cruz", role: "Employee", department: "Operations" },
  }),
}));

vi.mock("@/stores/cashAdvance", () => ({
  useCashAdvanceStore: () => ({
    request: mockRequest,
    updateRequest: mockUpdateRequest,
    fetchRequest: mockFetchRequest,
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("@/composables/useUnsavedChanges", () => ({
  useUnsavedChanges: () => ({
    showConfirmModal: false,
    handleConfirmLeave: vi.fn(),
    handleCancelLeave: vi.fn(),
    dismissWithConfirm: (cb) => cb(),
  }),
}));

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("CashAdvanceFormView — SBSI Report Template Integration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockRequest.mockResolvedValue({ id: 55 });
    mockUpdateRequest.mockResolvedValue({ id: 55 });
  });

  it("defaults to Premade Template mode, syncs breakdown items to form.amount, and submits generated PDF + report_template_data", async () => {
    const wrapper = mount(CashAdvanceFormView, {
      global: {
        stubs: {
          ConfirmModal: true,
          SbsiReportPreviewModal: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="sbsi-report-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-template"]').attributes("aria-pressed")).toBe("true");

    await wrapper.find("#ca-purpose").setValue("Client Site Calibration");
    await wrapper.find("#ca-disbursement").setValue(futureDate(2));
    await wrapper.find("#ca-due").setValue(futureDate(7));

    // Edit breakdown row inside SbsiReportDocumentEditor
    const descInput = wrapper.find('[data-testid="breakdown-description-0"]');
    const amountInput = wrapper.find('[data-testid="breakdown-amount-0"]');
    await descInput.setValue("Airfare and Hotel");
    await amountInput.setValue("3500");
    await flushPromises();

    // Two-way sync: breakdown sum updates #ca-amount
    expect(wrapper.find("#ca-amount").element.value).toBe("3500");

    const submitBtn = wrapper.find("#submit-advance-btn");
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const formData = mockRequest.mock.calls[0][0];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("purpose")).toBe("Client Site Calibration");
    expect(formData.get("amount")).toBe("3500");
    const uploadedDoc = formData.get("documents[]");
    expect(uploadedDoc).toBeInstanceOf(File);
    expect(uploadedDoc.type).toBe("application/pdf");

    const rawTemplate = formData.get("report_template_data");
    expect(typeof rawTemplate).toBe("string");
    const parsed = JSON.parse(rawTemplate);
    expect(parsed.type).toBe("cash-advance");
    expect(parsed.purpose).toBe("Client Site Calibration");
    expect(parsed.totalAmount).toBe(3500);
  });

  it("supports Manual mode upload and disables submit when no manual file is attached", async () => {
    const wrapper = mount(CashAdvanceFormView, {
      global: {
        stubs: {
          ConfirmModal: true,
          SbsiReportPreviewModal: true,
        },
      },
    });

    await wrapper.find("#ca-purpose").setValue("Manual Doc Request");
    await wrapper.find("#ca-amount").setValue("1500");
    await wrapper.find("#ca-disbursement").setValue(futureDate(2));
    await wrapper.find("#ca-due").setValue(futureDate(6));

    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.find("#submit-advance-btn").attributes("disabled")).toBeDefined();
  });

  it("hydrates legacy document-only cash advance in Manual mode on edit", async () => {
    mockFetchRequest.mockResolvedValue({
      id: 88,
      purpose: "Legacy Advance",
      amount: 2000,
      expected_disbursement_date: futureDate(1),
      expected_liquidation_date: futureDate(5),
      document: {
        file_name: "legacy-ca.pdf",
        file_path: "cash_advances/legacy-ca.pdf",
      },
      report_template_data: null,
    });

    const wrapper = mount(CashAdvanceFormView, {
      props: { id: 88 },
      global: {
        stubs: {
          ConfirmModal: true,
          SbsiReportPreviewModal: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.find('[data-testid="manual-file-name"]').text()).toBe("legacy-ca.pdf");
  });

  it("hydrates template-backed cash advance in Template mode on edit", async () => {
    mockFetchRequest.mockResolvedValue({
      id: 89,
      purpose: "Templated Advance",
      amount: 4200,
      expected_disbursement_date: futureDate(1),
      expected_liquidation_date: futureDate(5),
      document: {
        file_name: "SBSI-cash-advance-89.pdf",
        file_path: "cash_advances/SBSI-cash-advance-89.pdf",
      },
      report_template_data: {
        type: "cash-advance",
        purpose: "Templated Advance",
        totalAmount: 4200,
        breakdownItems: [{ description: "Supplies", amount: 4200 }],
        signatoryName: "Juan Dela Cruz",
      },
    });

    const wrapper = mount(CashAdvanceFormView, {
      props: { id: 89 },
      global: {
        stubs: {
          ConfirmModal: true,
          SbsiReportPreviewModal: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="mode-template"]').attributes("aria-pressed")).toBe("true");
  });
});
