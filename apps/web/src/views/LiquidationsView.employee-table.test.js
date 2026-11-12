// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import LiquidationsView from "@/views/LiquidationsView.vue";
import LiquidationTable from "@/components/liquidations/LiquidationTable.vue";
import LiquidationAdvancesList from "@/components/liquidations/LiquidationAdvancesList.vue";
import BasePagination from "@/components/base/BasePagination.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import ActionDropdownMenu from "@/components/base/ActionDropdownMenu.vue";
import DaysLeftBadge from "@/components/base/DaysLeftBadge.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";

const { addToastMock, mockItems, mockSettlements } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  mockSettlements: [],
  mockItems: Array.from({ length: 12 }, (_, i) => ({
    id: `ca-${i + 1}`,
    amount: 1000 + i * 100, // ca-1 = 1000 … ca-12 = 2100
    balance: 500 + i * 50, // ca-1 = 500 … ca-12 = 1050
    status: "signed",
    acknowledgedAt: "2026-10-01",
    purpose: `Purpose ${i + 1}`,
    date: "2026-10-01",
    dueDate: "2026-10-08",
  })),
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
    isAdmin: false,
    user: { id: "user-1", name: "Employee" },
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

describe("LiquidationsView — Employee table plumbing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettlements.length = 0;
  });

  function seedPendingSettlement() {
    mockSettlements.push({
      id: "liq-1",
      cash_advance_id: "ca-1",
      status: "PENDING",
      receipts: [
        {
          id: 1,
          vendor_name: "Store",
          total_amount: 100,
          vat_amount: 12,
          transaction_date: "2026-10-01",
        },
      ],
      report_file_path: "reports/letter.pdf",
    });
  }

  function mountView() {
    return mount(LiquidationsView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          BaseUtilityToolbar: {
            name: "BaseUtilityToolbar",
            props: ["search", "statusValue", "statuses", "searchPlaceholder"],
            template:
              "<div class='toolbar-stub'><slot name='actions' /></div>",
          },
          BaseToggleSwitch: true,
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
          // Deliberately NOT stubbed: LiquidationTable, BasePagination,
          // LiquidationAdvancesList, BaseButton, StatusBadge, ConfirmModal.
        },
      },
    });
  }

  it("exposes the employee column set", () => {
    const wrapper = mountView();
    expect(wrapper.vm.employeeLiquidationColumns.map((c) => c.key)).toEqual([
      "purpose",
      "date",
      "dueDate",
      "amount",
      "balance",
      "status",
      "actions",
    ]);
  });

  it("sorts via employeeToggleSort: new key gets default direction, same key toggles, actions column is a no-op", () => {
    const wrapper = mountView();

    wrapper.vm.employeeToggleSort({ key: "purpose" });
    expect(wrapper.vm.employeeSortKey).toBe("purpose");
    expect(wrapper.vm.employeeSortDirection).toBe("asc");

    wrapper.vm.employeeToggleSort({ key: "purpose" });
    expect(wrapper.vm.employeeSortDirection).toBe("desc");

    wrapper.vm.employeeToggleSort({ key: "date" });
    expect(wrapper.vm.employeeSortKey).toBe("date");
    expect(wrapper.vm.employeeSortDirection).toBe("desc");

    wrapper.vm.employeeToggleSort({ key: "dueDate" });
    expect(wrapper.vm.employeeSortKey).toBe("dueDate");
    expect(wrapper.vm.employeeSortDirection).toBe("desc");

    wrapper.vm.employeeToggleSort({ key: "actions" });
    expect(wrapper.vm.employeeSortKey).toBe("dueDate");
  });

  it("orders rows by balance asc and amount desc through employeeFilteredAdvances", async () => {
    const wrapper = mountView();

    wrapper.vm.employeeSortKey = "balance";
    wrapper.vm.employeeSortDirection = "asc";
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.employeeFilteredAdvances[0].id).toBe("ca-1");

    wrapper.vm.employeeSortKey = "amount";
    wrapper.vm.employeeSortDirection = "desc";
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.employeeFilteredAdvances[0].id).toBe("ca-12");
  });

  it("paginates employee rows at 10 per page", async () => {
    const wrapper = mountView();

    expect(wrapper.vm.employeeTotalPages).toBe(2);
    expect(wrapper.vm.employeePaginatedAdvances).toHaveLength(10);

    wrapper.vm.employeeCurrentPage = 2;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.employeePaginatedAdvances).toHaveLength(2);
    expect(wrapper.vm.employeePaginatedAdvances[1].id).toBe("ca-12");
  });

  it("resets to page 1 when the employee search query changes", async () => {
    const wrapper = mountView();

    wrapper.vm.employeeCurrentPage = 2;
    await wrapper.vm.$nextTick();

    wrapper.vm.employeeSearchQuery = "purpose 1";
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.employeeCurrentPage).toBe(1);
  });

  it("renders the employee LiquidationTable with employee columns/rows instead of the two-column advance list", () => {
    const wrapper = mountView();

    const table = wrapper.findComponent(LiquidationTable);
    expect(table.exists()).toBe(true);
    expect(table.props("columns").map((c) => c.key)).toEqual([
      "purpose",
      "date",
      "dueDate",
      "amount",
      "balance",
      "status",
      "actions",
    ]);
    expect(table.props("rows")).toHaveLength(10);

    const headers = wrapper.findAll("thead th").map((th) => th.text());
    expect(headers).toEqual([
      "Purpose",
      "Date Issued",
      "Due Date",
      "Amount",
      "Balance",
      "Status",
      "Action",
    ]);

    expect(wrapper.findComponent(LiquidationAdvancesList).exists()).toBe(false);
    expect(wrapper.find("div.grid.grid-cols-1.gap-6").exists()).toBe(false);
  });

  it("always shows View in the ellipsis menu and opens a read-only modal, while Settle opens the editable modal", async () => {
    const wrapper = mountView();

    const firstRow = wrapper.find("tbody tr");
    expect(firstRow.text()).toContain("Purpose 1");
    expect(firstRow.text()).toContain("Oct 1, 2026"); // formatDate(row.date)
    expect(firstRow.text()).toContain("₱1,000"); // formatPeso(amount) — if the
    // rendered currency glyph differs, assert instead on
    // formatPeso(mockItems[0].amount) imported from "@/utils/formatters".

    const menus = wrapper.findAllComponents(ActionDropdownMenu);
    expect(menus).toHaveLength(10);
    expect(wrapper.findAll('tbody button[title="Actions"]')).toHaveLength(10);
    expect(wrapper.find("#settle-ca-1").exists()).toBe(false);

    // The settlement form no longer renders inline below the table.
    const actions = menus[0].props("actions");
    expect(actions.map((a) => a.label)).toEqual(["Settle", "View", "Delete"]);
    expect(actions[0].visible).not.toBe(false);
    expect(actions[1].visible).not.toBe(false);
    expect(actions[2].visible).toBe(false);
    expect(wrapper.find(".settlement-form-stub").exists()).toBe(false);

    // View opens the modal in read-only mode.
    actions[1].handler();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isSettlementModalOpen).toBe(true);
    expect(wrapper.vm.settlementModalMode).toBe("view");
    expect(wrapper.vm.selectedAdvance?.id).toBe("ca-1");
    expect(wrapper.find(".base-modal-stub").exists()).toBe(true);

    let form = wrapper.findComponent({ name: "LiquidationSettlementForm" });
    expect(form.exists()).toBe(true);
    expect(form.props("selectedAdvance")?.id).toBe("ca-1");
    expect(form.props("disabled")).toBe(true);

    // Closing the modal resets the composer.
    wrapper.vm.closeSettlementModal();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSettlementModalOpen).toBe(false);
    expect(wrapper.find(".base-modal-stub").exists()).toBe(false);

    // Settle opens the same modal in editable mode.
    const settleActions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    expect(settleActions[1].visible).not.toBe(false);
    settleActions[0].handler();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isSettlementModalOpen).toBe(true);
    expect(wrapper.vm.settlementModalMode).toBe("settle");
    expect(wrapper.find("#back-to-advance-selection").exists()).toBe(false);
    form = wrapper.findComponent({ name: "LiquidationSettlementForm" });
    expect(form.props("disabled")).toBe(false);

    const updatedActions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    expect(updatedActions[0].disabled).toBe(true);
  });

  it("uses an X icon to close the settlement modal instead of a text Close button", async () => {
    seedPendingSettlement();
    const wrapper = mountView();

    wrapper.vm.openSettlementModal(mockItems[0], "view");
    await wrapper.vm.$nextTick();

    const closeBtn = wrapper.find("#settlement-modal-close");
    expect(closeBtn.exists()).toBe(true);
    expect(closeBtn.attributes("aria-label")).toBe("Close liquidation details");
    expect(closeBtn.find("svg").exists()).toBe(true);
    expect(closeBtn.text()).toBe("");
    expect(
      wrapper.findAll("button").filter((button) => button.text() === "Close"),
    ).toHaveLength(0);

    await closeBtn.trigger("click");
    expect(wrapper.vm.isSettlementModalOpen).toBe(false);
    expect(wrapper.vm.selectedAdvance).toBeNull();
  });

  it("exposes View and Delete for a row with an existing pending liquidation", async () => {
    seedPendingSettlement();
    const wrapper = mountView();

    const actions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    expect(actions[1].visible).not.toBe(false);
    expect(actions[2].visible).not.toBe(false);

    actions[1].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSettlementModalOpen).toBe(true);
    expect(wrapper.vm.settlementModalMode).toBe("view");
    expect(wrapper.vm.selectedAdvance?.id).toBe("ca-1");
    expect(wrapper.vm.existingLiquidation?.id).toBe("liq-1");
    // Hydrated settlement data is the baseline, not an unsaved edit.
    expect(wrapper.vm.isDirty).toBe(false);

    const form = wrapper.findComponent({ name: "LiquidationSettlementForm" });
    expect(form.props("existingLiquidation")?.id).toBe("liq-1");
    expect(form.props("disabled")).toBe(true);

    // View is read-only: submitting is a no-op.
    wrapper.vm.promptSubmitLiquidation();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.showSubmitConfirmModal).toBe(false);

    // Settle on the same hydrated record is also clean (baseline hydration).
    actions[0].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.settlementModalMode).toBe("settle");
    expect(wrapper.vm.isDirty).toBe(false);

    actions[2].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.deletingLiqId).toBe("liq-1");
    expect(wrapper.vm.isDeleteLiqModalOpen).toBe(true);

    mockSettlements[0].status = "approved";
    const approvedWrapper = mountView();
    const approvedActions = approvedWrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    expect(approvedActions[2].visible).toBe(false);
  });

  it("flags TIN and date edits on hydrated settlement receipts as dirty", async () => {
    seedPendingSettlement();
    const wrapper = mountView();

    const actions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    actions[1].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isDirty).toBe(false);

    wrapper.vm.receipts[0].tin = "CHANGED-TIN";
    wrapper.vm.receipts[0].date = "2026-10-15";
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isDirty).toBe(true);

    // The same edit remains dirty in Settle mode, where closing prompts.
    actions[0].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.settlementModalMode).toBe("settle");
    expect(wrapper.vm.isDirty).toBe(true);
  });

  it("keeps a fresh Settle draft clean until a receipt is actually added", async () => {
    const wrapper = mountView();

    const actions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    actions[0].handler();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.settlementModalMode).toBe("settle");
    expect(wrapper.vm.isDirty).toBe(false);

    wrapper.vm.receipts = [{ id: "new", name: "New" }];
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isDirty).toBe(true);
  });

  it("closes and clears the composer through handleReloadConsole", async () => {
    const wrapper = mountView();

    const actions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    actions[1].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSettlementModalOpen).toBe(true);
    expect(wrapper.vm.selectedAdvance?.id).toBe("ca-1");

    wrapper.vm.handleReloadConsole();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isSettlementModalOpen).toBe(false);
    expect(wrapper.vm.selectedAdvance).toBeNull();
    expect(wrapper.vm.isDirty).toBe(false);
  });

  it("clears the modal, selection, delete state, and hydration after deleting a settlement", async () => {
    seedPendingSettlement();
    const wrapper = mountView();

    const actions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    actions[1].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSettlementModalOpen).toBe(true);

    actions[2].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isDeleteLiqModalOpen).toBe(true);

    await wrapper.vm.confirmDeleteLiquidation("password");

    expect(wrapper.vm.isSettlementModalOpen).toBe(false);
    expect(wrapper.vm.selectedAdvance).toBeNull();
    expect(wrapper.vm.isDeleteLiqModalOpen).toBe(false);
    expect(wrapper.vm.isDirty).toBe(false);
  });

  it("sorts the employee table from a header click and renders pagination for >10 rows", async () => {
    const wrapper = mountView();

    const firstHeaderButton = wrapper.find("thead th button");
    await firstHeaderButton.trigger("click"); // Purpose column
    expect(wrapper.vm.employeeSortKey).toBe("purpose");
    expect(wrapper.vm.employeeSortDirection).toBe("asc");

    expect(wrapper.findComponent(BasePagination).exists()).toBe(true);
  });

  it("renders a New Liquidation button that opens the advance card picker before the form", async () => {
    const wrapper = mountView();

    const btn = wrapper.find("#new-liquidation-btn");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("New Liquidation");

    await wrapper.findComponent(BaseButton).vm.$emit("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isSettlementModalOpen).toBe(true);
    expect(wrapper.vm.settlementModalMode).toBe("settle");
    expect(wrapper.vm.settlementModalStep).toBe("select");
    expect(wrapper.vm.selectedAdvance).toBeNull();
    expect(
      wrapper.findAll('[data-testid="liquidation-advance-card"]'),
    ).toHaveLength(12);

    await wrapper
      .find('[data-testid="liquidation-advance-card"][data-advance-id="ca-1"]')
      .trigger("click");

    expect(wrapper.vm.selectedAdvance?.id).toBe("ca-1");
    expect(wrapper.vm.settlementModalStep).toBe("form");
  });

  it("shows an info toast and keeps state unchanged when no eligible advance exists", async () => {
    const backup = [...mockItems];
    mockItems.length = 0;
    try {
      const wrapper = mountView();

      const btn = wrapper.find("#new-liquidation-btn");
      expect(btn.exists()).toBe(true);
      await wrapper.findComponent(BaseButton).vm.$emit("click");

      expect(wrapper.vm.selectedAdvance).toBeNull();
      expect(wrapper.vm.isSettlementModalOpen).toBe(false);
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "info" }),
      );
    } finally {
      mockItems.push(...backup);
    }
  });

  it("truncates purpose text longer than 18 characters (< 20) in the table cell while preserving full text in title attribute", async () => {
    mockItems[0].purpose = "Purchased office supplies and materials for Q4 conference";
    try {
      const wrapper = mountView();
      const firstRow = wrapper.find("tbody tr");
      const purposeDiv = firstRow.find(".max-w-\\[18ch\\]");
      expect(purposeDiv.exists()).toBe(true);

      const purposeSpan = purposeDiv.find("span.truncate");
      expect(purposeSpan.exists()).toBe(true);
      expect(purposeSpan.text()).toBe("Purchased office s...");
      expect(purposeSpan.attributes("title")).toBe(
        "Purchased office supplies and materials for Q4 conference",
      );
    } finally {
      mockItems[0].purpose = "Purpose 1";
    }
  });

  it("renders DaysLeftBadge before StatusBadge in settlement modal header when viewing or settling an advance", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const dueDateStr = futureDate.toISOString().split("T")[0];

    const originalDue = mockItems[0].dueDate;
    mockItems[0].dueDate = dueDateStr;
    try {
      const wrapper = mountView();
      wrapper.vm.openSettlementModal(mockItems[0], "view");
      await wrapper.vm.$nextTick();

      const modalHeader = wrapper.find(".base-modal-stub .border-b");
      expect(modalHeader.exists()).toBe(true);

      const daysLeftBadge = modalHeader.findComponent(DaysLeftBadge);
      const statusBadge = modalHeader.findComponent(StatusBadge);

      expect(daysLeftBadge.exists()).toBe(true);
      expect(statusBadge.exists()).toBe(true);
      expect(daysLeftBadge.text()).toContain("days left");

      // Verify ordering: DaysLeftBadge precedes StatusBadge in the DOM tree
      expect(daysLeftBadge.element.nextElementSibling).toBe(statusBadge.element);
    } finally {
      mockItems[0].dueDate = originalDue;
    }
  });

  it("renders overdue DaysLeftBadge in settlement modal header when advance is overdue", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const dueDateStr = pastDate.toISOString().split("T")[0];

    const originalDue = mockItems[0].dueDate;
    mockItems[0].dueDate = dueDateStr;
    try {
      const wrapper = mountView();
      wrapper.vm.openSettlementModal(mockItems[0], "view");
      await wrapper.vm.$nextTick();

      const modalHeader = wrapper.find(".base-modal-stub .border-b");
      const daysLeftBadge = modalHeader.findComponent(DaysLeftBadge);
      expect(daysLeftBadge.exists()).toBe(true);
      expect(daysLeftBadge.text()).toContain("0 days left");
    } finally {
      mockItems[0].dueDate = originalDue;
    }
  });
});

