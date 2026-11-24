// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LiquidationReviewModal from "./LiquidationReviewModal.vue";
import LiquidationSettlementForm from "./LiquidationSettlementForm.vue";
import DaysLeftBadge from "@/components/base/DaysLeftBadge.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";

describe("LiquidationReviewModal Header Chipsets", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders DaysLeftBadge before StatusBadge in header when overdue", () => {
    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-012",
          cashAdvanceAmount: 333,
          dueDate: "2026-10-15",
          dateOfAdvances: "2026-10-08",
          requestorName: "Juan Dela Cruz",
        },
        reviewStatus: "overdue",
        reviewOutstandingBalance: 333,
        getFileUrl: () => "",
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          BaseReceiptImage: true,
        },
      },
    });

    const daysLeftBadge = wrapper.findComponent(DaysLeftBadge);
    const statusBadge = wrapper.findComponent(StatusBadge);

    expect(daysLeftBadge.exists()).toBe(true);
    expect(statusBadge.exists()).toBe(true);
    expect(daysLeftBadge.text()).toContain("0 days left");
    expect(statusBadge.text()).toContain("Overdue");

    // Verify ordering: DaysLeftBadge precedes StatusBadge in the DOM tree
    const container = statusBadge.element.parentElement;
    expect(container).toBeDefined();
    expect(daysLeftBadge.element.nextElementSibling).toBe(statusBadge.element);
  });

  it("renders 'x days left' when case has remaining days before due date", () => {
    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-015",
          cashAdvanceAmount: 1500,
          dueDate: "2026-10-25", // 4 days left
          dateOfAdvances: "2026-10-18",
          requestorName: "Maria Clara",
        },
        reviewStatus: "under-review",
        reviewOutstandingBalance: 1500,
        getFileUrl: () => "",
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          BaseReceiptImage: true,
        },
      },
    });

    const daysLeftBadge = wrapper.findComponent(DaysLeftBadge);
    expect(daysLeftBadge.exists()).toBe(true);
    expect(daysLeftBadge.text()).toContain("4 days left");
  });

  it("renders Export Report button beside Receipts header in Admin LiquidationReviewModal without changing status (G2-060)", async () => {
    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-015",
          databaseId: 15,
          cashAdvanceAmount: 1500,
          dueDate: "2026-10-25",
          dateOfAdvances: "2026-10-18",
          requestorName: "Maria Clara",
        },
        reviewStatus: "under-review",
        reviewOutstandingBalance: 1500,
        reviewReceipts: [],
        getFileUrl: () => "",
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          BaseReceiptImage: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-admin-liquidation-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.text()).toContain("Export Report");
    expect(wrapper.emitted("approve")).toBeFalsy();
    expect(wrapper.emitted("reject")).toBeFalsy();
  });

  it("renders Export Report button beside Receipt Attachments header in Employee LiquidationSettlementForm (G2-057)", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: {
          id: 22,
          purpose: "Baguio Field Trip",
          balance: 4000,
          status: "signed",
          acknowledgedAt: "2026-10-10",
        },
        existingLiquidation: null,
        receipts: [],
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ScannedReceiptsList: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-liquidation-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.text()).toContain("Export Report");
  });

  it("renders BaseAuditTrail in LiquidationReviewModal", () => {
    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-099",
          cashAdvanceAmount: 5000,
          dueDate: "2026-10-30",
          requestorName: "Elena Cruz",
          audit_trail: [
            {
              id: "liq-log-1",
              action_type: "LIQUIDATION_SUBMITTED",
              label: "Submitted",
              actor_name: "Elena Cruz",
              created_at: "2026-10-22T08:30:00Z",
            },
          ],
        },
        reviewStatus: "pending",
        reviewOutstandingBalance: 5000,
        getFileUrl: () => "",
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          BaseReceiptImage: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Audit Trail");
    expect(wrapper.text()).toContain("Elena Cruz");
  });

  it("renders BaseAuditTrail in LiquidationSettlementForm when audit events exist", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: {
          id: 55,
          purpose: "Client Training",
          balance: 6000,
          status: "signed",
          audit_trail: [
            {
              id: "ca-log-55",
              action_type: "CASH_ADVANCE_SUBMITTED",
              label: "Submitted",
              actor_name: "Elena Cruz",
              created_at: "2026-10-22T08:00:00Z",
            },
          ],
        },
        existingLiquidation: null,
        receipts: [],
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ScannedReceiptsList: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Audit Trail");
    expect(wrapper.text()).toContain("Elena Cruz");
  });

  it("renders receipt cards without hover drop-shadow classes", () => {
    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-100",
          cashAdvanceAmount: 1200,
          dueDate: "2026-10-30",
          requestorName: "Elena Cruz",
        },
        reviewStatus: "pending",
        reviewOutstandingBalance: 200,
        reviewReceipts: [
          {
            id: 1,
            merchantName: "Test Merchant",
            location: "Makati",
            amount: 1000,
            category: "Meals",
            decision: "pending",
          },
        ],
        getFileUrl: () => "",
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          ReceiptImagePreview: true,
          BaseReceiptImage: true,
        },
      },
    });

    const card = wrapper.find("article");
    expect(card.exists()).toBe(true);
    expect(card.classes()).not.toContain("hover:shadow-md");
    expect(card.classes()).not.toContain("hover:shadow-xl");
  });

  it("renders Preview Report button and opens SbsiReportPreviewModal when report attachment or template data exists", async () => {
    const templateData = {
      type: "liquidation",
      purpose: "Field Travel",
      allocatedAmount: 2000,
      utilizedAmount: 1800,
    };

    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-202",
          cashAdvanceAmount: 2000,
          dueDate: "2026-10-30",
          requestorName: "Elena Cruz",
          reportFilePath: "liquidations/report-202.pdf",
          reportTemplateData: templateData,
        },
        reviewStatus: "under-review",
        reviewOutstandingBalance: 200,
        reviewReceipts: [],
        getFileUrl: (p) => `https://cdn.example.com/${p}`,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          ReceiptImagePreview: true,
          BaseReceiptImage: true,
          SbsiReportPreviewModal: true,
        },
      },
    });

    const previewBtn = wrapper.find('[data-testid="preview-liquidation-report-btn"]');
    expect(previewBtn.exists()).toBe(true);
    expect(previewBtn.text()).toContain("Preview Report");
    expect(wrapper.find('[data-testid="download-liquidation-report-link"]').exists()).toBe(true);

    await previewBtn.trigger("click");
    const modal = wrapper.findComponent({ name: "SbsiReportPreviewModal" });
    expect(modal.exists()).toBe(true);
    expect(modal.props("isOpen")).toBe(true);
    expect(modal.props("fallbackType")).toBe("liquidation");
    expect(modal.props("templateData")).toEqual(templateData);
    expect(modal.props("fileUrl")).toBe("https://cdn.example.com/liquidations/report-202.pdf");
  });

  it("displays penalty breakdown and computes roadmapOverpayment against penalty-inclusive balance", () => {
    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-007",
          cashAdvanceAmount: 10000,
          outstandingBalance: 10250,
          submittedReceiptTotal: 12500,
          dueDate: "2026-11-08",
          dateOfAdvances: "2026-11-01",
          requestorName: "General Employee",
          penalties: [
            { days_overdue: 1, penalty_amount: 50 },
            { days_overdue: 2, penalty_amount: 50 },
            { days_overdue: 3, penalty_amount: 50 },
            { days_overdue: 4, penalty_amount: 50 },
            { days_overdue: 5, penalty_amount: 50 },
          ],
          cash_advance: {
            id: 19,
            amount: 10000,
            outstanding_balance: 10250,
            status: "overdue",
            expected_liquidation_date: "2026-11-08",
          },
        },
        reviewStatus: "Overpayment",
        reviewOutstandingBalance: 0,
        acceptedReviewTotal: 12500,
        reviewReceipts: [],
        getFileUrl: () => "",
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          ReceiptImagePreview: true,
          BaseReceiptImage: true,
          SbsiReportPreviewModal: true,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Total Balance (incl. Penalty)");
    expect(text).toContain("10,250.00");
    expect(text).toContain("Overdue Penalty");
    expect(text).toContain("250.00");
    // 12,500 expenses - 10,250 balance = 2,250 overpayment (not 2,500)
    const stepper = wrapper.findComponent({ name: "UnifiedRoadmapStepper" });
    expect(stepper.props("overpaymentAmount")).toBe(2250);
  });

  it("enforces unified layout order (Roadmap -> Tabs -> Notes -> Summary), tab switching, empty states, and resets active tab on record change", async () => {
    const wrapper = mount(LiquidationReviewModal, {
      props: {
        isOpen: true,
        reviewingCase: {
          id: "LIQ-301",
          purpose: "Cebu Regional Audit",
          cashAdvanceAmount: 4000,
          outstandingBalance: 4000,
          dueDate: "2026-10-25",
          dateOfAdvances: "2026-10-18",
          requestorName: "Maria Clara",
          shortfallExplanation: "",
          adminNote: "",
          audit_trail: [
            {
              id: "ev-1",
              action_type: "LIQUIDATION_SUBMITTED",
              label: "Submitted",
              actor_name: "Maria Clara",
              created_at: "2026-10-20T09:00:00Z",
            },
          ],
        },
        reviewStatus: "under-review",
        reviewOutstandingBalance: 1000,
        acceptedReviewTotal: 3000,
        reviewReceipts: [],
        getFileUrl: () => "",
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: {
            name: "UnifiedRoadmapStepper",
            template: '<div data-testid="roadmap-stub" />',
          },
          ReceiptImagePreview: true,
          BaseReceiptImage: true,
          SbsiReportPreviewModal: true,
        },
      },
    });

    const tabReceipts = wrapper.find('[data-testid="modal-tab-receipts"]');
    const tabReport = wrapper.find('[data-testid="modal-tab-report"]');
    const tabAudit = wrapper.find('[data-testid="modal-tab-audit"]');
    expect(tabReceipts.exists()).toBe(true);
    expect(tabReport.exists()).toBe(true);
    expect(tabAudit.exists()).toBe(true);
    expect(tabReceipts.attributes("aria-selected")).toBe("true");

    const panelReceipts = wrapper.find('[data-testid="modal-panel-receipts"]');
    const panelReport = wrapper.find('[data-testid="modal-panel-report"]');
    const panelAudit = wrapper.find('[data-testid="modal-panel-audit"]');
    const notesSection = wrapper.find('[data-testid="modal-notes-section"]');
    const summarySection = wrapper.find('[data-testid="modal-summary-section"]');

    expect(panelReceipts.exists()).toBe(true);
    expect(panelReport.exists()).toBe(true);
    expect(panelAudit.exists()).toBe(true);
    expect(notesSection.exists()).toBe(true);
    expect(summarySection.exists()).toBe(true);

    // Verify strict DOM order: Roadmap -> Tabs -> Notes -> Summary
    const roadmapEl = wrapper.find('[data-testid="roadmap-stub"]').element;
    const tabsEl = tabReceipts.element.closest('[role="tablist"]');
    expect(
      Boolean(roadmapEl.compareDocumentPosition(tabsEl) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(tabsEl.compareDocumentPosition(notesSection.element) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      Boolean(
        notesSection.element.compareDocumentPosition(summarySection.element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);

    // Default tab is receipts; empty state shown
    expect(panelReceipts.element.style.display).not.toBe("none");
    expect(panelReport.element.style.display).toBe("none");
    expect(panelAudit.element.style.display).toBe("none");
    expect(panelReceipts.text()).toContain("No receipts attached.");

    // Switch to Report Attachment tab -> empty state when no report attached
    await tabReport.trigger("click");
    expect(tabReport.attributes("aria-selected")).toBe("true");
    expect(panelReceipts.element.style.display).toBe("none");
    expect(panelReport.element.style.display).not.toBe("none");
    expect(panelReport.text()).toContain("No report attachment uploaded.");

    // Switch to Audit Trail tab
    await tabAudit.trigger("click");
    expect(tabAudit.attributes("aria-selected")).toBe("true");
    expect(panelReport.element.style.display).toBe("none");
    expect(panelAudit.element.style.display).not.toBe("none");
    expect(panelAudit.text()).toContain("Maria Clara");

    // Notes section shows "No notes provided" when both notes are empty
    expect(notesSection.text()).toContain("No notes provided");

    // Summary section displays Medium Date format, Purpose, Employee Name, and financial breakdown
    const summaryText = summarySection.text();
    expect(summaryText).toContain("Maria Clara");
    expect(summaryText).toContain("Cebu Regional Audit");
    expect(summaryText).toContain("Oct 18, 2026");
    expect(summaryText).toContain("Oct 25, 2026");
    expect(summaryText).toContain("4,000.00");
    expect(summaryText).toContain("3,000.00");
    expect(summaryText).toContain("1,000.00");

    // Changing reviewingCase resets active tab back to 'receipts' and renders notes when provided
    await wrapper.setProps({
      reviewingCase: {
        id: "LIQ-302",
        cashAdvanceAmount: 2500,
        outstandingBalance: 2500,
        dueDate: "2026-10-28",
        dateOfAdvances: "2026-10-20",
        requestorName: "Pedro Penduko",
        shortfallExplanation: "Excess returned to cashier",
        adminNote: "Verified receipt serial numbers",
        audit_trail: [],
      },
    });

    expect(tabReceipts.attributes("aria-selected")).toBe("true");
    expect(panelReceipts.element.style.display).not.toBe("none");
    expect(notesSection.text()).toContain("Excess returned to cashier");
    expect(notesSection.text()).toContain("Verified receipt serial numbers");
  });
});
