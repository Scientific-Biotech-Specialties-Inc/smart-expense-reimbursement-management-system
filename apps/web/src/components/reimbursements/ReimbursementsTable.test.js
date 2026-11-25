// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReimbursementsTable from "./ReimbursementsTable.vue";

describe("ReimbursementsTable column sizing", () => {
  const columns = [
    { key: "reportDescription", label: "Report Description" },
    { key: "category", label: "Category", widthClass: "w-[140px]", paddingClass: "px-3" },
    { key: "amount", label: "Amount", align: "right", widthClass: "w-[136px]" },
    { key: "dateSubmitted", label: "Date Submitted", widthClass: "w-[168px]" },
    { key: "displayStatus", label: "Status", align: "center", widthClass: "w-[148px]" },
    { key: "action", sortKey: "id", label: "Action", align: "center", widthClass: "w-[116px]" },
  ];

  const rows = [
    {
      id: 1,
      reportDescription: "Quarterly instrument calibration and travel expenses",
      user_comment: "Submitted with complete receipts",
      category: "FIELD SERVICE",
      amount: 20000,
      currency: "PHP",
      dateSubmitted: "2026-11-15",
      displayStatus: "pending",
    },
  ];

  it("allocates compact width to category and leaves report description unconstrained", () => {
    const wrapper = mount(ReimbursementsTable, {
      props: {
        rows,
        totalRows: 1,
        columns,
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

    const headers = wrapper.findAll("thead th");
    expect(headers[0].classes()).not.toContain("w-[140px]");
    expect(headers[1].classes()).toContain("w-[140px]");
    expect(headers[1].classes()).toContain("px-3");

    const cells = wrapper.findAll("tbody tr td");
    expect(cells[0].classes()).not.toContain("max-w-[240px]");
    expect(cells[1].classes()).toContain("px-3");
  });

  it("displays From TS source tag, ticket badge, and reference_no when linked to a TS ticket", () => {
    const tsRows = [
      {
        id: 55,
        reference_no: "RMB-2026-00055",
        source_system: "ts",
        ticket_id: 42,
        ticket_number: "TKT-0042",
        reportDescription: "Calibration travel claim",
        category: "TRAVEL",
        amount: 2500,
        currency: "PHP",
        dateSubmitted: "2026-11-21",
        displayStatus: "pending",
      },
    ];

    const wrapper = mount(ReimbursementsTable, {
      props: {
        rows: tsRows,
        totalRows: 1,
        columns,
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

    expect(wrapper.text()).toContain("From TS");
    expect(wrapper.text()).toContain("Ticket TKT-0042");
    expect(wrapper.text()).toContain("RMB-2026-00055");
  });

  it("shows action-required red dot on action button only when the current user has an action to perform", () => {
    const statusRows = [
      { ...rows[0], id: 1, user_id: 10, displayStatus: "pending" },
      { ...rows[0], id: 2, user_id: 10, displayStatus: "revise" },
      {
        ...rows[0],
        id: 3,
        user_id: 10,
        displayStatus: "granted",
        payout: { acknowledged_at: null, employee_signature: null },
      },
      {
        ...rows[0],
        id: 4,
        user_id: 10,
        displayStatus: "granted",
        payout: { acknowledged_at: "2026-11-16T10:00:00Z", employee_signature: "sig" },
      },
      { ...rows[0], id: 5, user_id: 10, displayStatus: "rejected" },
    ];

    const employeeWrapper = mount(ReimbursementsTable, {
      props: {
        rows: statusRows,
        totalRows: 5,
        columns,
        currentPage: 1,
        isAdmin: false,
        currentUserId: 10,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BasePagination: true,
        },
      },
    });

    const empTrs = employeeWrapper.findAll("tbody tr");
    expect(empTrs[0].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // pending: waiting on admin
    expect(empTrs[1].find('[data-testid="action-pending-indicator"]').attributes("title")).toBe("Edit & resubmit request");
    expect(empTrs[2].find('[data-testid="action-pending-indicator"]').attributes("title")).toBe("Sign to acknowledge payout");
    expect(empTrs[3].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // granted acknowledged
    expect(empTrs[4].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // rejected

    const adminWrapper = mount(ReimbursementsTable, {
      props: {
        rows: [
          ...statusRows,
          { ...rows[0], id: 6, user_id: 99, displayStatus: "pending" },
          { ...rows[0], id: 7, user_id: 10, displayStatus: "approved" },
        ],
        totalRows: 7,
        columns,
        currentPage: 1,
        isAdmin: true,
        currentUserId: 99,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BasePagination: true,
        },
      },
    });

    const admTrs = adminWrapper.findAll("tbody tr");
    expect(admTrs[0].find('[data-testid="action-pending-indicator"]').attributes("title")).toBe("Review & approve claim");
    expect(admTrs[1].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // revise: waiting on employee
    expect(admTrs[2].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // granted: waiting on employee
    expect(admTrs[5].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // admin's own pending: cannot self-approve
    expect(admTrs[6].find('[data-testid="action-pending-indicator"]').attributes("title")).toBe("Grant payout");
  });
});
