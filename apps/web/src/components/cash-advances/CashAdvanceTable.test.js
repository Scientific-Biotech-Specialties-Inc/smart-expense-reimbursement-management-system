// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
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
