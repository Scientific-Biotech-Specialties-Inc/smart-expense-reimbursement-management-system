// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import LiquidationsView from "@/views/LiquidationsView.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import LiquidationSettlementForm from "@/components/liquidations/LiquidationSettlementForm.vue";

const { submitLiquidationMock, addToastMock } = vi.hoisted(() => {
  return {
    submitLiquidationMock: vi.fn().mockResolvedValue(true),
    addToastMock: vi.fn(),
  };
});

vi.mock("@/stores/cashAdvance", () => ({
  useCashAdvanceStore: () => ({
    items: [
      {
        id: "ca-1",
        amount: 500,
        balance: 500,
        status: "signed",
        acknowledgedAt: "2026-10-01",
        purpose: "Project Expense",
      },
    ],
    isLoading: false,
    fetchAll: vi.fn(),
  }),
}));

vi.mock("@/stores/liquidation", () => ({
  useLiquidationStore: () => ({
    settlements: [],
    isLoading: false,
    fetchSettlements: vi.fn(),
    calculateAging: () => ({ isOverdue: false }),
  }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({
    categories: [],
    fetchCategories: vi.fn(),
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAdmin: false,
    user: { id: "user-1", name: "Employee" },
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    addToast: addToastMock,
  }),
}));

vi.mock("@/composables/useOcrMode", () => ({
  useOcrMode: () => ({
    isMockOcr: ref(false),
    setMockMode: vi.fn(),
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

vi.mock("@/composables/liquidations/useLiquidationSubmit", () => ({
  useLiquidationSubmit: () => ({
    submitting: ref(false),
    submitLiquidation: submitLiquidationMock,
  }),
}));

vi.mock("@/composables/liquidations/useLiquidationForwarding", () => ({
  useLiquidationForwarding: () => ({
    forwardOverpaymentToReimbursement: vi.fn(),
  }),
}));

vi.mock("@/composables/liquidations/useLiquidationDecisions", () => ({
  useLiquidationDecisions: () => ({
    approvingId: ref(null),
    rejectingId: ref(null),
    revisionAction: ref(null),
    confirmPassword: ref(""),
    rejectionComment: ref(""),
    isReviewSubmitting: ref(false),
    openApproveModal: vi.fn(),
    openRejectModal: vi.fn(),
    cancelApprove: vi.fn(),
    cancelReject: vi.fn(),
    confirmApprove: vi.fn(),
    confirmReject: vi.fn(),
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("LiquidationsView — Submit Confirmation Modal & Toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountView() {
    return mount(LiquidationsView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          BaseUtilityToolbar: true,
          BaseToggleSwitch: true,
          BasePagination: true,
          LiquidationTable: true,
          LiquidationReviewModal: true,
          LiquidationReceiptModal: true,
          DecisionConfirmationModal: true,
          DeleteConfirmModal: true,
          // Permissive modal stub: always renders its slot so the form is
          // findable regardless of the modal's open state.
          BaseModal: {
            name: "BaseModal",
            props: ["isOpen"],
            template: "<div><slot /></div>",
          },
          // Let LiquidationSettlementForm be a simple stub that can emit submit-liquidation
          LiquidationSettlementForm: {
            name: "LiquidationSettlementForm",
            template: "<div class='settlement-form-stub'><button id='trigger-submit' @click=\"$emit('submit-liquidation')\">Submit</button></div>",
            emits: ["submit-liquidation"],
          },
        },
      },
    });
  }

  it("opens confirmation modal when submit-liquidation is triggered instead of submitting immediately", async () => {
    const wrapper = mountView();

    // Select an advance so selectedAdvanceCanLiquidate is true
    wrapper.vm.selectedAdvance = {
      id: "ca-1",
      amount: 500,
      balance: 500,
      status: "signed",
      acknowledgedAt: "2026-10-01",
    };
    await wrapper.vm.$nextTick();

    const settlementForm = wrapper.findComponent(LiquidationSettlementForm);
    expect(settlementForm.exists()).toBe(true);

    // Trigger submit-liquidation
    await settlementForm.vm.$emit("submit-liquidation");
    await wrapper.vm.$nextTick();

    // Submission should not have happened yet
    expect(submitLiquidationMock).not.toHaveBeenCalled();

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
    expect(submitModal.props("danger")).toBe(false);
  });

  it("closes confirmation modal and does not submit if user cancels", async () => {
    const wrapper = mountView();
    wrapper.vm.selectedAdvance = {
      id: "ca-1",
      amount: 500,
      balance: 500,
      status: "signed",
      acknowledgedAt: "2026-10-01",
    };
    await wrapper.vm.$nextTick();

    const settlementForm = wrapper.findComponent(LiquidationSettlementForm);
    await settlementForm.vm.$emit("submit-liquidation");
    await wrapper.vm.$nextTick();

    const confirmModals = wrapper.findAllComponents(ConfirmModal);
    const submitModal = confirmModals.find(
      (m) =>
        m.props("message")?.toLowerCase().includes("are you sure do you want to submit this request?") ||
        m.props("message")?.toLowerCase().includes("are you sure you want to submit this request?")
    );

    expect(submitModal).toBeDefined();
    expect(submitModal.props("isOpen")).toBe(true);

    // Cancel modal
    await submitModal.vm.$emit("close");
    await wrapper.vm.$nextTick();

    expect(submitLiquidationMock).not.toHaveBeenCalled();
    expect(submitModal.props("isOpen")).toBe(false);
  });

  it("submits the request and triggers a success toast when user clicks Done in confirmation modal", async () => {
    const wrapper = mountView();
    wrapper.vm.selectedAdvance = {
      id: "ca-1",
      amount: 500,
      balance: 500,
      status: "signed",
      acknowledgedAt: "2026-10-01",
    };
    await wrapper.vm.$nextTick();

    const settlementForm = wrapper.findComponent(LiquidationSettlementForm);
    await settlementForm.vm.$emit("submit-liquidation");
    await wrapper.vm.$nextTick();

    const confirmModals = wrapper.findAllComponents(ConfirmModal);
    const submitModal = confirmModals.find(
      (m) =>
        m.props("message")?.toLowerCase().includes("are you sure do you want to submit this request?") ||
        m.props("message")?.toLowerCase().includes("are you sure you want to submit this request?")
    );

    expect(submitModal).toBeDefined();

    // Confirm modal
    await submitModal.vm.$emit("confirm");
    await wrapper.vm.$nextTick();

    expect(submitLiquidationMock).toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
      })
    );
  });
});
