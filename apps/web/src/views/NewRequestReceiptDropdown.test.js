// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ReimbursementsView from "@/views/ReimbursementsView.vue";
import MyExpenseView from "@/views/MyExpenseView.vue";
import FileUpload from "@/components/base/FileUpload.vue";
import BaseButton from "@/components/base/BaseButton.vue";

const pushMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
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

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({
    visibleReceipts: [],
    pagination: { total: 0 },
    categories: [],
    fetchAll: vi.fn().mockResolvedValue([]),
    fetchReceipts: vi.fn(),
    fetchCategories: vi.fn().mockResolvedValue([]),
    deleteReceipt: vi.fn(),
    saveReceipt: vi.fn(),
    refreshReceipt: vi.fn(),
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

const toolbarStub = {
  template: "<div><slot name='actions' /><slot /></div>",
};

describe("New Request / Upload Receipt Dropdown Tests", () => {
  beforeEach(() => {
    pushMock.mockClear();
    delete window.__serms_pending_upload;
    delete window.__serms_pending_files;
  });

  describe("ReimbursementsView — New Request dropdown", () => {
    it("toggles dropdown and contains Single Receipt and Multi Receipt options", async () => {
      const wrapper = mount(ReimbursementsView, {
        global: {
          stubs: {
            BaseToggleSwitch: true,
            BaseKpiGrid: true,
            BaseUtilityToolbar: toolbarStub,
            ReceiptDetailsModal: true,
            DecisionConfirmationModal: true,
            GrantPayoutModal: true,
            DeleteConfirmModal: true,
            StatusBadge: true,
            ReimbursementDetailsModal: true,
            ReimbursementsTable: true,
          },
        },
      });

      const dropdownBtn = wrapper.find("#new-reimbursement-btn");
      expect(dropdownBtn.exists()).toBe(true);

      // Initially closed
      expect(wrapper.find("#new-request-single-btn").exists()).toBe(false);

      // Open dropdown
      await dropdownBtn.trigger("click");
      expect(wrapper.find("#new-request-single-btn").exists()).toBe(true);
      expect(wrapper.find("#new-request-multi-btn").exists()).toBe(true);
      expect(wrapper.find("#new-request-single-btn").text()).toContain("Single Receipt");
      expect(wrapper.find("#new-request-multi-btn").text()).toContain("Multi Receipt");
    });

    it("single receipt mode sets single file on window.__serms_pending_upload and navigates", async () => {
      const wrapper = mount(ReimbursementsView, {
        global: {
          stubs: {
            BaseToggleSwitch: true,
            BaseKpiGrid: true,
            BaseUtilityToolbar: toolbarStub,
            ReceiptDetailsModal: true,
            DecisionConfirmationModal: true,
            GrantPayoutModal: true,
            DeleteConfirmModal: true,
            StatusBadge: true,
            ReimbursementDetailsModal: true,
            ReimbursementsTable: true,
          },
        },
      });

      await wrapper.find("#new-reimbursement-btn").trigger("click");
      await wrapper.find("#new-request-single-btn").trigger("click");

      const fileInput = wrapper.find("input[type='file']");
      expect(fileInput.element.multiple).toBe(false);

      const fakeFile1 = new File(["test1"], "receipt1.jpg", { type: "image/jpeg" });
      const fakeFile2 = new File(["test2"], "receipt2.jpg", { type: "image/jpeg" });

      // Trigger change with multiple files to test strictly taking first file
      Object.defineProperty(fileInput.element, "files", {
        value: [fakeFile1, fakeFile2],
        writable: true,
      });
      await fileInput.trigger("change");

      expect(window.__serms_pending_upload).toBeDefined();
      expect(window.__serms_pending_upload.mode).toBe("single");
      expect(window.__serms_pending_upload.files.length).toBe(1);
      expect(window.__serms_pending_upload.files[0].name).toBe("receipt1.jpg");
      expect(pushMock).toHaveBeenCalledWith("/reimbursements/new");
    });

    it("multi receipt mode passes all files to window.__serms_pending_upload and navigates", async () => {
      const wrapper = mount(ReimbursementsView, {
        global: {
          stubs: {
            BaseToggleSwitch: true,
            BaseKpiGrid: true,
            BaseUtilityToolbar: toolbarStub,
            ReceiptDetailsModal: true,
            DecisionConfirmationModal: true,
            GrantPayoutModal: true,
            DeleteConfirmModal: true,
            StatusBadge: true,
            ReimbursementDetailsModal: true,
            ReimbursementsTable: true,
          },
        },
      });

      await wrapper.find("#new-reimbursement-btn").trigger("click");
      await wrapper.find("#new-request-multi-btn").trigger("click");

      const fileInput = wrapper.find("input[type='file']");
      expect(fileInput.element.multiple).toBe(true);

      const fakeFile1 = new File(["test1"], "part1.jpg", { type: "image/jpeg" });
      const fakeFile2 = new File(["test2"], "part2.jpg", { type: "image/jpeg" });

      Object.defineProperty(fileInput.element, "files", {
        value: [fakeFile1, fakeFile2],
        writable: true,
      });
      await fileInput.trigger("change");

      expect(window.__serms_pending_upload).toBeDefined();
      expect(window.__serms_pending_upload.mode).toBe("multi");
      expect(window.__serms_pending_upload.files.length).toBe(2);
      expect(pushMock).toHaveBeenCalledWith("/reimbursements/new");
    });
  });

  describe("MyExpenseView — Upload Receipt dropdown", () => {
    it("toggles dropdown and contains Single Receipt and Multi Receipt options", async () => {
      const wrapper = mount(MyExpenseView, {
        global: {
          stubs: {
            BaseKpiGrid: true,
            BasePagination: true,
            BaseUtilityToolbar: toolbarStub,
            ReceiptViewModal: true,
            ExpenseCard: true,
            ExpenseCardSkeleton: true,
            ReceiptUploadModal: true,
            DeleteConfirmModal: true,
            StatusBadge: true,
          },
        },
      });

      const dropdownBtn = wrapper.find("#upload-receipt-btn");
      expect(dropdownBtn.exists()).toBe(true);

      expect(wrapper.find("#my-expense-single-btn").exists()).toBe(false);

      await dropdownBtn.trigger("click");
      expect(wrapper.find("#my-expense-single-btn").exists()).toBe(true);
      expect(wrapper.find("#my-expense-multi-btn").exists()).toBe(true);
      expect(wrapper.find("#my-expense-single-btn").text()).toContain("Single Receipt");
      expect(wrapper.find("#my-expense-multi-btn").text()).toContain("Multi Receipt");
    });

    it("single receipt sets pendingUpload with 1 file and opens modal", async () => {
      const wrapper = mount(MyExpenseView, {
        global: {
          stubs: {
            BaseKpiGrid: true,
            BasePagination: true,
            BaseUtilityToolbar: toolbarStub,
            ReceiptViewModal: true,
            ExpenseCard: true,
            ExpenseCardSkeleton: true,
            ReceiptUploadModal: true,
            DeleteConfirmModal: true,
            StatusBadge: true,
          },
        },
      });

      await wrapper.find("#upload-receipt-btn").trigger("click");
      await wrapper.find("#my-expense-single-btn").trigger("click");

      const fileInput = wrapper.find("input[type='file']");
      const fakeFile1 = new File(["test1"], "single.jpg", { type: "image/jpeg" });
      const fakeFile2 = new File(["test2"], "single2.jpg", { type: "image/jpeg" });

      Object.defineProperty(fileInput.element, "files", {
        value: [fakeFile1, fakeFile2],
        writable: true,
      });
      await fileInput.trigger("change");

      expect(wrapper.vm.uploadModalOpen).toBe(true);
      expect(wrapper.vm.pendingUpload).toEqual({
        mode: "single",
        files: [fakeFile1],
      });
    });

    it("multi receipt with 1 file gracefully falls back to single receipt", async () => {
      const wrapper = mount(MyExpenseView, {
        global: {
          stubs: {
            BaseKpiGrid: true,
            BasePagination: true,
            BaseUtilityToolbar: toolbarStub,
            ReceiptViewModal: true,
            ExpenseCard: true,
            ExpenseCardSkeleton: true,
            ReceiptUploadModal: true,
            DeleteConfirmModal: true,
            StatusBadge: true,
          },
        },
      });

      await wrapper.find("#upload-receipt-btn").trigger("click");
      await wrapper.find("#my-expense-multi-btn").trigger("click");

      const fileInput = wrapper.find("input[type='file']");
      const fakeFile = new File(["single"], "single.jpg", { type: "image/jpeg" });

      Object.defineProperty(fileInput.element, "files", {
        value: [fakeFile],
        writable: true,
      });
      await fileInput.trigger("change");

      expect(wrapper.vm.uploadModalOpen).toBe(true);
      expect(wrapper.vm.pendingUpload.mode).toBe("single");
      expect(wrapper.vm.pendingUpload.files.length).toBe(1);
    });
  });

  describe("FileUpload.vue — Single vs Multi selection", () => {
    it("renders Single Receipt and Multi Receipt in empty state dropdown", async () => {
      const wrapper = mount(FileUpload, {
        props: {
          modelValue: [],
        },
        global: {
          stubs: {
            ConfirmModal: true,
            ReceiptQualityRejectionModal: true,
          },
        },
      });

      // Find select files dropdown button
      const selectBtn = wrapper.find("button.bg-primary");
      expect(selectBtn.exists()).toBe(true);
      expect(selectBtn.text()).toContain("Select Files");

      await selectBtn.trigger("click");
      const buttons = wrapper.findAll("button");
      const singleOpt = buttons.find((b) => b.text().includes("Single Receipt"));
      const multiOpt = buttons.find((b) => b.text().includes("Multi Receipt"));

      expect(singleOpt).toBeDefined();
      expect(multiOpt).toBeDefined();
    });

    it("strictly takes first file in single receipt mode", async () => {
      const wrapper = mount(FileUpload, {
        props: {
          modelValue: [],
        },
        global: {
          stubs: {
            ConfirmModal: true,
            ReceiptQualityRejectionModal: true,
          },
        },
      });

      const file1 = new File(["content1"], "f1.jpg", { type: "image/jpeg" });
      const file2 = new File(["content2"], "f2.jpg", { type: "image/jpeg" });

      // Call processFiles in single mode
      wrapper.vm.processFiles([file1, file2], "single");

      expect(wrapper.vm.files.length).toBe(1);
      expect(wrapper.vm.files[0].pages.length).toBe(1);
      expect(wrapper.vm.files[0].fileName).toBe("f1.jpg");
    });

    it("creates multi-page entry in multi receipt mode", async () => {
      const wrapper = mount(FileUpload, {
        props: {
          modelValue: [],
        },
        global: {
          stubs: {
            ConfirmModal: true,
            ReceiptQualityRejectionModal: true,
          },
        },
      });

      const file1 = new File(["content1"], "page1.jpg", { type: "image/jpeg" });
      const file2 = new File(["content2"], "page2.jpg", { type: "image/jpeg" });

      wrapper.vm.processFiles([file1, file2], "multi");

      expect(wrapper.vm.files.length).toBe(1);
      expect(wrapper.vm.files[0].pages.length).toBe(2);
      expect(wrapper.vm.files[0].name).toContain("Multi-page Receipt (2 pages)");
    });
  });

  describe("BaseButton — Click emission behavior", () => {
    it("suppresses duplicate click event on subsequent click after mousedown", async () => {
      const wrapper = mount(BaseButton);
      await wrapper.trigger("mousedown");
      expect(wrapper.emitted("click")).toHaveLength(1);

      await wrapper.trigger("click");
      // Still length 1 — duplicate suppressed!
      expect(wrapper.emitted("click")).toHaveLength(1);
    });
  });

  describe("Outside click behavior", () => {
    it("closes ReimbursementsView dropdown on outside window click but preserves it when clicking inside", async () => {
      const wrapper = mount(ReimbursementsView, {
        attachTo: document.body,
        global: {
          stubs: {
            BaseToggleSwitch: true,
            BaseKpiGrid: true,
            BaseUtilityToolbar: toolbarStub,
            ReceiptDetailsModal: true,
            DecisionConfirmationModal: true,
            GrantPayoutModal: true,
            DeleteConfirmModal: true,
            StatusBadge: true,
            ReimbursementDetailsModal: true,
            ReimbursementsTable: true,
          },
        },
      });

      const dropdownBtn = wrapper.find("#new-reimbursement-btn");
      await dropdownBtn.trigger("click");
      expect(wrapper.vm.isDropdownOpen).toBe(true);

      // Click inside dropdown container
      const dropdownEl = wrapper.find({ ref: "dropdownRef" });
      await dropdownEl.trigger("click");
      expect(wrapper.vm.isDropdownOpen).toBe(true);

      // Dispatch window click from outside
      window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(wrapper.vm.isDropdownOpen).toBe(false);
      wrapper.unmount();
    });
  });
});
