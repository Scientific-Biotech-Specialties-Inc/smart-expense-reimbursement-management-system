// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DashboardView from "@/views/DashboardView.vue";
import BaseKpiGrid from "@/components/base/BaseKpiGrid.vue";
import { useAuthStore } from "@/stores/auth";
import { useReimbursementStore } from "@/stores/reimbursement";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { useLiquidationStore } from "@/stores/liquidation";
import { useReceiptStore } from "@/stores/receipts";
import { usePenaltyStore } from "@/stores/penalty";

vi.mock("vue-chartjs", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    Bar: defineComponent({
      name: "Bar",
      props: ["data", "options"],
      render() {
        return h("div", {
          class: "mock-bar-chart",
          "data-testid": "bar-chart",
          "data-labels": JSON.stringify(this.data?.labels),
        });
      },
    }),
    Pie: defineComponent({
      name: "Pie",
      props: ["data", "options"],
      render() {
        return h("div", {
          class: "mock-pie-chart",
          "data-testid": "pie-chart",
          "data-labels": JSON.stringify(this.data?.labels),
        });
      },
    }),
    Line: defineComponent({
      name: "Line",
      props: ["data", "options"],
      render() {
        return h("div", {
          class: "mock-line-chart",
          "data-testid": "line-chart",
          "data-labels": JSON.stringify(this.data?.labels),
        });
      },
    }),
    Doughnut: defineComponent({
      name: "Doughnut",
      props: ["data", "options"],
      render() {
        return h("div", {
          class: "mock-doughnut-chart",
          "data-testid": "doughnut-chart",
        });
      },
    }),
  };
});

