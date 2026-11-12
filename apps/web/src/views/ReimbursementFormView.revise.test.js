// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ReimbursementFormView from "@/views/ReimbursementFormView.vue";

const pushMock = vi.fn();
const backMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
  onBeforeRouteLeave: vi.fn(),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    token: "test-token",
    isAdmin: false,
    user: { id: 10, name: "Employee User" },
  }),
}));

const mockReimbursement = {
  id: 55,
  status: "revise",
  description: "Office supplies",
  report_file_path: "reports/rep.pdf",
  admin_notes: "Missing detailed receipt for item 2",
  revision_count: 2,
  user_comment: "Purchased for team",
  receipts: [
    {
      id: 101,
      total_amount: 100,
      vat_classification: "vat",
      transaction_date: "2026-10-10",
      expense_category_id: 1,
      vendor_name: "Office Depot",
      items: [{ name: "Notebooks", quantity: 2, price: 50 }],
    },
  ],
};

const updateRequestMock = vi.fn().mockResolvedValue({
  id: 55,
  status: "pending",
});

vi.mock("@/stores/reimbursement", () => ({
  useReimbursementStore: () => ({
    fetchOne: vi.fn().mockResolvedValue(mockReimbursement),
    updateRequest: updateRequestMock,
    submit: vi.fn(),
  }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({
    categories: [{ id: 1, name: "Office Supplies" }],
    fetchCategories: vi.fn(),
  }),
}));

vi.mock("@/stores/policy", () => ({
  usePolicyStore: () => ({
    fetchAll: vi.fn(),
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

describe("ReimbursementFormView — Revised reimbursement edit & resubmit", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pushMock.mockClear();
    updateRequestMock.mockClear();
  });

  it("displays Needs Revision banner with admin notes and renders 'Update & Resubmit' on action button", async () => {
    const wrapper = mount(ReimbursementFormView, {
      props: {
        id: 55,
      },
      global: {
        stubs: {
          ReceiptsManagementHeader: true,
          ScannedReceiptsList: true,
          MetaAndAttachments: true,
          ReimbursementSummaryPanel: true,
          SegmentedReceiptUpload: true,
          ReceiptQualityRejectionModal: true,
          BaseToggleSwitch: true,
          ConfirmModal: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Revise Reimbursement");
    expect(wrapper.text()).toContain("Needs Revision — Attempt 2/3");
    expect(wrapper.text()).toContain("Missing detailed receipt for item 2");

    const submitBtn = wrapper.find("button.btn-primary.btn-cta");
    expect(submitBtn.exists()).toBe(true);
    expect(submitBtn.text()).toContain("Update & Resubmit");
  });
});
