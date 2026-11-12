// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ReimbursementsView from "@/views/ReimbursementsView.vue";
import ReimbursementDetailsModal from "@/components/reimbursements/ReimbursementDetailsModal.vue";
import ReimbursementsTable from "@/components/reimbursements/ReimbursementsTable.vue";

const pushMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const mockItems = [
  {
    id: 42,
    status: "revise",
    description: "Team meeting dinner",
    amount: 1500,
    date: "2026-10-15",
    user_id: 10,
    user: { id: 10, name: "Employee User" },
    admin_notes: "Please provide official receipt",
    receipts: [],
  },
];

vi.mock("@/stores/reimbursement", () => ({
  useReimbursementStore: () => ({
    items: mockItems,
    totalAmount: 1500,
    isLoading: false,
    fetchAll: vi.fn(),
    deleteRequest: vi.fn(),
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAdmin: false,
    user: { id: 10, name: "Employee User" },
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

vi.mock("@/composables/useOcrMode", () => ({
  useOcrMode: () => ({
    isMockOcr: false,
    setMockMode: vi.fn(),
  }),
}));

vi.mock("@/composables/useNotificationDeepLink", () => ({
  useNotificationDeepLink: () => ({
    checkDeepLink: vi.fn(),
  }),
}));

describe("ReimbursementsView — Edit & Resubmit navigation", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("navigates to ReimbursementEdit with id param when ReimbursementDetailsModal emits edit with record object", async () => {
    const wrapper = mount(ReimbursementsView, {
      global: {
        stubs: {
          BaseButton: true,
          BaseToggleSwitch: true,
          BaseKpiGrid: true,
          BaseUtilityToolbar: true,
          ReceiptDetailsModal: true,
          DecisionConfirmationModal: true,
          GrantPayoutModal: true,
          DeleteConfirmModal: true,
          StatusBadge: true,
        },
      },
    });

    const detailsModal = wrapper.findComponent(ReimbursementDetailsModal);
    expect(detailsModal.exists()).toBe(true);

    // Emit edit with full record object
    await detailsModal.vm.$emit("edit", mockItems[0]);

    expect(pushMock).toHaveBeenCalledWith({
      name: "ReimbursementEdit",
      params: { id: 42 },
    });
  });

  it("navigates to ReimbursementEdit with id param when ReimbursementDetailsModal emits edit with primitive ID", async () => {
    const wrapper = mount(ReimbursementsView, {
      global: {
        stubs: {
          BaseButton: true,
          BaseToggleSwitch: true,
          BaseKpiGrid: true,
          BaseUtilityToolbar: true,
          ReceiptDetailsModal: true,
          DecisionConfirmationModal: true,
          GrantPayoutModal: true,
          DeleteConfirmModal: true,
          StatusBadge: true,
        },
      },
    });

    const detailsModal = wrapper.findComponent(ReimbursementDetailsModal);
    expect(detailsModal.exists()).toBe(true);

    // Emit edit with primitive ID
    await detailsModal.vm.$emit("edit", 42);

    expect(pushMock).toHaveBeenCalledWith({
      name: "ReimbursementEdit",
      params: { id: 42 },
    });
  });

  it("navigates to ReimbursementEdit when table row emits edit-request", async () => {
    const wrapper = mount(ReimbursementsView, {
      global: {
        stubs: {
          BaseButton: true,
          BaseToggleSwitch: true,
          BaseKpiGrid: true,
          BaseUtilityToolbar: true,
          ReceiptDetailsModal: true,
          DecisionConfirmationModal: true,
          GrantPayoutModal: true,
          DeleteConfirmModal: true,
          StatusBadge: true,
        },
      },
    });

    const table = wrapper.findComponent(ReimbursementsTable);
    expect(table.exists()).toBe(true);

    await table.vm.$emit("edit-request", mockItems[0]);

    expect(pushMock).toHaveBeenCalledWith({
      name: "ReimbursementEdit",
      params: { id: 42 },
    });
  });
});
