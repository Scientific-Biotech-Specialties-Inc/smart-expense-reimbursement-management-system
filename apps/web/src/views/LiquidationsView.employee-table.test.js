// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import LiquidationsView from "@/views/LiquidationsView.vue";
import LiquidationTable from "@/components/liquidations/LiquidationTable.vue";
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
          // BaseButton, StatusBadge, ConfirmModal.
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

    expect(wrapper.find("div.grid.grid-cols-1.gap-6").exists()).toBe(false);
  });

  it("removes Settle from the ellipsis menu, keeps View read-only, and shows Edit only for revise rows", async () => {
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
    expect(actions.map((a) => a.label)).toEqual(["Edit", "View", "Delete"]);
    expect(actions[0].visible).toBe(false);
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
    expect(wrapper.find(".base-modal-stub h2").text()).toBe("Liquidation Details");

    let form = wrapper.findComponent({ name: "LiquidationSettlementForm" });
    expect(form.exists()).toBe(true);
    expect(form.props("selectedAdvance")?.id).toBe("ca-1");
    expect(form.props("disabled")).toBe(true);

    // Closing the modal resets the composer.
    wrapper.vm.closeSettlementModal();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSettlementModalOpen).toBe(false);
    expect(wrapper.find(".base-modal-stub").exists()).toBe(false);

    // A row with a "revise" liquidation exposes Edit and opens the modal in editable mode.
    mockSettlements.push({
      id: "liq-rev-1",
      cash_advance_id: "ca-1",
      status: "revise",
      receipts: [],
    });
    const reviseWrapper = mountView();
    const reviseActions = reviseWrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    expect(reviseActions[0].visible).toBe(true);
    expect(reviseActions[1].visible).not.toBe(false);
    reviseActions[0].handler();
    await reviseWrapper.vm.$nextTick();

    expect(reviseWrapper.vm.isSettlementModalOpen).toBe(true);
    expect(reviseWrapper.vm.settlementModalMode).toBe("settle");
    expect(reviseWrapper.find("#back-to-advance-selection").exists()).toBe(false);
    expect(reviseWrapper.find(".base-modal-stub h2").text()).toBe("Edit Liquidation");
    form = reviseWrapper.findComponent({ name: "LiquidationSettlementForm" });
    expect(form.props("disabled")).toBe(false);

    const updatedActions = reviseWrapper
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

  it("exposes View and Delete (and hides Edit) for a row with an existing pending liquidation", async () => {
    seedPendingSettlement();
    const wrapper = mountView();

    const actions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    expect(actions[0].visible).toBe(false);
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

    actions[2].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.deletingLiqId).toBe("liq-1");
    expect(wrapper.vm.isDeleteLiqModalOpen).toBe(true);

    mockSettlements[0].status = "approved";
    const approvedWrapper = mountView();
    const approvedActions = approvedWrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    expect(approvedActions[0].visible).toBe(false);
    expect(approvedActions[2].visible).toBe(false);
  });

  it("flags TIN and date edits on hydrated revise settlement receipts as dirty across View and Edit", async () => {
    seedPendingSettlement();
    mockSettlements[0].status = "revise";
    const wrapper = mountView();

    const actions = wrapper
      .findAllComponents(ActionDropdownMenu)[0]
      .props("actions");
    expect(actions[0].visible).toBe(true);
    actions[1].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isDirty).toBe(false);

    wrapper.vm.receipts[0].tin = "CHANGED-TIN";
    wrapper.vm.receipts[0].date = "2026-10-15";
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isDirty).toBe(true);

    // The same edit remains dirty in Edit mode, where closing prompts.
    actions[0].handler();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.settlementModalMode).toBe("settle");
    expect(wrapper.vm.isDirty).toBe(true);
  });

  it("keeps a fresh New Liquidation draft clean until a receipt is actually added", async () => {
    const wrapper = mountView();

    await wrapper.findComponent(BaseButton).vm.$emit("click");
    await wrapper.vm.$nextTick();
    await wrapper
      .find('[data-testid="liquidation-advance-card"][data-advance-id="ca-1"]')
      .trigger("click");
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

  it("renders grace period countdown in settlement modal header when inside 7-day grace window", async () => {
    const graceDate = new Date();
    graceDate.setDate(graceDate.getDate() - 5);
    const dueDateStr = graceDate.toISOString().split("T")[0];

    const originalDue = mockItems[0].dueDate;
    mockItems[0].dueDate = dueDateStr;
    try {
      const wrapper = mountView();
      wrapper.vm.openSettlementModal(mockItems[0], "view");
      await wrapper.vm.$nextTick();

      const modalHeader = wrapper.find(".base-modal-stub .border-b");
      const daysLeftBadge = modalHeader.findComponent(DaysLeftBadge);
      expect(daysLeftBadge.exists()).toBe(true);
      expect(daysLeftBadge.text()).toContain("3 grace days left");
    } finally {
      mockItems[0].dueDate = originalDue;
    }
  });

  it("renders PENALTY DaysLeftBadge in settlement modal header when advance is past 7-day grace period", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
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
      expect(daysLeftBadge.text()).toBe("PENALTY");
    } finally {
      mockItems[0].dueDate = originalDue;
    }
  });

  it("excludes advances with existing pending, revise, or rejected liquidations from New Liquidation", async () => {
    mockSettlements.push(
      { id: "liq-p", cash_advance_id: "ca-1", status: "pending", receipts: [] },
      { id: "liq-r", cash_advance_id: "ca-2", status: "revise", receipts: [] },
      { id: "liq-x", cash_advance_id: "ca-3", status: "rejected", receipts: [] },
    );
    const wrapper = mountView();

    await wrapper.findComponent(BaseButton).vm.$emit("click");
    await wrapper.vm.$nextTick();

    const cardIds = wrapper
      .findAll('[data-testid="liquidation-advance-card"]')
      .map((card) => card.attributes("data-advance-id"));
    expect(cardIds).not.toContain("ca-1");
    expect(cardIds).not.toContain("ca-2");
    expect(cardIds).not.toContain("ca-3");
    expect(cardIds).toContain("ca-4");
    expect(cardIds).toHaveLength(9);
  });

  it("shows red pending indicator dot on employee liquidation advances only when a row-menu action is needed (revise)", async () => {
    mockSettlements.push(
      {
        id: 901,
        cash_advance_id: "ca-2",
        status: "liquidated",
        receipts: [],
      },
      {
        id: 902,
        cash_advance_id: "ca-3",
        status: "under-review",
        receipts: [],
      },
      {
        id: 903,
        cash_advance_id: "ca-4",
        status: "revise",
        receipts: [],
      },
    );
    try {
      const wrapper = mountView();
      const menus = wrapper.findAllComponents(ActionDropdownMenu);
      const findMenu = (purpose) =>
        menus.find((m) => m.element.closest("tr")?.textContent?.includes(purpose));
      const findRow = (purpose) =>
        wrapper.findAll("tbody tr").find((tr) => tr.text().includes(purpose));

      // ca-1: signed, no settlement -> submitted via New Liquidation, no row-menu dot
      expect(findMenu("Purpose 1").props("showIndicator")).toBe(false);
      expect(findMenu("Purpose 1").find('[data-testid="action-pending-indicator"]').exists()).toBe(false);

      // ca-2: liquidated -> terminal, no action needed
      expect(findMenu("Purpose 2").props("showIndicator")).toBe(false);
      expect(findMenu("Purpose 2").find('[data-testid="action-pending-indicator"]').exists()).toBe(false);

      // ca-3: under-review -> waiting on admin, no employee action needed
      expect(findMenu("Purpose 3").props("showIndicator")).toBe(false);
      expect(findMenu("Purpose 3").find('[data-testid="action-pending-indicator"]').exists()).toBe(false);

      // ca-4: revise -> Needs Revision badge + red dot with Edit & resubmit liquidation
      expect(findRow("Purpose 4").text()).toContain("Needs Revision");
      expect(findMenu("Purpose 4").props("showIndicator")).toBe(true);
      expect(findMenu("Purpose 4").props("indicatorLabel")).toBe("Edit & resubmit liquidation");
      expect(findMenu("Purpose 4").find('[data-testid="action-pending-indicator"]').attributes("title")).toBe(
        "Edit & resubmit liquidation",
      );
    } finally {
      mockSettlements.length = 0;
    }
  });

  it("hides pre-Phase-2 unliquidatable advances from the employee table while keeping Phase 2 and liquidation-stage rows", () => {
    const backup = [...mockItems];
    mockItems.length = 0;
    mockItems.push(
      { id: "ca-pending", status: "pending", acknowledgedAt: null, amount: 1000, balance: 1000, purpose: "Pending CA", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-ca-revise", status: "revise", acknowledgedAt: null, amount: 1000, balance: 1000, purpose: "Revise CA", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-approved", status: "approved", acknowledgedAt: null, amount: 1000, balance: 1000, purpose: "Approved CA", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-disbursed", status: "disbursed", acknowledgedAt: null, amount: 1000, balance: 1000, purpose: "Disbursed Unsigned", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-unack-overdue", status: "overdue", acknowledgedAt: null, amount: 1000, balance: 1050, purpose: "Overdue Unsigned", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-rejected", status: "rejected", acknowledgedAt: null, amount: 1000, balance: 0, purpose: "Rejected CA", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-signed", status: "signed", acknowledgedAt: "2026-10-02", amount: 1500, balance: 1500, purpose: "Signed CA", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-overdue", status: "overdue", acknowledgedAt: "2026-10-02", amount: 2000, balance: 2050, purpose: "Overdue Signed", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-incomplete", status: "incomplete", acknowledgedAt: "2026-10-02", amount: 2500, balance: 1000, purpose: "Incomplete Signed", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-under-review", status: "under-review", acknowledgedAt: "2026-10-02", amount: 3000, balance: 3000, purpose: "Under Review Liq", date: "2026-10-01", dueDate: "2026-10-08" },
      { id: "ca-liquidated", status: "liquidated", acknowledgedAt: "2026-10-02", amount: 3500, balance: 0, purpose: "Liquidated CA", date: "2026-10-01", dueDate: "2026-10-08" },
    );
    mockSettlements.push(
      { id: "liq-ur", cash_advance_id: "ca-under-review", status: "pending", receipts: [] },
      { id: "liq-done", cash_advance_id: "ca-liquidated", status: "liquidated", receipts: [] },
      { id: "liq-rev", cash_advance_id: "ca-incomplete", status: "revise", receipts: [] },
    );

    try {
      const wrapper = mountView();
      const visibleIds = wrapper.vm.employeeFilteredAdvances.map((a) => a.id);

      expect(visibleIds).not.toContain("ca-pending");
      expect(visibleIds).not.toContain("ca-ca-revise");
      expect(visibleIds).not.toContain("ca-approved");
      expect(visibleIds).not.toContain("ca-disbursed");
      expect(visibleIds).not.toContain("ca-unack-overdue");
      expect(visibleIds).not.toContain("ca-rejected");

      expect(visibleIds).toEqual(
        expect.arrayContaining([
          "ca-signed",
          "ca-overdue",
          "ca-incomplete",
          "ca-under-review",
          "ca-liquidated",
        ]),
      );
      expect(visibleIds).toHaveLength(5);

      const renderedPurposes = wrapper.findAll("tbody tr").map((tr) => tr.text());
      expect(renderedPurposes).toHaveLength(5);

      expect(wrapper.vm.employeeStatusFilters).toEqual([
        "All",
        "Under Review",
        "Revise",
        "Signed",
        "Incomplete",
        "Overpayment",
        "Liquidated",
        "Rejected",
        "Overdue",
      ]);

      // Active Advances KPI excludes hidden pre-Phase-2 rows and terminal Liquidated/Rejected rows:
      // counts ca-signed, ca-overdue, ca-incomplete (Revise), and ca-under-review (Under Review) = 4
      const activeKpi = wrapper.vm.employeeLiquidationKpis.find(
        (k) => k.label === "Active Advances",
      );
      expect(activeKpi?.value).toBe(4);
    } finally {
      mockItems.length = 0;
      mockItems.push(...backup);
      mockSettlements.length = 0;
    }
  });
});

