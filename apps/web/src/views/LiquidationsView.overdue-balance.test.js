// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import LiquidationsView from "@/views/LiquidationsView.vue";

const { mockItems, mockSettlements } = vi.hoisted(() => ({
  mockItems: [
    {
      id: 19,
      userId: "user-1",
      amount: 10000,
      balance: 10250,
      outstanding_balance: 10250,
      status: "overdue",
      acknowledgedAt: "2026-11-01",
      purpose: "Overdue Onsite",
      date: "2026-11-01",
      dueDate: "2026-11-08",
      penalties: [
        { days_overdue: 1, penalty_amount: 50 },
        { days_overdue: 2, penalty_amount: 50 },
        { days_overdue: 3, penalty_amount: 50 },
        { days_overdue: 4, penalty_amount: 50 },
        { days_overdue: 5, penalty_amount: 50 },
      ],
    },
  ],
  mockSettlements: [
    {
      id: 7,
      cash_advance_id: 19,
      user_id: "user-1",
      status: "pending",
      total_expense_amount: 10000,
      outstanding_balance: 10250,
      cash_advance: {
        id: 19,
        amount: 10000,
        outstanding_balance: 10250,
        status: "overdue",
        expected_liquidation_date: "2026-11-08",
        penalties: [
          { days_overdue: 1, penalty_amount: 50 },
          { days_overdue: 2, penalty_amount: 50 },
          { days_overdue: 3, penalty_amount: 50 },
          { days_overdue: 4, penalty_amount: 50 },
          { days_overdue: 5, penalty_amount: 50 },
        ],
      },
      audit_trail: [
        {
          id: "liq-audit-7",
          action_type: "LIQUIDATION_SUBMITTED",
          label: "Submitted",
          actor_name: "Employee",
          created_at: "2026-11-05T10:00:00Z",
        },
      ],
      receipts: [
        {
          id: 101,
          vendor_name: "Jollibee",
          total_amount: 10000,
          vat_amount: 1071.43,
          transaction_date: "2026-11-05",
          status: "approved",
        },
      ],
      user: { id: "user-1", name: "Employee" },
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
    settlements: mockSettlements,
    isLoading: false,
    fetchSettlements: vi.fn(),
    deleteSettlement: vi.fn(),
    calculateAging: () => ({ isOverdue: true, daysOverdue: 5, penalty: 250 }),
  }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({ categories: [], fetchCategories: vi.fn() }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAdmin: true,
    user: { id: "admin-1", name: "Admin" },
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

vi.mock("@/composables/liquidations/useLiquidationSubmit", () => ({
  useLiquidationSubmit: () => ({
    submitting: ref(false),
    submitLiquidation: vi.fn(),
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
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

describe("LiquidationsView — Penalty-inclusive balance & status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountView() {
    return mount(LiquidationsView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          BaseUtilityToolbar: true,
          LiquidationTable: true,
          LiquidationReviewModal: true,
          LiquidationReceiptModal: true,
          DecisionConfirmationModal: true,
          DeleteConfirmModal: true,
          BaseModal: true,
          LiquidationSettlementForm: true,
        },
      },
    });
  }

  it("treats receipts equal to requested amount (10,000) as Incomplete/Overdue when balance with penalty is 10,250", () => {
    const wrapper = mountView();
    const row = wrapper.vm.sourceCases[0];

    expect(row.cashAdvanceAmount).toBe(10000);
    expect(row.outstandingBalance).toBe(10250);
    expect(row.penaltiesTotal).toBe(250);
    expect(wrapper.vm.calculateLiquidationStatus(row, 10000)).toBe("Overdue");
    expect(wrapper.vm.calculateLiquidationStatus(row, 10250)).toBe("Liquidated");
    expect(wrapper.vm.calculateLiquidationStatus(row, 12500)).toBe("Overpayment");
  });

  it("computes variance and overpaymentAmount in composer using penalty-inclusive balance", () => {
    const wrapper = mountView();
    wrapper.vm.selectAdvance(mockItems[0]);

    // 10,250 balance - 10,000 receipts = 250 shortfall
    expect(wrapper.vm.variance).toBe(250);
    expect(wrapper.vm.liquidationOutstandingBalance).toBe(250);
    expect(wrapper.vm.overpaymentAmount).toBe(0);
    expect(wrapper.vm.liquidationStatus).toBe("Incomplete");
  });

  it("preserves audit_trail on mapped sourceCases rows for LiquidationReviewModal", () => {
    const wrapper = mountView();
    const row = wrapper.vm.sourceCases[0];
    expect(row.audit_trail).toHaveLength(1);
    expect(row.audit_trail[0].id).toBe("liq-audit-7");
  });
});
