// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CashAdvanceDetailsModal from "./CashAdvanceDetailsModal.vue";

const mockExportReport = vi.fn(() => Promise.resolve(true));
vi.mock("@/composables/useReportExport", () => ({
  useReportExport: () => ({
    isExporting: ref(false),
    exportReport: mockExportReport,
  }),
}));

const mockAuth = {
  isAdmin: true,
  user: { id: 99, name: "Admin User" },
};
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => mockAuth,
}));

describe("CashAdvanceDetailsModal — Export Report (G2-056, G2-059)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders Export Report button beside Disburse in Admin view without triggering Disburse (G2-059)", async () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 15,
          userId: 10,
          requestedBy: "Juan Dela Cruz",
          purpose: "Field Calibration",
          amount: 5000,
          balance: 5000,
          date: "2026-10-01",
          dueDate: "2026-10-10",
          status: "approved",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-cash-advance-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.text()).toContain("Export Report");

    await exportBtn.trigger("click");
    expect(mockExportReport).toHaveBeenCalledWith("cash-advance", 15);
  });

  it("renders Export Report button in Employee Cash Advance view modal for any status (G2-056)", async () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 21,
          userId: 10,
          requestedBy: "Juan Dela Cruz",
          purpose: "Reagent Delivery",
          amount: 3200,
          balance: 3200,
          date: "2026-10-05",
          dueDate: "2026-10-12",
          status: "pending",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-cash-advance-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    await exportBtn.trigger("click");
    expect(mockExportReport).toHaveBeenCalledWith("cash-advance", 21);
  });

  it("passes layout='serpentine' to UnifiedRoadmapStepper when overpayment exists (Admin)", async () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 15,
          userId: 10,
          amount: 5000,
          balance: 5000,
          overpayment_amount: 1500,
          status: "settled",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: {
            name: "UnifiedRoadmapStepper",
            props: ["layout", "overpaymentAmount"],
            template: "<div data-testid='stepper' :data-layout='layout'></div>",
          },
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const stepper = wrapper.find('[data-testid="stepper"]');
    expect(stepper.attributes("data-layout")).toBe("serpentine");
  });

  it("passes layout='serpentine' to UnifiedRoadmapStepper when overpayment exists (Employee)", async () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 21,
          userId: 99,
          amount: 3200,
          balance: 3200,
          overpayment_amount: 800,
          status: "settled",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: {
            name: "UnifiedRoadmapStepper",
            props: ["layout", "overpaymentAmount"],
            template: "<div data-testid='stepper' :data-layout='layout'></div>",
          },
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const stepper = wrapper.find('[data-testid="stepper"]');
    expect(stepper.attributes("data-layout")).toBe("serpentine");
  });

  it("renders BaseAuditTrail in Admin view", () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 30,
          userId: 12,
          amount: 2000,
          balance: 2000,
          status: "pending",
          audit_trail: [
            {
              id: "ca-log-1",
              action_type: "CASH_ADVANCE_SUBMITTED",
              label: "Submitted",
              actor_name: "Carlo Gomez",
              created_at: "2026-10-22T08:00:00Z",
            },
          ],
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Audit Trail (1)");
    expect(wrapper.text()).toContain("Carlo Gomez");
  });

  it("renders BaseAuditTrail in Employee view", () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 31,
          userId: 99,
          amount: 2500,
          balance: 2500,
          status: "pending",
          audit_trail: [
            {
              id: "ca-log-2",
              action_type: "CASH_ADVANCE_SUBMITTED",
              label: "Submitted",
              actor_name: "Elena Cruz",
              created_at: "2026-10-22T09:00:00Z",
            },
          ],
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Audit Trail (1)");
    expect(wrapper.text()).toContain("Elena Cruz");
  });

  describe("Modal Button Sizing Guardrails", () => {
    it("sizes admin action buttons intrinsically without flex-1 or fixed max-w", () => {
      mockAuth.isAdmin = true;
      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 40,
            userId: 10,
            requestedBy: "Pedro Cruz",
            amount: 3000,
            balance: 3000,
            status: "pending",
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
          },
        },
      });

      const approveBtn = wrapper.findAll("button").find((b) => b.text().includes("Approve"));
      expect(approveBtn).toBeDefined();
      expect(approveBtn.classes()).not.toContain("flex-1");
      expect(approveBtn.classes()).not.toContain("sm:max-w-[200px]");
      expect(approveBtn.classes()).toContain("px-5");

      const selectWrapper = wrapper.find("select").element.parentElement;
      expect(selectWrapper.classList.contains("flex-1")).toBe(false);
      expect(selectWrapper.classList.contains("sm:max-w-[200px]")).toBe(false);
    });

    it("sizes disburse button intrinsically without flex-1 or fixed max-w", () => {
      mockAuth.isAdmin = true;
      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 41,
            userId: 10,
            requestedBy: "Pedro Cruz",
            amount: 3000,
            balance: 3000,
            status: "approved",
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
          },
        },
      });

      const disburseBtn = wrapper.findAll("button").find((b) => b.text().includes("Disburse"));
      expect(disburseBtn).toBeDefined();
      expect(disburseBtn.classes()).not.toContain("flex-1");
      expect(disburseBtn.classes()).not.toContain("sm:max-w-[220px]");
      expect(disburseBtn.classes()).toContain("px-5");
    });
  });
});
