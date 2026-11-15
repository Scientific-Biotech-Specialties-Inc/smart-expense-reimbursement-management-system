// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CashAdvanceFormView from "@/views/CashAdvanceFormView.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";

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

function findSubmitConfirmModal(wrapper) {
  return wrapper
    .findAllComponents(ConfirmModal)
    .find((m) => m.props("message")?.toLowerCase().includes("are you sure do you want to submit this request?"));
}

async function fillValidForm(wrapper) {
  await wrapper.find("#ca-purpose").setValue("Client Site Calibration");
  await wrapper.find("#ca-disbursement").setValue(futureDate(2));
  await wrapper.find("#ca-due").setValue(futureDate(7));
  await wrapper.find('[data-testid="breakdown-description-0"]').setValue("Airfare and Hotel");
  await wrapper.find('[data-testid="breakdown-amount-0"]').setValue("3500");
  await flushPromises();
}

describe("CashAdvanceFormView — Submit Confirmation Modal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockRequest.mockResolvedValue({ id: 55 });
    mockUpdateRequest.mockResolvedValue({ id: 55 });
  });

  function mountForm(props = {}) {
    return mount(CashAdvanceFormView, {
      props,
      global: {
        stubs: {
          SbsiReportPreviewModal: true,
        },
      },
    });
  }

  it("opens confirmation modal when submit is triggered instead of submitting immediately", async () => {
    const wrapper = mountForm();
    await fillValidForm(wrapper);

    const submitBtn = wrapper.find("#submit-advance-btn");
    expect(submitBtn.exists()).toBe(true);
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();

    expect(mockRequest).not.toHaveBeenCalled();

    const submitModal = findSubmitConfirmModal(wrapper);
    expect(submitModal).toBeDefined();
    expect(submitModal.props("isOpen")).toBe(true);
    expect(submitModal.props("title")).toBe("Submit Request");
    expect(submitModal.props("confirmText")).toBe("Done");
    expect(submitModal.props("cancelText")).toBe("Cancel");
    expect(submitModal.props("danger")).toBe(false);
  });

  it("closes confirmation modal and does not submit if user cancels", async () => {
    const wrapper = mountForm();
    await fillValidForm(wrapper);

    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();

    const submitModal = findSubmitConfirmModal(wrapper);
    expect(submitModal.props("isOpen")).toBe(true);

    await submitModal.vm.$emit("close");
    await flushPromises();

    expect(mockRequest).not.toHaveBeenCalled();
    expect(submitModal.props("isOpen")).toBe(false);
  });

  it("submits the request when user confirms in confirmation modal", async () => {
    const wrapper = mountForm();
    await fillValidForm(wrapper);

    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();

    const submitModal = findSubmitConfirmModal(wrapper);
    await submitModal.vm.$emit("confirm");
    await flushPromises();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/cash-advances");
  });

  it("gates update in edit mode behind the confirmation modal", async () => {
    mockFetchRequest.mockResolvedValue({
      id: 89,
      purpose: "Templated Advance",
      amount: 4200,
      expected_disbursement_date: futureDate(1),
      expected_liquidation_date: futureDate(5),
      report_template_data: {
        type: "cash-advance",
        purpose: "Templated Advance",
        totalAmount: 4200,
        breakdownItems: [{ description: "Supplies", amount: 4200 }],
        signatoryName: "Juan Dela Cruz",
      },
    });

    const wrapper = mountForm({ id: 89 });
    await flushPromises();

    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();

    expect(mockUpdateRequest).not.toHaveBeenCalled();
    const submitModal = findSubmitConfirmModal(wrapper);
    expect(submitModal.props("isOpen")).toBe(true);

    await submitModal.vm.$emit("confirm");
    await flushPromises();

    expect(mockUpdateRequest).toHaveBeenCalledTimes(1);
  });

  it("does not open confirmation modal when date validation fails", async () => {
    const wrapper = mountForm();
    await fillValidForm(wrapper);
    await wrapper.find("#ca-disbursement").setValue(futureDate(-1));
    await wrapper.find("#ca-due").setValue(futureDate(5));
    await flushPromises();

    await wrapper.find("#cashAdvanceForm").trigger("submit");
    await flushPromises();

    const submitModal = findSubmitConfirmModal(wrapper);
    expect(submitModal?.props("isOpen") ?? false).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
      }),
    );
  });
});