describe("DashboardView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders employee dashboard with empty charts without blank cards or errors", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "General Employee", email: "employee@example.com", is_admin: false };

    const rStore = useReimbursementStore();
    rStore.items = [];
    rStore.fetchAll = vi.fn().mockResolvedValue([]);

    const caStore = useCashAdvanceStore();
    caStore.items = [];
    caStore.fetchAll = vi.fn().mockResolvedValue([]);

    const liqStore = useLiquidationStore();
    liqStore.settlements = [];
    liqStore.fetchSettlements = vi.fn().mockResolvedValue([]);

    const receiptsStore = useReceiptStore();
    receiptsStore.receipts = [];
    receiptsStore.fetchAll = vi.fn().mockResolvedValue([]);

    const penaltyStore = usePenaltyStore();
    penaltyStore.fetchMyPenalties = vi.fn().mockResolvedValue({});

    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          SkeletonLoader: true,
          Bar: { template: "<div class='mock-bar-chart'></div>" },
          Line: { template: "<div class='mock-line-chart'></div>" },
          Pie: { template: "<div class='mock-pie-chart'></div>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Welcome back, General");
    expect(wrapper.text()).toContain("Monthly Spending Trend for Reimbursement and My Expense");
    expect(wrapper.text()).toContain("Spending by Category");
    expect(wrapper.text()).toContain("Liquidation Trend");

    // Mock chart components should be rendered
    expect(wrapper.findAll(".mock-bar-chart").length).toBe(1);
    expect(wrapper.findAll(".mock-pie-chart").length).toBe(1);
    expect(wrapper.findAll(".mock-line-chart").length).toBe(1);
  });

  it("renders employee dashboard with populated real data for all three cards", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "John Doe", email: "john@example.com", is_admin: false };

    const currentYear = new Date().getFullYear();

    const rStore = useReimbursementStore();
    rStore.items = [
      {
        id: 1,
        amount: 2500,
        status: "approved",
        date: `${currentYear}-03-15`,
        category: "Travel",
      },
      {
        id: 2,
        amount: 1500,
        status: "granted",
        date: `${currentYear}-08-20`,
        category: "Meals",
      },
    ];
    rStore.fetchAll = vi.fn().mockResolvedValue([]);

    const caStore = useCashAdvanceStore();
    caStore.items = [
      { id: 1, amount: 5000, status: "approved" },
    ];
    caStore.fetchAll = vi.fn().mockResolvedValue([]);

    const liqStore = useLiquidationStore();
    liqStore.settlements = [
      {
        id: 1,
        total_expense_amount: 3200,
        settlement_date: `${currentYear}-08-10`,
      },
    ];
    liqStore.fetchSettlements = vi.fn().mockResolvedValue([]);

    const receiptsStore = useReceiptStore();
    receiptsStore.receipts = [
      {
        id: "RCPT-001",
        amount: 1200,
        date: `${currentYear}-08-05`,
        category: "Supplies",
        isDeleted: false,
      },
      {
        id: "RCPT-002",
        amount: 800,
        date: `${currentYear}-03-10`,
        category: "Meals",
        isDeleted: false,
      },
    ];
    receiptsStore.fetchAll = vi.fn().mockResolvedValue([]);

    const penaltyStore = usePenaltyStore();
    penaltyStore.fetchMyPenalties = vi.fn().mockResolvedValue({});

    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          SkeletonLoader: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Welcome back, John");
    expect(wrapper.findAll(".mock-bar-chart").length).toBe(1);
    expect(wrapper.findAll(".mock-pie-chart").length).toBe(1);
    expect(wrapper.findAll(".mock-line-chart").length).toBe(1);
  });

  it("renders admin dashboard with all 4 charts when admin logs in", async () => {
    const auth = useAuthStore();
    auth.user = { id: 2, name: "Admin User", email: "admin@example.com", is_admin: true };

    const rStore = useReimbursementStore();
    rStore.items = [];
    rStore.fetchAll = vi.fn().mockResolvedValue([]);

    const caStore = useCashAdvanceStore();
    caStore.items = [];
    caStore.fetchAll = vi.fn().mockResolvedValue([]);

    const liqStore = useLiquidationStore();
    liqStore.settlements = [];
    liqStore.fetchSettlements = vi.fn().mockResolvedValue([]);

    const receiptsStore = useReceiptStore();
    receiptsStore.receipts = [];
    receiptsStore.fetchAll = vi.fn().mockResolvedValue([]);

    const penaltyStore = usePenaltyStore();
    penaltyStore.fetchMyPenalties = vi.fn().mockResolvedValue({});

    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          SkeletonLoader: true,
          Bar: { template: "<div class='mock-bar-chart'></div>" },
          Line: { template: "<div class='mock-line-chart'></div>" },
          Pie: { template: "<div class='mock-pie-chart'></div>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Welcome back, Admin");
    expect(wrapper.text()).toContain("Monthly Spending Trend");
    expect(wrapper.text()).toContain("Cash Advance Status Distribution");
    expect(wrapper.text()).toContain("Liquidation Volume");
    expect(wrapper.text()).toContain("Advance vs Outstanding Balance");

    expect(wrapper.findAll(".mock-bar-chart").length).toBe(1);
    expect(wrapper.findAll(".mock-pie-chart").length).toBe(2);
    expect(wrapper.findAll(".mock-line-chart").length).toBe(1);
  });

  it("renders admin dashboard with populated real data for all 4 charts and KPIs", async () => {
    const auth = useAuthStore();
    auth.user = { id: 2, name: "Admin Manager", email: "admin@example.com", is_admin: true };

    const currentYear = new Date().getFullYear();

    const rStore = useReimbursementStore();
    rStore.items = [
      { id: 1, amount: 4500, status: "pending", date: `${currentYear}-05-12` },
      { id: 2, amount: 8000, status: "approved", date: `${currentYear}-08-18` },
    ];
    rStore.fetchAll = vi.fn().mockResolvedValue([]);

    const caStore = useCashAdvanceStore();
    caStore.items = [
      { id: 1, amount: 10000, outstanding_balance: 4000, status: "disbursed" },
      { id: 2, amount: 5000, outstanding_balance: 0, status: "liquidated" },
      { id: 3, amount: 3000, outstanding_balance: 3000, status: "pending" },
    ];
    caStore.fetchAll = vi.fn().mockResolvedValue([]);

    const liqStore = useLiquidationStore();
    liqStore.settlements = [
      { id: 1, total_expense_amount: 5000, settlement_date: `${currentYear}-08-10` },
      { id: 2, total_expense_amount: 6000, settlement_date: `${currentYear}-05-20` },
    ];
    liqStore.fetchSettlements = vi.fn().mockResolvedValue([]);

    const receiptsStore = useReceiptStore();
    receiptsStore.receipts = [
      { id: "RCPT-101", amount: 2000, date: `${currentYear}-08-01`, category: "Travel", isDeleted: false },
    ];
    receiptsStore.fetchAll = vi.fn().mockResolvedValue([]);

    const penaltyStore = usePenaltyStore();
    penaltyStore.fetchMyPenalties = vi.fn().mockResolvedValue({});

    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          SkeletonLoader: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Welcome back, Admin");
    expect(wrapper.text()).toContain("Monthly Spending Trend");
    expect(wrapper.text()).toContain("Cash Advance Status Distribution");
    expect(wrapper.text()).toContain("Liquidation Volume");
    expect(wrapper.text()).toContain("Advance vs Outstanding Balance");

    expect(wrapper.findAll(".mock-bar-chart").length).toBe(1);
    expect(wrapper.findAll(".mock-pie-chart").length).toBe(2);
    expect(wrapper.findAll(".mock-line-chart").length).toBe(1);
  });

  it("renders PenaltyStatusBanner for non-admin employees with active strikes and hides it for admins", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Employee", email: "employee@example.com", is_admin: false };

    const rStore = useReimbursementStore();
    rStore.fetchAll = vi.fn().mockResolvedValue([]);
    const caStore = useCashAdvanceStore();
    caStore.fetchAll = vi.fn().mockResolvedValue([]);
    const liqStore = useLiquidationStore();
    liqStore.fetchSettlements = vi.fn().mockResolvedValue([]);
    const receiptsStore = useReceiptStore();
    receiptsStore.fetchAll = vi.fn().mockResolvedValue([]);

    const penaltyStore = usePenaltyStore();
    penaltyStore.activeStrikesCount = 1;
    penaltyStore.standing = "warning";
    penaltyStore.fetchMyPenalties = vi.fn().mockResolvedValue({});

    const employeeWrapper = mount(DashboardView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          SkeletonLoader: true,
          PenaltyStatusBanner: { template: "<div data-testid='dashboard-penalty-banner'></div>" },
        },
      },
    });
    expect(employeeWrapper.find('[data-testid="dashboard-penalty-banner"]').exists()).toBe(true);

    auth.user = { id: 2, name: "Admin", email: "admin@example.com", is_admin: true };
    const adminWrapper = mount(DashboardView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          SkeletonLoader: true,
          PenaltyStatusBanner: { template: "<div data-testid='dashboard-penalty-banner'></div>" },
        },
      },
    });
    expect(adminWrapper.find('[data-testid="dashboard-penalty-banner"]').exists()).toBe(false);
  });

  it("replaces Total Reimbursement Request with Total Current Penalties showing current-cycle strikes on employee dashboard", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Employee", email: "employee@example.com", is_admin: false };

    const rStore = useReimbursementStore();
    rStore.items = [{ id: 1, amount: 1000, status: "approved", date: "2026-08-01" }];
    rStore.fetchAll = vi.fn().mockResolvedValue([]);
    const caStore = useCashAdvanceStore();
    caStore.items = [];
    caStore.fetchAll = vi.fn().mockResolvedValue([]);
    const liqStore = useLiquidationStore();
    liqStore.settlements = [];
    liqStore.fetchSettlements = vi.fn().mockResolvedValue([]);
    const receiptsStore = useReceiptStore();
    receiptsStore.receipts = [];
    receiptsStore.fetchAll = vi.fn().mockResolvedValue([]);

    const penaltyStore = usePenaltyStore();
    penaltyStore.activeStrikesCount = 2;
    penaltyStore.strikeLimit = 3;
    penaltyStore.standing = "warning";
    penaltyStore.fetchMyPenalties = vi.fn().mockResolvedValue({});

    const wrapper = mount(DashboardView, {
      global: {
        stubs: {
          SkeletonLoader: true,
          PenaltyStatusBanner: true,
        },
      },
    });
    await flushPromises();

    const kpis = wrapper.findComponent(BaseKpiGrid).props("kpis");
    const labels = kpis.map((k) => k.label);

    expect(labels).not.toContain("Total Reimbursement Request");
    expect(labels).toContain("Total Current Penalties");

    const penaltyKpi = kpis.find((k) => k.label === "Total Current Penalties");
    expect(penaltyKpi.value).toBe(2);
    expect(wrapper.text()).toContain("Total Current Penalties");
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).not.toContain("/3");
  });
});
