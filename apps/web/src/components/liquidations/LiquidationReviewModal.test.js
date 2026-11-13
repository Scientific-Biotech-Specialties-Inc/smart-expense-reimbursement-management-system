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
});
