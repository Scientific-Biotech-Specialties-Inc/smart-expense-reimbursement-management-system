// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import LiquidationsView from "@/views/LiquidationsView.vue";
import LiquidationAdvancePicker from "@/components/liquidations/LiquidationAdvancePicker.vue";

const { addToastMock, mockItems } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  mockItems: [
    {
      id: "ca-own-1",
      userId: "admin-1",
      amount: 1000,
      balance: 600,
      status: "signed",
      acknowledgedAt: "2026-10-01",
      purpose: "Own Advance One",
      date: "2026-10-01",
      dueDate: "2026-10-08",
    },
    {
      id: "ca-other-1",
      userId: "employee-1",
      amount: 2000,
      balance: 1500,
      status: "signed",
      acknowledgedAt: "2026-10-01",
      purpose: "Someone Else's Advance",
      date: "2026-10-01",
      dueDate: "2026-10-08",
    },
    {
      id: "ca-own-2",
      userId: "admin-1",
      amount: 3000,
      balance: 2500,
      status: "signed",
      acknowledgedAt: "2026-10-02",
      purpose: "Own Advance Two",
      date: "2026-10-02",
      dueDate: "2026-10-09",
    },
  ],
}));

vi.mock("@/stores/cashAdvance", () => ({
  useCashAdvanceStore: () => ({
    items: mockItems,
    isLoading: false,
    fetchAll: vi.fn(),
  }),
}));

vi.mock("@/stores/liquidation", () => ({
  useLiquidationStore: () => ({
    settlements: [],
    isLoading: false,
    fetchSettlements: vi.fn(),
    deleteSettlement: vi.fn().mockResolvedValue(true),
    calculateAging: () => ({ isOverdue: false, daysSinceIssue: 0, penalty: 0 }),
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
    isAdmin: true,
    user: { id: "admin-1", name: "Administrator" },
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: addToastMock }),
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
    submitLiquidation: vi.fn().mockResolvedValue(true),
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

describe("LiquidationsView — Admin New Request modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountView() {
    return mount(LiquidationsView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          BaseToggleSwitch: true,
          LiquidationTable: true,
          LiquidationReviewModal: true,
          LiquidationReceiptModal: true,
          DecisionConfirmationModal: true,
          DeleteConfirmModal: true,
          BaseModal: {
            name: "BaseModal",
            props: ["isOpen", "title", "description", "maxWidthClass"],
            template: "<div v-if='isOpen' class='base-modal-stub'><slot /></div>",
          },
          LiquidationSettlementForm: {
            name: "LiquidationSettlementForm",
            props: ["selectedAdvance", "disabled", "existingLiquidation"],
            template: "<div class='settlement-form-stub' />",
          },
        },
      },
    });
  }

  it("opens a card picker of the admin's eligible advances from New Request", async () => {
    const wrapper = mountView();

    expect(wrapper.find("#new-liquidation-btn").exists()).toBe(false);

    const button = wrapper.find("#admin-new-liquidation-request-btn");
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain("New Request");

    await button.trigger("mousedown");

    expect(wrapper.vm.isSettlementModalOpen).toBe(true);
    expect(wrapper.vm.settlementModalMode).toBe("settle");
    expect(wrapper.vm.settlementModalStep).toBe("select");
    expect(wrapper.vm.selectedAdvance).toBeNull();

    expect(wrapper.find(".base-modal-stub").exists()).toBe(true);
    expect(wrapper.findComponent(LiquidationAdvancePicker).exists()).toBe(true);
    expect(wrapper.find(".settlement-form-stub").exists()).toBe(false);
    expect(wrapper.find("#admin-liquidation-advance-picker").exists()).toBe(
      false,
    );

    const cardIds = wrapper
      .findAll('[data-testid="liquidation-advance-card"]')
      .map((card) => card.attributes("data-advance-id"));
    expect(cardIds).toEqual(["ca-own-1", "ca-own-2"]);

    // The admin console stays mounted behind the modal — no inline page swap.
    expect(wrapper.find("#admin-new-liquidation-request-btn").exists()).toBe(
      true,
    );
    expect(wrapper.find("#new-liquidation-btn").exists()).toBe(false);
  });

  it("opens the form from a selected card and returns to the card picker with Back", async () => {
    const wrapper = mountView();

    await wrapper
      .find("#admin-new-liquidation-request-btn")
      .trigger("mousedown");

    await wrapper
      .find('[data-testid="liquidation-advance-card"][data-advance-id="ca-own-2"]')
      .trigger("click");

    expect(wrapper.vm.selectedAdvance.id).toBe("ca-own-2");
    expect(wrapper.vm.settlementModalStep).toBe("form");
    expect(wrapper.vm.isSettlementModalOpen).toBe(true);
    expect(wrapper.find(".settlement-form-stub").exists()).toBe(true);

    const backButton = wrapper.find("#back-to-advance-selection");
    expect(backButton.exists()).toBe(true);

    await backButton.trigger("click");

    expect(wrapper.vm.settlementModalStep).toBe("select");
    expect(wrapper.vm.selectedAdvance).toBeNull();
    expect(wrapper.find(".settlement-form-stub").exists()).toBe(false);
    expect(wrapper.findComponent(LiquidationAdvancePicker).exists()).toBe(true);
  });

  it("shows an info toast and keeps the modal closed when the admin has no eligible advance", async () => {
    const backup = [...mockItems];
    mockItems.length = 0;
    try {
      const wrapper = mountView();

      await wrapper
        .find("#admin-new-liquidation-request-btn")
        .trigger("mousedown");

      expect(wrapper.vm.isSettlementModalOpen).toBe(false);
      expect(wrapper.vm.selectedAdvance).toBeNull();
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "info" }),
      );
    } finally {
      mockItems.push(...backup);
    }
  });
});
