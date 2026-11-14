// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import MyExpenseView from "@/views/MyExpenseView.vue";

const mockAddToast = vi.fn();
const mockVerifyPassword = vi.fn();
const mockSoftDelete = vi.fn();
const mockFetchAll = vi.fn().mockResolvedValue([]);

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

const mockReceiptsStore = {
  receipts: [],
  visibleReceipts: [
    {
      id: "RCPT-2026-001",
      dbId: 1,
      vendorName: "Attached Vendor",
      amount: 1500,
      status: "processed",
      isDeleted: false,
      reimbursementCount: 1,
      isReimbursed: true,
      category: "Meals",
      date: "2026-05-10",
      createdAt: "2026-05-10T00:00:00Z",
    },
  ],
  categories: [],
  pagination: { total: 1 },
  fetchAll: mockFetchAll,
  fetchCategories: vi.fn().mockResolvedValue([]),
  softDelete: mockSoftDelete,
  refreshReceipt: vi.fn(),
};

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => mockReceiptsStore,
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAdmin: false,
    user: { id: 1, name: "Test User", email: "test@example.com" },
    verifyPassword: mockVerifyPassword,
  }),
}));

vi.mock("@/composables/useNotificationDeepLink", () => ({
  useNotificationDeepLink: () => ({
    checkDeepLink: vi.fn(),
  }),
}));

describe("MyExpenseView — Receipt Deletion Error Handling (422 linked to reimbursement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mountView = () => {
    return mount(MyExpenseView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          BasePagination: true,
          BaseUtilityToolbar: true,
          ReceiptViewModal: true,
          ExpenseCard: {
            props: ["expense"],
            template: `<div class="expense-card">
              <button class="delete-btn" @click="$emit('delete', expense.id)">Delete</button>
            </div>`,
          },
          ExpenseCardSkeleton: true,
          ReceiptUploadModal: true,
          DeleteConfirmModal: {
            props: ["modelValue", "loading"],
            emits: ["update:modelValue", "confirm"],
            template: `<div v-if="modelValue" class="delete-modal">
              <button class="confirm-btn" :disabled="loading" @click="$emit('confirm', 'valid-password')">Confirm</button>
            </div>`,
          },
          StatusBadge: true,
        },
      },
    });
  };

  it("triggers error toast and closes modal when deleting a receipt returns 422 (linked to reimbursement)", async () => {
    mockVerifyPassword.mockResolvedValue(true);
    const errorMessage = "Cannot delete a receipt that is attached to a reimbursement.";
    mockSoftDelete.mockRejectedValue(new Error(errorMessage));

    const wrapper = mountView();

    // Trigger delete on the card
    const deleteBtn = wrapper.find(".delete-btn");
    expect(deleteBtn.exists()).toBe(true);
    await deleteBtn.trigger("click");

    expect(wrapper.vm.deleteModalOpen).toBe(true);

    // Confirm deletion with password
    const confirmBtn = wrapper.find(".confirm-btn");
    expect(confirmBtn.exists()).toBe(true);
    await confirmBtn.trigger("click");
    await wrapper.vm.$nextTick();

    // Verification: softDelete was called
    expect(mockSoftDelete).toHaveBeenCalledWith("RCPT-2026-001");

    // Verification: Toast message was triggered with the 422 error message
    expect(mockAddToast).toHaveBeenCalledWith({
      message: errorMessage,
      type: "error",
    });

    // Verification: Delete modal is closed
    expect(wrapper.vm.deleteModalOpen).toBe(false);
  });

  it("triggers success toast and closes modal when delete succeeds", async () => {
    mockVerifyPassword.mockResolvedValue(true);
    mockSoftDelete.mockResolvedValue(true);

    const wrapper = mountView();

    // Trigger delete on the card
    await wrapper.find(".delete-btn").trigger("click");
    expect(wrapper.vm.deleteModalOpen).toBe(true);

    // Confirm deletion
    await wrapper.find(".confirm-btn").trigger("click");
    await wrapper.vm.$nextTick();

    expect(mockSoftDelete).toHaveBeenCalledWith("RCPT-2026-001");
    expect(mockAddToast).toHaveBeenCalledWith({
      message: "Receipt removed.",
      type: "success",
    });
    expect(wrapper.vm.deleteModalOpen).toBe(false);
  });
});
