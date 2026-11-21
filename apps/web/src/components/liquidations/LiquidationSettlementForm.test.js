// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import LiquidationSettlementForm from "./LiquidationSettlementForm.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import BaseReceiptDetailModal from "@/components/base/BaseReceiptDetailModal.vue";
import ReceiptImagePreview from "@/components/base/ReceiptImagePreview.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";

describe("LiquidationSettlementForm — Receipt Grid vs Form List", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const sampleAdvance = {
    id: 101,
    purpose: "Client Conference",
    balance: 5000,
    amount: 5000,
    status: "signed",
    acknowledgedAt: "2026-10-10",
  };

  const sampleReceipts = [
    {
      id: 1,
      fileName: "jollibee_receipt.jpg",
      merchantName: "Jollibee Las Vegas",
      location: "Las Vegas NV",
      amount: 1250,
      vat: 150,
      invoiceNumber: "INV-101",
      category: "Meals",
      status: "pending",
    },
    {
      id: 2,
      fileName: "taxi_fare.jpg",
      merchantName: "Grab Express",
      location: "Makati City",
      amount: 450,
      vat: 0,
      invoiceNumber: "INV-102",
      category: "Transportation",
      status: "pending",
    },
  ];

  it("renders full-bleed receipt cards with only title, status, price, and View Details button in view mode", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: true,
        receipts: sampleReceipts,
        existingLiquidation: {
          id: 5,
          status: "pending",
          receipts: sampleReceipts,
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          BaseReceiptDetailModal: true,
          ImagePreviewModal: true,
          SbsiReportDocumentEditor: true,
        },
      },
    });

    // ScannedReceiptsList should NOT be rendered when disabled / in view mode
    expect(wrapper.findComponent(ScannedReceiptsList).exists()).toBe(false);

    // Grid cards should be rendered without outer card padding (edge-to-edge upper image)
    const articles = wrapper.findAll("article");
    expect(articles).toHaveLength(2);
    expect(articles[0].classes()).not.toContain("p-4");
    expect(articles[0].classes()).toContain("overflow-hidden");
    expect(articles[0].classes()).toContain("rounded-3xl");
    expect(articles[0].classes()).toContain("isolate");
    expect(articles[0].classes()).toContain("transform-gpu");
    expect(articles[0].classes()).not.toContain("hover:shadow-xl");
    expect(articles[0].classes()).not.toContain("hover:shadow-md");

    // Full-bleed vertically stretched image without circle number badge or filename header
    const previews = wrapper.findAllComponents(ReceiptImagePreview);
    expect(previews).toHaveLength(2);
    expect(previews[0].props("showBadge")).toBe(false);
    expect(previews[0].props("aspectClass")).toBe("h-full w-full");
    expect(previews[0].props("imgClass")).toContain("object-cover");
    expect(previews[0].props("frameClass")).toContain("border-0");
    expect(previews[0].props("frameClass")).toContain("rounded-3xl");
    expect(previews[0].props("frameClass")).not.toContain("rounded-none");
    expect(previews[0].element.parentElement.classList.contains("rounded-3xl")).toBe(true);
    expect(previews[0].element.parentElement.classList.contains("overflow-hidden")).toBe(true);
    expect(articles[0].classes()).toContain("min-h-[390px]");
    expect(articles[0].text()).not.toContain("jollibee receipt");

    // Transparent frosted blur overlay over lower card portion
    const blurOverlay = articles[0].find("[aria-hidden='true']");
    expect(blurOverlay.exists()).toBe(true);
    expect(blurOverlay.classes()).toContain("backdrop-blur-md");
    expect(blurOverlay.classes()).toContain("rounded-b-3xl");

    // Only one title, status, price, and View Details button are displayed
    const cardText = articles[0].text();
    expect(cardText).toContain("Jollibee Las Vegas");
    expect(cardText).toContain("Pending");
    expect(cardText).toContain("1,250.00");
    expect(cardText).toContain("View Details");
    expect(cardText).not.toContain("Las Vegas NV");
    expect(cardText).not.toContain("Meals");

    expect(articles[1].text()).toContain("Grab Express");
    expect(articles[1].text()).toContain("450.00");
    expect(articles[1].text()).not.toContain("Makati City");
    expect(articles[1].text()).not.toContain("Transportation");

    const viewDetailsBtn = articles[0].find("button");
    expect(viewDetailsBtn.classes()).toContain("bg-primary");
    expect(viewDetailsBtn.classes()).toContain("rounded-md");
    expect(viewDetailsBtn.classes()).toContain("h-9");
    expect(viewDetailsBtn.classes()).toContain("sm:w-auto");
    expect(viewDetailsBtn.classes()).not.toContain("rounded-full");
    expect(viewDetailsBtn.classes()).not.toContain("h-10");

    expect(wrapper.findAllComponents(StatusBadge).length).toBeGreaterThanOrEqual(2);
  });

  it("opens BaseReceiptDetailModal via BaseModal portal on top of liquidation details instead of trapping it inline", async () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: true,
        receipts: sampleReceipts,
        existingLiquidation: {
          id: 5,
          status: "pending",
          receipts: sampleReceipts,
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          BaseReceiptImage: true,
          ImagePreviewModal: true,
          StatusBadge: true,
        },
      },
    });

    const viewDetailsButtons = wrapper
      .findAll("button")
      .filter((b) => b.text().includes("View Details"));
    expect(viewDetailsButtons).toHaveLength(2);

    await viewDetailsButtons[0].trigger("click");

    const modal = wrapper.findComponent(BaseReceiptDetailModal);
    expect(modal.exists()).toBe(true);
    expect(modal.props("isOpen")).toBe(true);
    expect(modal.props("receipt")?.vendor).toBe("Jollibee Las Vegas");

    // Must portal out to document.body centered with fixed positioning at z-[60]
    expect(wrapper.element.textContent).not.toContain("INV-101");
    expect(document.body.textContent).toContain("Jollibee Las Vegas");
    expect(document.body.textContent).toContain("INV-101");
    const dialogEl = document.body.querySelector('[role="dialog"]');
    expect(dialogEl).not.toBeNull();
    expect(dialogEl.classList.contains("fixed")).toBe(true);
    expect(dialogEl.classList.contains("relative")).toBe(false);
    expect(dialogEl.classList.contains("z-[60]")).toBe(true);

    const closeBtn = document.body.querySelector('button[aria-label="Close receipt details"]');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    await wrapper.vm.$nextTick();

    expect(modal.props("isOpen")).toBe(false);
    wrapper.unmount();
  });

  it("renders ScannedReceiptsList when actively composing / editing a liquidation", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: false,
        receipts: sampleReceipts,
        existingLiquidation: null,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ScannedReceiptsList: {
            template: `<div data-testid="scanned-receipts-list"></div>`,
          },
        },
      },
    });

    // When actively composing, ScannedReceiptsList should be rendered
    expect(wrapper.find('[data-testid="scanned-receipts-list"]').exists()).toBe(true);
  });

  it("renders Delete and Update buttons with matching sizing classes for pending liquidations in view mode", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: true,
        receipts: sampleReceipts,
        existingLiquidation: {
          id: 5,
          status: "pending",
          receipts: sampleReceipts,
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          StatusBadge: true,
          BaseReceiptDetailModal: true,
        },
      },
    });

    const deleteBtn = wrapper.find("#delete-liquidation-btn");
    const submitBtn = wrapper.find("#submit-liquidation-btn");
    expect(deleteBtn.exists()).toBe(true);
    expect(submitBtn.exists()).toBe(true);

    for (const cls of ["h-[42px]", "w-full", "sm:w-auto", "sm:min-w-[120px]"]) {
      expect(deleteBtn.classes()).toContain(cls);
      expect(submitBtn.classes()).toContain(cls);
    }
    expect(deleteBtn.classes()).not.toContain("h-9");
    expect(submitBtn.classes()).not.toContain("h-9");
  });

  it("disables submit and renders inline alert in template mode when totalExpenseAmount < balance even with shortfallExplanation", () => {
    const validTemplate = {
      type: "liquidation",
      date: "2026-10-12",
      recipientName: "Lourdes C. Roxas",
      salutation: "Dear Ms. Roxas,",
      subject: "LIQUIDATION REPORT FOR CASH ADVANCE",
      purpose: "Client Conference",
      disbursementDate: "2026-10-10",
      allocatedAmount: 5000,
      utilizedAmount: 1700,
      variance: 3300,
      breakdownItems: [{ description: "Jollibee", amount: 1700 }],
      signatoryName: "Juan Dela Cruz",
    };

    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: false,
        receipts: sampleReceipts,
        totalExpenseAmount: 1700,
        variance: 3300,
        shortfallExplanation: "Unused funds returned.",
        reportTemplateData: validTemplate,
        isManualMode: false,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          StatusBadge: true,
          BaseReceiptDetailModal: true,
          SbsiReportPreviewModal: true,
        },
      },
    });

    const card = wrapper.find('[data-testid="liquidation-report-attachment-card"]');
    expect(card.exists()).toBe(true);
    expect(wrapper.find('[data-testid="sbsi-report-editor"]').exists()).toBe(true);

    const balanceError = wrapper.find('[data-testid="liquidation-balance-error"]');
    expect(balanceError.exists()).toBe(true);
    expect(balanceError.attributes("role")).toBe("alert");
    expect(balanceError.text()).toContain("5,000.00");

    const submitBtn = wrapper.find("#submit-liquidation-btn");
    expect(submitBtn.attributes("disabled")).toBeDefined();
  });

  it("disables submit in manual mode when totalExpenseAmount < balance and allows submit when totalExpenseAmount >= balance without shortfallExplanation", async () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: false,
        receipts: sampleReceipts,
        totalExpenseAmount: 1700,
        variance: 3300,
        shortfallExplanation: "Unused funds returned.",
        reportAttachment: new File(["pdf"], "report.pdf", { type: "application/pdf" }),
        isManualMode: true,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          StatusBadge: true,
          BaseReceiptDetailModal: true,
          SbsiReportDocumentEditor: true,
        },
      },
    });

    const submitBtn = wrapper.find("#submit-liquidation-btn");
    expect(submitBtn.attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-testid="liquidation-balance-error"]').exists()).toBe(true);

    await wrapper.setProps({
      totalExpenseAmount: 5000,
      variance: 0,
      shortfallExplanation: "",
    });
    expect(wrapper.find('[data-testid="liquidation-balance-error"]').exists()).toBe(false);
    expect(submitBtn.attributes("disabled")).toBeUndefined();
  });

  it("does not clear template attachment on initial mount and guards standalone revise template/manual transitions", async () => {
    const validTemplate = {
      type: "liquidation",
      date: "2026-10-12",
      recipientName: "Lourdes C. Roxas",
      salutation: "Dear Ms. Roxas,",
      subject: "LIQUIDATION REPORT FOR CASH ADVANCE",
      purpose: "Client Conference",
      disbursementDate: "2026-10-10",
      allocatedAmount: 5000,
      utilizedAmount: 5000,
      variance: 0,
      breakdownItems: [{ description: "Venue", amount: 5000 }],
      signatoryName: "Juan Dela Cruz",
    };

    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: false,
        receipts: sampleReceipts,
        totalExpenseAmount: 5000,
        variance: 0,
        existingLiquidation: {
          id: 9,
          status: "revise",
          receipts: sampleReceipts,
          report_template_data: validTemplate,
          report_file_path: "liquidations/generated.pdf",
          shortfall_explanation: "",
        },
        reportTemplateData: validTemplate,
        reportAttachment: { name: "generated.pdf", path: "liquidations/generated.pdf" },
        isManualMode: false,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          StatusBadge: true,
          BaseReceiptDetailModal: true,
          ImagePreviewModal: true,
          BaseSignaturePad: true,
        },
      },
    });
    await nextTick();
    await nextTick();

    // Must not fire file-cleared on initial template mount
    expect(wrapper.emitted("file-cleared")).toBeUndefined();
    expect(wrapper.emitted("update:reportAttachment")).toBeUndefined();

    const submitBtn = wrapper.find("#submit-liquidation-btn");
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Switching Template -> Manual without a newly uploaded file must keep submit disabled
    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await nextTick();
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Uploading a manual File enables submit
    const file = new File(["manual pdf"], "manual-liq.pdf", { type: "application/pdf" });
    await wrapper.setProps({ reportAttachment: file, isManualMode: true });
    await nextTick();
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    // Switching Manual -> Template clears attachment and re-disables submit
    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await wrapper.setProps({ reportAttachment: null, isManualMode: false });
    await nextTick();
    expect(wrapper.emitted("update:reportAttachment")).toContainEqual([null]);
    expect(wrapper.emitted("file-cleared")).toBeTruthy();
    expect(submitBtn.attributes("disabled")).toBeDefined();
  });

  it("emits update:reportAttachment(null) and file-cleared when stubbed editor switches from manual to template", async () => {
    const StubEditor = {
      name: "SbsiReportDocumentEditor",
      props: ["modelValue", "reportFile"],
      emits: ["update:modelValue", "update:reportFile", "update:mode"],
      template: `<div><button data-testid="emit-template" @click="$emit('update:mode', 'template')">T</button></div>`,
    };

    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        receipts: sampleReceipts,
        totalExpenseAmount: 1700,
        variance: 3300,
        existingLiquidation: {
          id: 9,
          status: "revise",
          receipts: sampleReceipts,
          report_template_data: { mode: "manual" },
          report_file_path: "liquidations/manual.pdf",
          shortfall_explanation: "Returning balance",
        },
        reportTemplateData: { mode: "manual" },
        reportAttachment: { name: "manual.pdf", path: "liquidations/manual.pdf" },
        isManualMode: true,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          StatusBadge: true,
          BaseReceiptDetailModal: true,
          ImagePreviewModal: true,
          SbsiReportDocumentEditor: StubEditor,
        },
      },
    });
    await nextTick();
    await wrapper.find('[data-testid="emit-template"]').trigger("click");
    await nextTick();

    expect(wrapper.emitted("update:isManualMode")).toContainEqual([false]);
    expect(wrapper.emitted("update:reportAttachment")).toContainEqual([null]);
    expect(wrapper.emitted("file-cleared")).toBeTruthy();
  });

  it("displays Requested Amount + Overdue Penalty = Total Balance breakdown in Settlement Summary when penalties exist", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: {
          id: 19,
          purpose: "Regional Client Onsite",
          amount: 10000,
          balance: 10250,
          outstanding_balance: 10250,
          status: "overdue",
          acknowledgedAt: "2026-11-01",
          penalties: [
            { days_overdue: 1, penalty_amount: 50 },
            { days_overdue: 2, penalty_amount: 50 },
            { days_overdue: 3, penalty_amount: 50 },
            { days_overdue: 4, penalty_amount: 50 },
            { days_overdue: 5, penalty_amount: 50 },
          ],
        },
        receipts: [],
        totalExpenseAmount: 10000,
        variance: 250,
        liquidationStatus: "Incomplete",
        liquidationOutstandingBalance: 250,
        overpaymentAmount: 0,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ScannedReceiptsList: true,
          SbsiReportDocumentEditor: true,
          BaseReceiptDetailModal: true,
        },
      },
    });

    const summary = wrapper.find('[data-testid="liquidation-settlement-summary"]');
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain("Requested Amount");
    expect(summary.text()).toContain("10,000.00");
    expect(summary.text()).toContain("Overdue Penalty");
    expect(summary.text()).toContain("250.00");
    expect(summary.text()).toContain("Total Balance");
    expect(summary.text()).toContain("10,250.00");
    expect(summary.text()).toContain("Outstanding Balance");
    expect(summary.text()).toContain("250.00");
  });
});
