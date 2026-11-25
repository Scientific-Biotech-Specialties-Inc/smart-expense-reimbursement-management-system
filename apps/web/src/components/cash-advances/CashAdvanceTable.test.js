// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import CashAdvanceTable from "./CashAdvanceTable.vue";

describe("CashAdvanceTable Component Sorting", () => {
  const rows = [
    {
      id: 1,
      purpose: "Old Advance",
      user: "Employee One",
      amount: 1000,
      requested: "2026-08-01",
      created_at: "2026-08-01T08:00:00Z",
      dueDate: "2026-08-15",
      status: "pending",
    },
    {
      id: 2,
      purpose: "New Advance",
      user: "Employee Two",
      amount: 2500,
      requested: "2026-08-20",
      created_at: "2026-08-20T08:00:00Z",
      dueDate: "2026-08-30",
      status: "pending",
    },
    {
      id: 3,
      purpose: "Latest Advance Same Day Higher ID",
      user: "Employee Three",
      amount: 3000,
      requested: "2026-08-20",
      created_at: "2026-08-20T12:00:00Z",
      dueDate: "2026-08-30",
      status: "pending",
    },
  ];

  it("renders latest cash advances first by default (requested desc)", () => {
    const wrapper = mount(CashAdvanceTable, {
      props: {
        rows,
        isAdmin: true,
        isLoading: false,
      },
    });

    const purposeCells = wrapper.findAll("tbody tr td:first-child");
    expect(purposeCells.length).toBe(3);
    expect(purposeCells[0].text()).toContain("Latest Advance Same Day Higher ID");
    expect(purposeCells[1].text()).toContain("New Advance");
    expect(purposeCells[2].text()).toContain("Old Advance");
  });

  it("shows red dot on action button only when current user has a required action", () => {
    const statusRows = [
      { id: 10, userId: 1, purpose: "Pending CA", user: "U1", amount: 1000, created_at: "2026-08-25T08:00:00Z", status: "pending" },
      { id: 11, userId: 1, purpose: "Disbursed CA", user: "U1", amount: 1000, created_at: "2026-08-24T08:00:00Z", status: "disbursed" },
      { id: 12, userId: 1, purpose: "Revise CA", user: "U1", amount: 1000, created_at: "2026-08-23T08:00:00Z", status: "revise" },
      { id: 13, userId: 1, purpose: "Signed CA", user: "U1", amount: 1000, created_at: "2026-08-22T08:00:00Z", status: "signed" },
      { id: 14, userId: 99, purpose: "Own Pending CA", user: "Admin", amount: 1000, created_at: "2026-08-21T08:00:00Z", status: "pending" },
    ];

    const adminWrapper = mount(CashAdvanceTable, {
      props: { rows: statusRows, isAdmin: true, currentUserId: 99, isLoading: false },
    });

    const admTrs = adminWrapper.findAll("tbody tr");
    expect(admTrs[0].find('[data-testid="action-pending-indicator"]').attributes("title")).toBe("Review & approve request");
    expect(admTrs[1].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // other disbursed: employee signs
    expect(admTrs[2].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // other revise: employee edits
    expect(admTrs[3].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // signed
    expect(admTrs[4].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // own pending: cannot self-approve

    const employeeWrapper = mount(CashAdvanceTable, {
      props: { rows: statusRows.slice(0, 4), isAdmin: false, currentUserId: 1, isLoading: false },
    });

    const empTrs = employeeWrapper.findAll("tbody tr");
    expect(empTrs[0].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // pending: waiting on admin
    expect(empTrs[1].find('[data-testid="action-pending-indicator"]').attributes("title")).toBe("Sign to acknowledge receipt");
    expect(empTrs[2].find('[data-testid="action-pending-indicator"]').attributes("title")).toBe("Edit & resubmit request");
    expect(empTrs[3].find('[data-testid="action-pending-indicator"]').exists()).toBe(false); // signed
  });
});

describe("CashAdvanceTable Disbursement Column", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T10:00:00+08:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const sampleRows = [
    {
      id: 1,
      purpose: "Green 12 Days",
      user: "Emp A",
      amount: 1000,
      requested: "Nov 20, 2026",
      created_at: "2026-11-20T08:00:00Z",
      expected_disbursement_date: "2026-12-07",
      dueDate: "Dec 20, 2026",
      status: "pending",
    },
    {
      id: 2,
      purpose: "Orange 6 Days",
      user: "Emp B",
      amount: 1500,
      requested: "Nov 19, 2026",
      created_at: "2026-11-19T08:00:00Z",
      expected_disbursement_date: "2026-12-01T00:00:00.000000Z",
      dueDate: "Dec 15, 2026",
      status: "approved",
    },
    {
      id: 3,
      purpose: "Red 3 Days",
      user: "Emp C",
      amount: 2000,
      requested: "Nov 18, 2026",
      created_at: "2026-11-18T08:00:00Z",
      expected_disbursement_date: "2026-11-28",
      dueDate: "Dec 12, 2026",
      status: "revise",
    },
    {
      id: 4,
      purpose: "Red Due Today",
      user: "Emp D",
      amount: 2500,
      requested: "Nov 17, 2026",
      created_at: "2026-11-17T08:00:00Z",
      expected_disbursement_date: "2026-11-25",
      dueDate: "Dec 10, 2026",
      status: "pending",
    },
    {
      id: 5,
      purpose: "Red Overdue 2 Days",
      user: "Emp E",
      amount: 3000,
      requested: "Nov 16, 2026",
      created_at: "2026-11-16T08:00:00Z",
      expected_disbursement_date: "2026-11-23",
      dueDate: "Dec 08, 2026",
      status: "approved",
    },
    {
      id: 6,
      purpose: "Already Disbursed",
      user: "Emp F",
      amount: 3500,
      requested: "Nov 15, 2026",
      created_at: "2026-11-15T08:00:00Z",
      expected_disbursement_date: "2026-11-20",
      disbursement: { disbursement_date: "2026-11-20" },
      dueDate: "Dec 05, 2026",
      status: "signed",
    },
    {
      id: 7,
      purpose: "Rejected Request",
      user: "Emp G",
      amount: 4000,
      requested: "Nov 14, 2026",
      created_at: "2026-11-14T08:00:00Z",
      expected_disbursement_date: "2026-11-29",
      dueDate: "Dec 04, 2026",
      status: "rejected",
    },
    {
      id: 8,
      purpose: "Missing Expected Date",
      user: "Emp H",
      amount: 4500,
      requested: "Nov 13, 2026",
      created_at: "2026-11-13T08:00:00Z",
      dueDate: "Dec 03, 2026",
      status: "pending",
    },
  ];

  it("renders Disbursement column header on both employee and admin tables after Date Requested", () => {
    const empWrapper = mount(CashAdvanceTable, {
      props: { rows: sampleRows, isAdmin: false, isLoading: false },
    });
    const empHeaders = empWrapper.findAll("thead th").map((th) => th.text());
    expect(empHeaders).toEqual([
      "Purpose",
      "Amount",
      "Date Requested",
      "Disbursement",
      "Due Date",
      "Status",
      "Actions",
    ]);

    const adminWrapper = mount(CashAdvanceTable, {
      props: { rows: sampleRows, isAdmin: true, isLoading: false },
    });
    const adminHeaders = adminWrapper.findAll("thead th").map((th) => th.text());
    expect(adminHeaders).toEqual([
      "Purpose",
      "User",
      "Amount",
      "Date Requested",
      "Disbursement",
      "Due Date",
      "Status",
      "Actions",
    ]);
  });

  it("displays green, orange/amber, red, neutral Disbursed, and dash states matching StatusBadge styling", () => {
    const wrapper = mount(CashAdvanceTable, {
      props: { rows: sampleRows, isAdmin: false, isLoading: false },
    });

    const badges = wrapper.findAll('[data-testid="disbursement-badge"]');
    expect(badges.length).toBe(6);

    // 12 days left -> green (emerald)
    expect(badges[0].text()).toBe("12 days left");
    expect(badges[0].classes()).toEqual(
      expect.arrayContaining(["bg-emerald-50", "text-emerald-700", "border-emerald-300", "h-6", "px-3", "rounded-full"]),
    );
    expect(badges[0].attributes("title")).toBe("Expected disbursement: Dec 7, 2026");

    // 6 days left -> orange/amber
    expect(badges[1].text()).toBe("6 days left");
    expect(badges[1].classes()).toEqual(
      expect.arrayContaining(["bg-amber-50", "text-amber-700", "border-amber-300"]),
    );
    expect(badges[1].attributes("title")).toBe("Expected disbursement: Dec 1, 2026");

    // 3 days left -> red
    expect(badges[2].text()).toBe("3 days left");
    expect(badges[2].classes()).toEqual(
      expect.arrayContaining(["bg-red-50", "text-red-700", "border-red-300"]),
    );

    // 0 days left -> Due today (red)
    expect(badges[3].text()).toBe("Due today");
    expect(badges[3].classes()).toEqual(
      expect.arrayContaining(["bg-red-50", "text-red-700", "border-red-300"]),
    );

    // -2 days -> 2 days overdue (red)
    expect(badges[4].text()).toBe("2 days overdue");
    expect(badges[4].classes()).toEqual(
      expect.arrayContaining(["bg-red-50", "text-red-700", "border-red-300"]),
    );

    // Already disbursed -> neutral Disbursed pill with actual date tooltip
    expect(badges[5].text()).toBe("Disbursed");
    expect(badges[5].classes()).toEqual(
      expect.arrayContaining(["bg-slate-100", "text-slate-700", "border-slate-300"]),
    );
    expect(badges[5].attributes("title")).toBe("Disbursed on Nov 20, 2026");

    // Rejected & missing expected_disbursement_date -> em dash
    const trs = wrapper.findAll("tbody tr");
    expect(trs[6].findAll("td")[3].text()).toBe("—");
    expect(trs[7].findAll("td")[3].text()).toBe("—");
  });

  it("sorts rows by expected disbursement date when clicking Disbursement header", async () => {
    const wrapper = mount(CashAdvanceTable, {
      props: { rows: sampleRows.slice(0, 4), isAdmin: false, isLoading: false },
    });

    const disbursementSortBtn = wrapper.findAll("thead th button")[3];
    await disbursementSortBtn.trigger("click");

    const purposesAsc = wrapper.findAll("tbody tr td:first-child").map((td) => td.text());
    expect(purposesAsc).toEqual([
      "Red Due Today",
      "Red 3 Days",
      "Orange 6 Days",
      "Green 12 Days",
    ]);

    await disbursementSortBtn.trigger("click");
    const purposesDesc = wrapper.findAll("tbody tr td:first-child").map((td) => td.text());
    expect(purposesDesc).toEqual([
      "Green 12 Days",
      "Orange 6 Days",
      "Red 3 Days",
      "Red Due Today",
    ]);
  });
});
