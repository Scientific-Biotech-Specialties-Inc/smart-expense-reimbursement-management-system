// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, nextTick, defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";

const mockPush = vi.fn();
const mockAddToast = vi.fn();
const mockApiFetch = vi.fn();
const mockFetchSettlements = vi.fn();
const mockFetchAdvances = vi.fn();
const mockFetchCategories = vi.fn();
const mockSubmitLiquidation = vi.fn();
const mockSettlements = ref([]);
const mockAdvances = ref([]);
const mockCategories = ref([
  { id: 1, name: "Meals" },
  { id: 2, name: "Transport" },
]);

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: {}, params: {} }),
  onBeforeRouteLeave: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("@/composables/useUnsavedChanges", () => ({
  useUnsavedChanges: () => ({
    showConfirmModal: ref(false),
    handleConfirmLeave: vi.fn(),
    handleCancelLeave: vi.fn(),
    dismissWithConfirm: (cb) => cb?.(),
  }),
}));

vi.mock("@/composables/useNotificationDeepLink", () => ({
  useNotificationDeepLink: () => ({ checkDeepLink: vi.fn() }),
}));

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: {
      id: 5,
      name: "Jane Employee",
      role: "employee",
      signature: "data:image/png;base64,SAVEDSIG==",
    },
    isAdmin: false,
    departmentName: "Operations",
  }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({
    get categories() {
      return mockCategories.value;
    },
    fetchCategories: (...args) => mockFetchCategories(...args),
  }),
}));

vi.mock("@/stores/cashAdvance", () => ({
  useCashAdvanceStore: () => ({
    get items() {
      return mockAdvances.value;
    },
    isLoading: false,
    fetchAll: (...args) => mockFetchAdvances(...args),
  }),
}));

vi.mock("@/stores/liquidation", () => ({
  useLiquidationStore: () => ({
    get settlements() {
      return mockSettlements.value;
    },
    isLoading: false,
    fetchSettlements: (...args) => mockFetchSettlements(...args),
    calculateAging: () => ({ isOverdue: false, daysOverdue: 0 }),
  }),
}));

vi.mock("@/composables/liquidations/useLiquidationSubmit", () => ({
  useLiquidationSubmit: () => ({
    submitting: ref(false),
    submitLiquidation: (...args) => mockSubmitLiquidation(...args),
  }),
}));

import LiquidationsView from "./LiquidationsView.vue";
import LiquidationSettlementForm from "@/components/liquidations/LiquidationSettlementForm.vue";

const ActionDropdownStub = defineComponent({
  name: "ActionDropdownMenu",
  props: ["actions"],
  setup(props) {
    return () =>
      h(
        "div",
        { class: "action-stub" },
        (props.actions || [])
          .filter((a) => a.visible !== false)
          .map((a) =>
            h(
              "button",
              {
                type: "button",
                disabled: a.disabled,
                "data-action": a.label,
                onClick: () => !a.disabled && a.handler(),
              },
              a.label,
            ),
          ),
      );
  },
});

const BaseModalStub = defineComponent({
  name: "BaseModal",
  props: ["isOpen", "title", "description", "maxWidthClass", "zIndexClass", "contentClass"],
  emits: ["close"],
  setup(props, { slots }) {
    return () => (props.isOpen ? h("div", { class: "modal-stub" }, slots.default?.()) : null);
  },
});

function mountView() {
  return mount(LiquidationsView, {
    global: {
      stubs: {
        ActionDropdownMenu: ActionDropdownStub,
        BaseModal: BaseModalStub,
        ConfirmModal: true,
        DeleteConfirmModal: true,
        DecisionConfirmationModal: true,
        LiquidationReviewModal: true,
        LiquidationReceiptModal: true,
      },
    },
  });
}

async function openAction(wrapper, actionLabel) {
  await wrapper.find(`button[data-action="${actionLabel}"]`).trigger("click");
  await flushPromises();
  await nextTick();
  await nextTick();
  await flushPromises();
}

