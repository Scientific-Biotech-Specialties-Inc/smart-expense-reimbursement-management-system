// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ReimbursementsTable from "@/components/reimbursements/ReimbursementsTable.vue";
import ReimbursementDetailsModal from "@/components/reimbursements/ReimbursementDetailsModal.vue";
import CashAdvanceTable from "@/components/cash-advances/CashAdvanceTable.vue";
import CashAdvanceDetailsModal from "@/components/cash-advances/CashAdvanceDetailsModal.vue";
import { useReimbursementFilters } from "@/composables/reimbursements/useReimbursementFilters";

const mockAuth = {
  isAdmin: true,
  user: { id: 99, name: "Admin User" },
};

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => mockAuth,
}));

vi.mock("@/composables/useReportExport", () => ({
  useReportExport: () => ({
    isExporting: ref(false),
    exportReport: vi.fn(() => Promise.resolve(true)),
  }),
}));

describe("PRS Integration Badges & Search", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockAuth.isAdmin = true;
  });

  const reimbursementColumns = [
    { key: "reportDescription", label: "Report Description" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount", align: "right" },
    { key: "dateSubmitted", label: "Date Submitted" },
    { key: "displayStatus", label: "Status", align: "center" },
    { key: "action", sortKey: "id", label: "Action", align: "center" },
  ];

  it("renders From PRS and Activity # badges in ReimbursementsTable", () => {
    const wrapper = mount(ReimbursementsTable, {
      props: {
        rows: [
          {
            id: 101,
            source_system: "prs",
            prs_activity_id: 405,
            reportDescription: "Field Visit Reimbursement",
            category: "TRAVEL",
            amount: 1250,
            currency: "PHP",
            dateSubmitted: "2026-11-20",
            displayStatus: "pending",
          },
          {
            id: 102,
            source_system: "prs",
            source_submission_id: 889,
            reportDescription: "PRS Fallback Submission",
            category: "TRAVEL",
            amount: 900,
            currency: "PHP",
            dateSubmitted: "2026-11-21",
            displayStatus: "pending",
          },
          {
            id: 103,
            reportDescription: "Standard Local Expense",
            category: "OFFICE",
            amount: 300,
            currency: "PHP",
            dateSubmitted: "2026-11-22",
            displayStatus: "pending",
          },
        ],
        totalRows: 3,
        columns: reimbursementColumns,
        currentPage: 1,
      },
      global: {
        stubs: {
          StatusBadge: true,
          ActionDropdownMenu: true,
          BasePagination: true,
        },
      },
    });

    const rows = wrapper.findAll("tbody tr");
    expect(rows[0].text()).toContain("From PRS");
    expect(rows[0].text()).toContain("Activity #405");
    expect(rows[1].text()).toContain("From PRS");
    expect(rows[1].text()).toContain("Activity #889");
    expect(rows[2].text()).not.toContain("From PRS");
    expect(rows[2].text()).not.toContain("Activity #");
  });

  it("renders From PRS and Activity # badges in ReimbursementDetailsModal header", () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 201,
          status: "pending",
          source_system: "prs",
          prs_activity_id: 712,
          description: "PRS Activity Claim",
          user: { name: "Jane Doe" },
          amount: 3400,
          receipts: [],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
          BaseAuditTrail: true,
          SbsiReportPreviewModal: true,
        },
      },
    });

    expect(wrapper.text()).toContain("From PRS");
    expect(wrapper.text()).toContain("Activity #712");
  });

  it("renders From PRS and Planned Activity # badges in CashAdvanceTable Purpose cell", () => {
    const wrapper = mount(CashAdvanceTable, {
      props: {
        rows: [
          {
            id: 301,
            purpose: "Regional Calibration Trip",
            source_system: "prs",
            itinerary_id: 94,
            user: "Field Engineer",
            amount: 5000,
            requested: "2026-11-20",
            dueDate: "2026-11-30",
            status: "pending",
          },
        ],
        isAdmin: true,
        isLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          ActionDropdownMenu: true,
          BasePagination: true,
        },
      },
    });

    const purposeCell = wrapper.find("tbody tr td:first-child");
    expect(purposeCell.text()).toContain("From PRS");
    expect(purposeCell.text()).toContain("Planned Activity #94");
  });

  it("renders From PRS and Planned Activity # badges in CashAdvanceDetailsModal Admin and Employee headers", () => {
    const commonProps = {
      isOpen: true,
      record: {
        id: 401,
        userId: 10,
        requestedBy: "Juan Dela Cruz",
        purpose: "Client Site Itinerary",
        source_system: "prs",
        itinerary_id: 58,
        amount: 7500,
        balance: 7500,
        date: "2026-11-20",
        dueDate: "2026-11-30",
        status: "pending",
      },
    };
    const commonStubs = {
      UnifiedRoadmapStepper: true,
      StatusBadge: true,
      DecisionConfirmationModal: true,
      BaseModal: true,
      BaseAuditTrail: true,
      BaseSignaturePad: true,
      SbsiReportPreviewModal: true,
      GrantPayoutModal: true,
    };

    mockAuth.isAdmin = true;
    const adminWrapper = mount(CashAdvanceDetailsModal, {
      props: commonProps,
      global: { stubs: commonStubs },
    });
    expect(adminWrapper.text()).toContain("From PRS");
    expect(adminWrapper.text()).toContain("Planned Activity #58");

    mockAuth.isAdmin = false;
    const employeeWrapper = mount(CashAdvanceDetailsModal, {
      props: commonProps,
      global: { stubs: commonStubs },
    });
    expect(employeeWrapper.text()).toContain("From PRS");
    expect(employeeWrapper.text()).toContain("Planned Activity #58");
  });

  it("filters reimbursements by prs_activity_id and source_submission_id", () => {
    const store = {
      items: [
        {
          id: 1,
          description: "Trip A",
          prs_activity_id: 5512,
          source_system: "prs",
          status: "pending",
          amount: 1000,
        },
        {
          id: 2,
          description: "Trip B",
          source_submission_id: 9981,
          source_system: "prs",
          status: "pending",
          amount: 2000,
        },
      ],
    };

    const { searchQuery, filteredTableRows } = useReimbursementFilters(store);

    searchQuery.value = "5512";
    expect(filteredTableRows.value).toHaveLength(1);
    expect(filteredTableRows.value[0].id).toBe(1);

    searchQuery.value = "9981";
    expect(filteredTableRows.value).toHaveLength(1);
    expect(filteredTableRows.value[0].id).toBe(2);
  });
});
