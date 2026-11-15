// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import LiquidationSettlementForm from "@/components/liquidations/LiquidationSettlementForm.vue";
import LiquidationsView from "@/views/LiquidationsView.vue";
import SbsiReportDocumentEditor from "@/components/base/SbsiReportDocumentEditor.vue";
import { createDefaultTemplateData } from "@/utils/sbsiReportTemplateUtils";

const {
  advancesState,
  settlementsState,
  categoriesState,
} = vi.hoisted(() => ({
  advancesState: { items: [] },
  settlementsState: { items: [] },
  categoriesState: [{ id: 1, name: "Meals" }, { id: 2, name: "Transport" }],
}));

vi.mock("@/stores/liquidation", () => ({
  useLiquidationStore: () => ({
    settlements: settlementsState.items,
    loading: false,
    fetchSettlements: vi.fn().mockResolvedValue([]),
    fetchAll: vi.fn().mockResolvedValue([]),
    calculateAging: vi.fn(() => ({ isOverdue: false, daysLeft: 5 })),
  }),
}));

vi.mock("@/stores/cashAdvance", () => ({
  useCashAdvanceStore: () => ({
    items: advancesState.items,
    loading: false,
    fetchRequests: vi.fn().mockResolvedValue([]),
    fetchAll: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => ({
    categories: categoriesState,
    fetchCategories: vi.fn().mockResolvedValue(categoriesState),
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isAdmin: false,
    user: {
      id: 5,
      name: "Juan Employee",
      email: "employee@example.com",
      department: "Operations",
      signature: "data:image/png;base64,sig",
    },
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/composables/useReportExport", () => ({
  useReportExport: () => ({
    isExporting: ref(false),
    exportReport: vi.fn(),
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

vi.mock("@/composables/useNotificationDeepLink", () => ({
  useNotificationDeepLink: () => ({ checkDeepLink: vi.fn() }),
}));

vi.mock("@/composables/liquidations/useLiquidationDecisions", () => ({
  useLiquidationDecisions: () => ({
    selectedLiquidation: ref(null),
    isReviewModalOpen: ref(false),
    isReviewSubmitting: ref(false),
    approveLiquidation: vi.fn(),
    rejectLiquidation: vi.fn(),
    requestRevision: vi.fn(),
    clearDraftDecisions: vi.fn(),
  }),
}));

vi.mock("@/composables/liquidations/useLiquidationForwarding", () => ({
  useLiquidationForwarding: () => ({
    forwarding: ref(false),
    forwardToReimbursement: vi.fn(),
  }),
}));

vi.mock("@/composables/liquidations/useLiquidationSubmit", () => ({
  useLiquidationSubmit: () => ({
    submitting: ref(false),
    submitLiquidation: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock("vue-router", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
    useRoute: () => ({ query: {}, params: {} }),
  };
});

function buildSampleReceipts() {
  return [
    {
      id: 301,
      name: "Max's Restaurant",
      fileName: "maxs.jpg",
      ocrStatus: "done",
      category: "Meals",
      categoryId: 1,
      merchantName: "Max's Restaurant",
      date: "2026-09-10",
      tin: "111-222-333-000",
      invoiceNumber: "OR-991",
      location: "Quezon City",
      currency: "PHP",
      vatClassification: "vat",
      subtotal: "892.86",
      tax: "107.14",
      amount: 1000,
      items: [{ name: "Team Dinner", qty: 1, price: 1000 }],
      filePath: "receipts/301.jpg",
    },
  ];
}

function buildSampleTemplate() {
  const tpl = createDefaultTemplateData("liquidation", {
    user: {
      id: 5,
      name: "Juan Employee",
      department: "Operations",
      signature: "data:image/png;base64,sig",
    },
    receipts: [
      {
        id: 301,
        category: "Meals",
        vendor_name: "Max's Restaurant",
        total_amount: 1000,
        date: "2026-09-10",
      },
    ],
    allocatedAmount: 2000,
    utilizedAmount: 1000,
    variance: 1000,
    purpose: "Site Visit",
    disbursementDate: "2026-09-01",
    recordId: 77,
  });
  tpl.additionalNotes = "Initial liquidation remarks";
  return tpl;
}

describe("LiquidationSettlementForm — revise Update button stays disabled until changed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    advancesState.items = [];
    settlementsState.items = [];
  });

  it("keeps Update button disabled when mounted directly with existingLiquidation.status === 'revise' until an input changes", async () => {
    const receipts = ref(buildSampleReceipts());
    const reportTemplateData = ref(buildSampleTemplate());
    const shortfallExplanation = ref("Returned balance via bank");

    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: {
          id: 12,
          purpose: "Site Visit",
          amount: 2000,
          balance: 2000,
          status: "signed",
          acknowledged_at: "2026-09-01",
        },
        existingLiquidation: {
          id: 77,
          cash_advance_id: 12,
          status: "revise",
          admin_note: "Attach breakdown explanation",
        },
        receipts: receipts.value,
        categories: categoriesState,
        reportTemplateData: reportTemplateData.value,
        isManualMode: false,
        shortfallExplanation: shortfallExplanation.value,
        totalExpenseAmount: 1000,
        variance: 1000,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          BaseAuditTrail: true,
          ReceiptImagePreview: true,
          BaseReceiptDetailModal: true,
          BaseSignaturePad: true,
          SbsiReportPreviewModal: true,
          ConfirmModal: true,
        },
      },
    });
    await flushPromises();

    const btn = wrapper.find("#submit-liquidation-btn");
    expect(btn.exists()).toBe(true);
    expect(btn.attributes("disabled")).toBeDefined();

    // Updating shortfall explanation enables the button
    await wrapper.setProps({ shortfallExplanation: "Updated shortfall explanation" });
    await flushPromises();
    expect(btn.attributes("disabled")).toBeUndefined();

    // Reverting disables it again
    await wrapper.setProps({ shortfallExplanation: "Returned balance via bank" });
    await flushPromises();
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("does not disable Submit button for a new liquidation without existingLiquidation", async () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: {
          id: 15,
          purpose: "Field Supplies",
          amount: 1000,
          balance: 1000,
          status: "signed",
          acknowledged_at: "2026-09-01",
        },
        existingLiquidation: null,
        receipts: buildSampleReceipts(),
        categories: categoriesState,
        reportTemplateData: buildSampleTemplate(),
        isManualMode: false,
        shortfallExplanation: "",
        totalExpenseAmount: 1000,
        variance: 0,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          BaseAuditTrail: true,
          ReceiptImagePreview: true,
          BaseReceiptDetailModal: true,
          BaseSignaturePad: true,
          SbsiReportPreviewModal: true,
          ConfirmModal: true,
        },
      },
    });
    await flushPromises();

    const btn = wrapper.find("#submit-liquidation-btn");
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("keeps Update button disabled inside LiquidationsView when opening a revise liquidation until edited, and disables again on revert", async () => {
    const advance = {
      id: 19,
      user_id: 5,
      purpose: "Provincial Deployment",
      amount: 2000,
      balance: 2000,
      status: "signed",
      acknowledged_at: "2026-09-02",
      disbursement: { disbursed_at: "2026-09-02" },
    };
    const existingLiq = {
      id: 99,
      cash_advance_id: 19,
      user_id: 5,
      status: "revise",
      admin_note: "Fix merchant name",
      shortfall_explanation: "Returning PHP 1,000",
      report_template_data: (() => {
        const tpl = createDefaultTemplateData("liquidation", {
          user: {
            id: 5,
            name: "Juan Employee",
            department: "Operations",
            signature: "data:image/png;base64,sig",
          },
          receipts: [
            {
              id: 401,
              category: "Meals",
              vendor_name: "Jollibee",
              total_amount: 1000,
              date: "2026-09-10",
            },
          ],
          allocatedAmount: 2000,
          utilizedAmount: 1000,
          variance: 1000,
          purpose: "Provincial Deployment",
          disbursementDate: "2026-09-02",
          recordId: 99,
        });
        tpl.mode = "template";
        tpl.additionalNotes = "Initial note";
        return tpl;
      })(),
      receipts: [
        {
          id: 401,
          vendor_name: "Jollibee",
          transaction_date: "2026-09-10",
          total_amount: 1000,
          vat_amount: 107.14,
          vat_classification: "vat",
          tin: "111-222-333-000",
          invoice_number: "OR-401",
          location: "Cebu",
          currency: "PHP",
          expense_category_id: 1,
          file_path: "receipts/401.jpg",
          items: [{ name: "Meals", qty: 1, price: 1000 }],
        },
      ],
    };

    advancesState.items = [advance];
    settlementsState.items = [existingLiq];

    const wrapper = mount(LiquidationsView, {
      global: {
        stubs: {
          BaseModal: {
            props: ["isOpen"],
            template: '<div v-if="isOpen"><slot /><slot name="footer" /></div>',
          },
          LiquidationReviewModal: true,
          LiquidationReceiptModal: true,
          LiquidationAdvancePicker: true,
          LiquidationTable: true,
          UnifiedRoadmapStepper: true,
          BaseAuditTrail: true,
          ReceiptImagePreview: true,
          BaseReceiptDetailModal: true,
          BaseSignaturePad: true,
          SbsiReportPreviewModal: true,
          DecisionConfirmationModal: true,
          ConfirmModal: true,
          DeleteConfirmModal: true,
          BaseKpiGrid: true,
          BasePagination: true,
          BaseUtilityToolbar: true,
        },
      },
    });
    await flushPromises();

    // Open settlement modal for the revise liquidation
    wrapper.vm.openSettlementModal(advance, "settle");
    await flushPromises();

    const submitBtn = wrapper.find("#submit-liquidation-btn");
    expect(submitBtn.exists()).toBe(true);
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Mutate receipt merchantName
    wrapper.vm.receipts[0].merchantName = "Jollibee Cebu";
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    // Revert receipt merchantName -> disabled again
    wrapper.vm.receipts[0].merchantName = "Jollibee";
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Mutate discountAmount -> enabled, revert -> disabled
    wrapper.vm.receipts[0].discountType = "senior";
    wrapper.vm.receipts[0].discountAmount = "100";
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    wrapper.vm.receipts[0].discountType = "";
    wrapper.vm.receipts[0].discountAmount = "";
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Edit reviewer note textarea in DOM -> enables button; revert -> disabled
    const noteArea = wrapper.find("textarea");
    expect(noteArea.exists()).toBe(true);
    await noteArea.setValue("Updated shortfall note for admin");
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    await noteArea.setValue("Returning PHP 1,000");
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeDefined();
  });

  it("keeps manual-mode revise liquidation Update button disabled until attachment File or note changes", async () => {
    const advance = {
      id: 21,
      user_id: 5,
      purpose: "Manual Mode Audit",
      amount: 2000,
      balance: 2000,
      status: "signed",
      acknowledged_at: "2026-09-02",
      disbursement: { disbursed_at: "2026-09-02" },
    };
    const existingLiq = {
      id: 105,
      cash_advance_id: 21,
      user_id: 5,
      status: "REVISE",
      admin_note: "Upload updated signed PDF",
      shortfall_explanation: "Returning PHP 1,000",
      report_template_data: null,
      report_file_path: "liquidations/old-report.pdf",
      receipts: [
        {
          id: 501,
          vendor_name: "Mercury Drug",
          transaction_date: "2026-09-12",
          total_amount: 1000,
          vat_amount: 107.14,
          vat_classification: "vat",
          tin: "222-333-444-000",
          invoice_number: "OR-501",
          location: "Pasig",
          currency: "PHP",
          expense_category_id: 1,
          file_path: "receipts/501.jpg",
          items: [{ name: "First Aid", qty: 1, price: 1000 }],
        },
      ],
    };

    advancesState.items = [advance];
    settlementsState.items = [existingLiq];

    const wrapper = mount(LiquidationsView, {
      global: {
        stubs: {
          BaseModal: {
            props: ["isOpen"],
            template: '<div v-if="isOpen"><slot /><slot name="footer" /></div>',
          },
          LiquidationReviewModal: true,
          LiquidationReceiptModal: true,
          LiquidationAdvancePicker: true,
          LiquidationTable: true,
          UnifiedRoadmapStepper: true,
          BaseAuditTrail: true,
          ReceiptImagePreview: true,
          BaseReceiptDetailModal: true,
          BaseSignaturePad: true,
          SbsiReportPreviewModal: true,
          DecisionConfirmationModal: true,
          ConfirmModal: true,
          DeleteConfirmModal: true,
          BaseKpiGrid: true,
          BasePagination: true,
          BaseUtilityToolbar: true,
        },
      },
    });
    await flushPromises();

    wrapper.vm.openSettlementModal(advance, "settle");
    await flushPromises();

    const submitBtn = wrapper.find("#submit-liquidation-btn");
    expect(submitBtn.exists()).toBe(true);
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Replace reportAttachment with a new File (even with identical filename)
    const replacement = new File(["new-content"], "old-report.pdf", {
      type: "application/pdf",
      lastModified: 1700000005000,
    });
    wrapper.vm.reportAttachment = replacement;
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    // Revert back to original string path -> disabled again
    wrapper.vm.reportAttachment = "liquidations/old-report.pdf";
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeDefined();
  });

  it("updates effectiveManualMode and #submit-liquidation-btn from stubbed SbsiReportDocumentEditor @update:mode", async () => {
    const templateData = buildSampleTemplate();
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: {
          id: 14,
          purpose: "Site Visit",
          amount: 2000,
          balance: 2000,
          status: "signed",
          acknowledged_at: "2026-09-01",
        },
        existingLiquidation: {
          id: 79,
          cash_advance_id: 14,
          status: "revise",
          admin_note: "Verify report mode",
        },
        receipts: buildSampleReceipts(),
        categories: categoriesState,
        reportTemplateData: templateData,
        reportAttachment: "reports/manual-old.pdf",
        isManualMode: true,
        shortfallExplanation: "Returned balance via bank",
        totalExpenseAmount: 1000,
        variance: 1000,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          BaseAuditTrail: true,
          ReceiptImagePreview: true,
          BaseReceiptDetailModal: true,
          BaseSignaturePad: true,
          SbsiReportPreviewModal: true,
          ConfirmModal: true,
          SbsiReportDocumentEditor: true,
        },
      },
    });
    await flushPromises();

    const submitBtn = wrapper.find("#submit-liquidation-btn");
    const editor = wrapper.findComponent(SbsiReportDocumentEditor);
    expect(editor.exists()).toBe(true);
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Emit @update:mode('template') without DOM click / aria-pressed: effectiveManualMode flips to false
    editor.vm.$emit("update:mode", "template");
    await flushPromises();
    expect(wrapper.emitted("update:isManualMode")?.at(-1)).toEqual([false]);
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    // Switching back to manual returns to untouched manual baseline -> disabled again
    editor.vm.$emit("update:mode", "manual");
    await flushPromises();
    expect(wrapper.emitted("update:isManualMode")?.at(-1)).toEqual([true]);
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // When reportAttachment is cleared in manual mode, button must stay disabled
    await wrapper.setProps({ reportAttachment: null });
    await flushPromises();
    expect(submitBtn.attributes("disabled")).toBeDefined();
  });
});
