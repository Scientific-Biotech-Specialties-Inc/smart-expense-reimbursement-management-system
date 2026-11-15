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
});
