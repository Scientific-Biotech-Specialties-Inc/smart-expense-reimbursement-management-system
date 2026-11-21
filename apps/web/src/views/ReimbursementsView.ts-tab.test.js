// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ReimbursementsView from "@/views/ReimbursementsView.vue";

const { authState } = vi.hoisted(() => ({
  authState: {
    isAdmin: false,
    user: { id: 10, name: "Employee User" },
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/stores/reimbursement", () => ({
  useReimbursementStore: () => ({
    items: [],
    totalAmount: 0,
    isLoading: false,
    fetchAll: vi.fn(),
    deleteRequest: vi.fn(),
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => authState,
}));

vi.mock("@/stores/ts", () => ({
  useTsStore: () => ({
    tickets: [],
    ticketsAvailable: true,
    ticketsError: "",
    loadingTickets: false,
    fetchTickets: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/composables/useNotificationDeepLink", () => ({
  useNotificationDeepLink: () => ({ checkDeepLink: vi.fn() }),
}));

describe("ReimbursementsView — TS Tickets Tab Visibility & Switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mountView() {
    return mount(ReimbursementsView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          BaseUtilityToolbar: true,
          ReimbursementsTable: true,
          ReimbursementDetailsModal: true,
          ReceiptDetailsModal: true,
          DecisionConfirmationModal: true,
          GrantPayoutModal: true,
          DeleteConfirmModal: true,
          CmsRecurringExpensesPanel: { template: "<div data-testid='cms-panel-stub' />" },
          TsTicketsPanel: { template: "<div data-testid='ts-panel-stub' />" },
        },
      },
    });
  }

  it("shows Reimbursement Requests and Tickets (TS) tabs to non-admin users, hiding Recurring Expenses (CMS)", async () => {
    authState.isAdmin = false;
    const wrapper = mountView();
    await flushPromises();

    const tabs = wrapper.findAll('[role="tab"]');
    const tabTexts = tabs.map((t) => t.text().trim());
    expect(tabTexts).toEqual(["Reimbursement Requests", "Tickets (TS)"]);
    expect(wrapper.find('[data-testid="ts-panel-stub"]').exists()).toBe(false);

    const ticketsTab = tabs.find((t) => t.text().includes("Tickets (TS)"));
    await ticketsTab.trigger("click");
    expect(wrapper.find('[data-testid="ts-panel-stub"]').exists()).toBe(true);
  });

  it("shows Recurring Expenses (CMS) tab for admins alongside Tickets (TS)", async () => {
    authState.isAdmin = true;
    const wrapper = mountView();
    await flushPromises();

    const tabs = wrapper.findAll('[role="tab"]');
    const tabTexts = tabs.map((t) => t.text().trim());
    expect(tabTexts).toEqual([
      "Reimbursement Requests",
      "Tickets (TS)",
      "Recurring Expenses (CMS)",
    ]);
  });
});
