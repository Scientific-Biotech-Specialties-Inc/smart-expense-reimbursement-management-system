// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UnifiedRoadmapStepper from "./UnifiedRoadmapStepper.vue";

describe("UnifiedRoadmapStepper", () => {
  const baseCashAdvance = {
    id: 1,
    status: "disbursed",
    amount: 5000,
    requestedBy: "General Employee",
    date: "2026-08-20",
  };

  it("extracts and formats actor name when actor in statusHistory is an object instead of stringifying it", () => {
    const statusHistory = [
      {
        id: 1,
        status: "pending",
        changed_at: "2026-08-20T08:00:00Z",
        actor: {
          id: 106,
          auth_id: 7,
          name: "General Employee",
          email: "employee@example.com",
          role: "employee",
        },
      },
      {
        id: 2,
        status: "approved",
        changed_at: "2026-08-21T09:30:00Z",
        changed_by: {
          id: 102,
          name: "Finance Manager",
          email: "approver@example.com",
        },
      },
    ];

    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: baseCashAdvance,
        statusHistory,
      },
    });

    const renderedText = wrapper.text();

    // Verify actor names appear as human-readable strings
    expect(renderedText).toContain("General Employee");
    expect(renderedText).toContain("Finance Manager");

    // Verify raw JSON object strings are NOT leaked into the rendered output
    expect(renderedText).not.toContain('{"id":');
    expect(renderedText).not.toContain('"auth_id":');
    expect(renderedText).not.toContain('"role":');
    expect(renderedText).not.toContain("[object Object]");
  });

  it("handles string actor and JSON-stringified actor in statusHistory", () => {
    const statusHistory = [
      {
        id: 1,
        status: "pending",
        changed_at: "2026-08-20T08:00:00Z",
        actor: "Jane Doe",
      },
      {
        id: 2,
        status: "approved",
        changed_at: "2026-08-21T09:30:00Z",
        actor: JSON.stringify({ name: "John Admin", role: "admin" }),
      },
    ];

    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: baseCashAdvance,
        statusHistory,
      },
    });

    const renderedText = wrapper.text();
    expect(renderedText).toContain("Jane Doe");
    expect(renderedText).toContain("John Admin");
    expect(renderedText).not.toContain('"role":');
  });

  it("renders horizontal 1-row layout by default (for cash advance pages and modals)", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: baseCashAdvance,
        statusHistory: [],
      },
    });

    const desktopLines = wrapper.findAll(".sm\\:block.h-0\\.5");
    expect(desktopLines.length).toBe(1);

    expect(desktopLines[0].classes()).toContain("top-4");
    expect(desktopLines[0].classes()).toContain("-translate-y-1/2");

    const styleAttr = desktopLines[0].attributes("style");
    // For 6 steps horizontal, offset is 100 / (2 * 6) = 8.333%
    expect(styleAttr).toContain("8.33");
  });

  it("renders 6-step serpentine layout when layout='serpentine' without Under Review or Decision steps", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: baseCashAdvance,
        layout: "serpentine",
        statusHistory: [],
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Phase 1: Cash Advance");
    expect(text).toContain("Phase 2: Liquidation & Settlement");

    // Must NOT contain removed steps
    expect(text).not.toContain("Under Review");
    expect(text).not.toContain("Decision");

    // Must contain 6 canonical steps
    expect(text).toContain("Request");
    expect(text).toContain("Approval");
    expect(text).toContain("Disbursed");
    expect(text).toContain("Acknowledged");
    expect(text).toContain("Liquidation");
    expect(text).toContain("Settled");

    // Check connector lines for row 1 and row 2
    const lines = wrapper.findAll(".sm\\:block.h-0\\.5");
    expect(lines.length).toBe(2);

    lines.forEach((line) => {
      expect(line.classes()).toContain("top-4");
      expect(line.classes()).toContain("-translate-y-1/2");
      const styleAttr = line.attributes("style");
      expect(styleAttr).toContain("12.5%");
    });
  });

  it("renders Step 5 (Liquidation) as Pending when advance is signed but liquidation is not yet submitted", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: { ...baseCashAdvance, status: "signed" },
        liquidation: null,
      },
    });

    const buttons = wrapper.findAll("button");
    expect(buttons.length).toBe(6);

    // Step 4 (Acknowledged) should be completed (Check icon)
    // Step 5 (Liquidation, index 4) should be current (Clock icon)
    expect(buttons[4].attributes("aria-current")).toBe("step");

    const text = wrapper.text();
    expect(text).toContain("Liquidation");
    expect(text).toContain("Settled");
  });

  it("renders Step 5 (Liquidation) as Under Review when liquidation is submitted", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: { ...baseCashAdvance, status: "under-review" },
        liquidation: {
          id: 10,
          status: "pending",
          total_expense_amount: 5000,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Liquidation");
    expect(text).toContain("Under Review");

    const buttons = wrapper.findAll("button");
    // Step 5 is active current step
    expect(buttons[4].attributes("aria-current")).toBe("step");
  });

  it("marks Step 6 (Settled) as Complete (completed) when admin approves liquidation", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: { ...baseCashAdvance, status: "liquidated" },
        liquidation: {
          id: 10,
          status: "liquidated",
          total_expense_amount: 5000,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Complete");
    expect(text).not.toContain("Pending");

    const buttons = wrapper.findAll("button");
    // All 6 buttons should have completed styling (bg-emerald-500)
    buttons.forEach((btn) => {
      expect(btn.classes()).toContain("bg-emerald-500");
    });

    // Step 6 settled must NOT be in pending state
    expect(buttons[5].attributes("aria-current")).toBeUndefined();
  });

  it("marks Step 5 (Liquidation) as Needs Revision when liquidation status is revise", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: { ...baseCashAdvance, status: "under-review" },
        liquidation: {
          id: 10,
          status: "revise",
          revision_count: 1,
          total_expense_amount: 5000,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Needs Revision");
    expect(text).toContain("1/3");

    const buttons = wrapper.findAll("button");
    expect(buttons[4].classes()).toContain("bg-orange-500");
  });

  it("marks Step 5 (Liquidation) as Rejected when liquidation status is rejected", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: { ...baseCashAdvance, status: "under-review" },
        liquidation: {
          id: 10,
          status: "rejected",
          revision_count: 3,
          total_expense_amount: 5000,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Rejected");

    const buttons = wrapper.findAll("button");
    expect(buttons[4].classes()).toContain("bg-red-500");
  });

  it("does NOT leak approval or disbursement admin actor into liquidation step when liquidation is not yet tackled", () => {
    const statusHistory = [
      {
        id: 1,
        status: "pending",
        changed_at: "2026-08-20T08:00:00Z",
        actor: "General Employee",
      },
      {
        id: 2,
        status: "approved",
        changed_at: "2026-08-21T09:30:00Z",
        actor: "Finance Manager Approver",
      },
      {
        id: 3,
        status: "disbursed",
        changed_at: "2026-08-22T10:00:00Z",
        actor: "Finance Disburser",
      },
      {
        id: 4,
        status: "signed",
        changed_at: "2026-08-22T11:00:00Z",
        actor: "General Employee",
      },
    ];

    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: { ...baseCashAdvance, status: "signed" },
        liquidation: null,
        statusHistory,
      },
    });

    const stepItems = wrapper.findAllComponents({ name: "RoadmapStepItem" });
    expect(stepItems.length).toBe(6);

    // Step 2 (Approval) should have the approver
    expect(stepItems[1].text()).toContain("Finance Manager Approver");

    // Step 3 (Disbursed) should have the disburser
    expect(stepItems[2].text()).toContain("Finance Disburser");

    // Step 4 (Acknowledged) should have the employee
    expect(stepItems[3].text()).toContain("General Employee");

    // Step 5 (Liquidation) must NOT have been tackled yet — must NOT contain Finance Manager Approver or Finance Disburser
    expect(stepItems[4].text()).not.toContain("Finance Manager Approver");
    expect(stepItems[4].text()).not.toContain("Finance Disburser");
    expect(stepItems[4].props("historyEntry")).toBeNull();
  });

  it("displays the employee as actor on liquidation step when submitted, never the approver or disburser", () => {
    const statusHistory = [
      {
        id: 1,
        status: "pending",
        changed_at: "2026-08-20T08:00:00Z",
        actor: "General Employee",
      },
      {
        id: 2,
        status: "approved",
        changed_at: "2026-08-21T09:30:00Z",
        actor: "Finance Manager Approver",
      },
      {
        id: 3,
        status: "disbursed",
        changed_at: "2026-08-22T10:00:00Z",
        actor: "Finance Disburser",
      },
      {
        id: 4,
        status: "signed",
        changed_at: "2026-08-22T11:00:00Z",
        actor: "General Employee",
      },
    ];

    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: {
          ...baseCashAdvance,
          status: "under-review",
          requestedBy: "General Employee",
        },
        liquidation: {
          id: 10,
          status: "pending",
          created_at: "2026-08-23T14:00:00Z",
          user: { name: "General Employee" },
        },
        statusHistory,
      },
    });

    const stepItems = wrapper.findAllComponents({ name: "RoadmapStepItem" });
    expect(stepItems.length).toBe(6);

    // Step 5 (Liquidation) must show the employee who submitted, NOT the approver or disburser
    expect(stepItems[4].text()).toContain("General Employee");
    expect(stepItems[4].text()).not.toContain("Finance Manager Approver");
    expect(stepItems[4].text()).not.toContain("Finance Disburser");
  });

  it("resolves Step 2 (Approval) metadata from approval_actions when statusHistory is empty", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: {
          ...baseCashAdvance,
          status: "approved",
          approval_actions: [
            {
              id: 1,
              action: "approved",
              actioned_at: "2026-08-21T09:30:00Z",
              approver: { id: 10, name: "Finance Director" },
            },
          ],
        },
        statusHistory: [],
      },
    });

    const stepItems = wrapper.findAllComponents({ name: "RoadmapStepItem" });
    const step2 = stepItems[1];
    expect(step2.props("state")).toBe("completed");
    expect(step2.props("sublabel")).toBe("Approved");
    expect(step2.text()).toContain("Finance Director");
    expect(step2.props("historyEntry")).not.toBeNull();
    expect(step2.props("historyEntry").actor).toBe("Finance Director");
  });

  it("resolves Step 3 (Disbursed) metadata from disbursement object when statusHistory is empty", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: {
          ...baseCashAdvance,
          status: "disbursed",
          disbursement: {
            id: 5,
            disbursed_at: "2026-08-22T14:00:00Z",
            disbursed_by: { id: 22, name: "Disbursement Officer" },
            reference_number: "REF-99881",
          },
        },
        statusHistory: [],
      },
    });

    const stepItems = wrapper.findAllComponents({ name: "RoadmapStepItem" });
    const step3 = stepItems[2];
    expect(step3.props("sublabel")).toBe("Released");
    expect(step3.text()).toContain("Disbursement Officer");
    expect(step3.props("historyEntry").actor).toBe("Disbursement Officer");
    expect(step3.props("historyEntry").comment).toBe("REF-99881");
  });

  it("displays expected disbursement date on Step 3 when advance is approved (state='current')", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: {
          ...baseCashAdvance,
          status: "approved",
          expected_disbursement_date: "2026-09-10",
        },
        statusHistory: [],
      },
    });

    const stepItems = wrapper.findAllComponents({ name: "RoadmapStepItem" });
    const step3 = stepItems[2];
    expect(step3.props("state")).toBe("current");
    expect(step3.props("sublabel")).toBe("Processing");
    expect(step3.props("historyEntry")).not.toBeNull();
    expect(step3.props("historyEntry").date).toBe("2026-09-10");
  });

  it("resolves Step 4 (Acknowledged) metadata from acknowledgedAt and requestedBy when statusHistory is empty", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: {
          ...baseCashAdvance,
          status: "signed",
          acknowledgedAt: "2026-08-23T10:00:00Z",
          requestedBy: "General Employee",
        },
        statusHistory: [],
      },
    });

    const stepItems = wrapper.findAllComponents({ name: "RoadmapStepItem" });
    const step4 = stepItems[3];
    expect(step4.props("sublabel")).toBe("Signed");
    expect(step4.props("historyEntry")).not.toBeNull();
    expect(step4.props("historyEntry").actor).toBe("General Employee");
  });

  it("renders penalty amount without (Day X) on overdue roadmap step badges", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: {
          ...baseCashAdvance,
          status: "overdue",
          expected_liquidation_date: "2026-08-01",
        },
        penalties: [
          { penalty_amount: 2250 },
        ],
        statusHistory: [],
      },
    });

    expect(wrapper.text()).toContain("PHP 2,250");
    expect(wrapper.text()).not.toContain("(Day");
  });

  it("splits into 2-row serpentine layout when overpayment is added (>6 steps)", () => {
    const wrapper = mount(UnifiedRoadmapStepper, {
      props: {
        cashAdvance: {
          ...baseCashAdvance,
          status: "settled",
        },
        overpaymentAmount: 5000,
        statusHistory: [],
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Phase 1: Cash Advance");
    expect(text).toContain("Phase 2: Liquidation & Settlement");
    expect(text).toContain("Overpayment");
    expect(text).toContain("₱5,000.00 → Reimbursement");

    const stepItems = wrapper.findAllComponents({ name: "RoadmapStepItem" });
    expect(stepItems.length).toBe(7);
  });
});