describe("LiquidationsView — revise status keeps Update button disabled until changed", () => {
  const mounted = [];
  const trackMount = () => {
    const w = mountView();
    mounted.push(w);
    return w;
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockAdvances.value = [];
    mockSettlements.value = [];
    mockFetchCategories.mockResolvedValue([]);
    mockFetchAdvances.mockResolvedValue([]);
    mockFetchSettlements.mockResolvedValue([]);
    mockSubmitLiquidation.mockResolvedValue(true);
  });

  afterEach(() => {
    while (mounted.length) mounted.pop().unmount();
  });

  it("keeps #submit-liquidation-btn disabled on initial Edit modal open with real BaseSignaturePad and SbsiReportDocumentEditor", async () => {
    mockAdvances.value = [
      {
        id: 10,
        purpose: "Site Inspection",
        amount: 500,
        balance: 500,
        status: "disbursed",
        acknowledgedAt: "2026-12-01",
        date: "2026-12-01",
        dueDate: "2026-12-30",
      },
    ];
    mockSettlements.value = [
      {
        id: 201,
        cash_advance_id: 10,
        status: "revise",
        admin_note: "Attach breakdown",
        shortfall_explanation: "",
        report_file_path: null,
        report_template_data: {
          type: "liquidation",
          payTo: "Jane Employee",
          department: "Operations",
          date: "2026-12-01",
          purpose: "Site Inspection",
          breakdownItems: [{ qty: 1, description: "Meals - Jollibee", amount: 500 }],
          signatoryName: "Jane Employee",
          signatorySignature: "",
        },
        receipts: [
          {
            id: 301,
            vendor_name: "Jollibee",
            transaction_date: "2026-12-01",
            total_amount: 500,
            vat_amount: 53.57,
            tin: "123-456-789-000",
            invoice_number: "INV-9",
            expense_category_id: 1,
            vat_classification: "vat",
            file_path: "receipts/r1.jpg",
          },
        ],
      },
    ];

    const wrapper = trackMount();
    await flushPromises();
    await openAction(wrapper, "Edit");

    expect(wrapper.text()).toContain("Edit Liquidation");
    expect(wrapper.find("#submit-liquidation-btn").attributes("disabled")).toBeDefined();
  });

  it("hydrates report_template_data: { mode: 'manual' } in Manual mode and keeps #submit-liquidation-btn disabled", async () => {
    mockAdvances.value = [
      {
        id: 12,
        purpose: "Travel",
        amount: 500,
        balance: 500,
        status: "signed",
        acknowledgedAt: "2026-12-01",
        date: "2026-12-01",
        dueDate: "2026-12-30",
      },
    ];
    mockSettlements.value = [
      {
        id: 203,
        cash_advance_id: 12,
        status: "revise",
        admin_note: "Check manual report",
        shortfall_explanation: "Remaining cash on hand",
        report_file_path: "reports/liq-203.pdf",
        report_template_data: { mode: "manual" },
        receipts: [
          {
            id: 303,
            vendor_name: "Shell",
            transaction_date: "2026-12-01",
            total_amount: 500,
            vat_amount: 53.57,
            tin: "123-456-789-000",
            invoice_number: "INV-11",
            expense_category_id: 2,
            vat_classification: "vat",
            file_path: "receipts/r3.jpg",
          },
        ],
      },
    ];

    const wrapper = trackMount();
    await flushPromises();
    await openAction(wrapper, "Edit");

    expect(wrapper.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.find("#submit-liquidation-btn").attributes("disabled")).toBeDefined();
  });

  it("enables on shortfall or receipt changes, re-disables on revert, and stays disabled after View -> Close -> Edit", async () => {
    mockAdvances.value = [
      {
        id: 13,
        purpose: "Supplies",
        amount: 500,
        balance: 500,
        status: "signed",
        acknowledgedAt: "2026-12-01",
        date: "2026-12-01",
        dueDate: "2026-12-30",
      },
    ];
    mockSettlements.value = [
      {
        id: 204,
        cash_advance_id: 13,
        status: "revise",
        admin_note: "Update vendor",
        shortfall_explanation: "Pending items",
        report_file_path: "reports/liq-204.pdf",
        report_template_data: null,
        receipts: [
          {
            id: 304,
            vendor_name: "National Book Store",
            transaction_date: "2026-12-01",
            total_amount: 500,
            vat_amount: 53.57,
            tin: "123-456-789-000",
            invoice_number: "INV-12",
            expense_category_id: null,
            vat_classification: "vat",
            file_path: "receipts/r4.jpg",
          },
        ],
      },
    ];

    const wrapper = trackMount();
    await flushPromises();

    // Open in View, close, then open in Edit
    await openAction(wrapper, "View");
    await wrapper.find("#settlement-modal-close").trigger("click");
    await flushPromises();
    await openAction(wrapper, "Edit");

    const submitBtn = () => wrapper.find("#submit-liquidation-btn");
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Direct submit emission while untouched must not open Submit Request ConfirmModal
    wrapper.findComponent(LiquidationSettlementForm).vm.$emit("submit-liquidation");
    await flushPromises();
    const modals = wrapper.findAllComponents({ name: "ConfirmModal" });
    const submitModal = modals.find((m) => m.props("title") === "Submit Request");
    expect(submitModal.props("isOpen")).toBe(false);

    // Edit shortfall -> enables; revert -> disables
    const textarea = wrapper.find("textarea");
    await textarea.setValue("Updated shortfall explanation");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeUndefined();

    await textarea.setValue("Pending items");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Edit receipt -> enables; revert -> disables
    const form = wrapper.findComponent(LiquidationSettlementForm);
    const receiptsProp = form.props("receipts");
    receiptsProp[0].merchantName = "NBS Updated";
    receiptsProp[0].ocrData.vendor = "NBS Updated";
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeUndefined();

    receiptsProp[0].merchantName = "National Book Store";
    receiptsProp[0].ocrData.vendor = "National Book Store";
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();
  });

  it("keeps #submit-liquidation-btn disabled on Template -> Manual without file for template-mode revise with report_file_path, enables on file upload, and re-disables on Manual -> Template", async () => {
    mockAdvances.value = [
      {
        id: 14,
        purpose: "Regional Audit",
        amount: 500,
        balance: 500,
        status: "disbursed",
        acknowledgedAt: "2026-12-01",
        date: "2026-12-01",
        dueDate: "2026-12-30",
      },
    ];
    mockSettlements.value = [
      {
        id: 205,
        cash_advance_id: 14,
        status: "revise",
        admin_note: "Verify receipts and report",
        shortfall_explanation: "Remaining cash on hand",
        report_file_path: "liquidations/generated-template-205.pdf",
        report_template_data: {
          type: "liquidation",
          payTo: "Jane Employee",
          department: "Operations",
          date: "2026-12-01",
          purpose: "Regional Audit",
          breakdownItems: [{ qty: 1, description: "Meals - Jollibee", amount: 500 }],
          signatoryName: "Jane Employee",
          signatorySignature: "",
        },
        receipts: [
          {
            id: 305,
            vendor_name: "Jollibee",
            transaction_date: "2026-12-01",
            total_amount: 500,
            vat_amount: 53.57,
            tin: "123-456-789-000",
            invoice_number: "INV-25",
            expense_category_id: 1,
            vat_classification: "vat",
            file_path: "receipts/r5.jpg",
          },
        ],
      },
    ];

    const wrapper = trackMount();
    await flushPromises();
    await openAction(wrapper, "Edit");

    const submitBtn = () => wrapper.find("#submit-liquidation-btn");
    expect(wrapper.find('[data-testid="mode-template"]').attributes("aria-pressed")).toBe("true");
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Switch Template -> Manual without uploading a file -> stays disabled
    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();

    // Upload manual file -> becomes enabled
    const fileInput = wrapper.find('[data-testid="manual-file-input"]');
    const manualFile = new File(["%PDF-1.4"], "manual-liq.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput.element, "files", {
      value: [manualFile],
      configurable: true,
    });
    await fileInput.trigger("change");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeUndefined();

    // Switch back Manual -> Template -> returns to untouched baseline and disables again
    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await flushPromises();
    expect(submitBtn().attributes("disabled")).toBeDefined();
  });

  it("keeps Update button disabled and blocks submit confirmation when total expenses are less than balance", async () => {
    mockAdvances.value = [
      {
        id: 15,
        purpose: "Under-Balance Audit",
        amount: 2000,
        balance: 2000,
        status: "signed",
        acknowledgedAt: "2026-12-01",
        date: "2026-12-01",
        dueDate: "2026-12-30",
      },
    ];
    mockSettlements.value = [
      {
        id: 206,
        cash_advance_id: 15,
        status: "revise",
        admin_note: "Attach remaining receipts",
        shortfall_explanation: "Initial note",
        report_file_path: null,
        report_template_data: {
          type: "liquidation",
          payTo: "Jane Employee",
          department: "Operations",
          date: "2026-12-01",
          purpose: "Under-Balance Audit",
          breakdownItems: [{ qty: 1, description: "Meals - Jollibee", amount: 500 }],
          signatoryName: "Jane Employee",
          signatorySignature: "",
        },
        receipts: [
          {
            id: 306,
            vendor_name: "Jollibee",
            transaction_date: "2026-12-01",
            total_amount: 500,
            vat_amount: 53.57,
            tin: "123-456-789-000",
            invoice_number: "INV-26",
            expense_category_id: 1,
            vat_classification: "vat",
            file_path: "receipts/r6.jpg",
          },
        ],
      },
    ];

    const wrapper = trackMount();
    await flushPromises();
    await openAction(wrapper, "Edit");

    await wrapper.find("textarea").setValue("Updated note");
    await flushPromises();

    expect(wrapper.find("#submit-liquidation-btn").attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-testid="liquidation-balance-error"]').exists()).toBe(true);

    wrapper.findComponent(LiquidationSettlementForm).vm.$emit("submit-liquidation");
    await flushPromises();

    const modals = wrapper.findAllComponents({ name: "ConfirmModal" });
    const submitModal = modals.find((m) => m.props("title") === "Submit Request");
    expect(submitModal.props("isOpen")).toBe(false);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Insufficient Liquidation Amount",
        type: "danger",
      }),
    );
  });
});
