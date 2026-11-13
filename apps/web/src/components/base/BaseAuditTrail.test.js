// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BaseAuditTrail from "./BaseAuditTrail.vue";
import { formatDateTime } from "@/utils/formatters";
import * as auditTrailExportModule from "@/utils/auditTrailExport";

vi.spyOn(auditTrailExportModule, "exportAuditTrail").mockImplementation(() => true);

describe("formatDateTime", () => {
  it("formats ISO string into medium date and time with separator", () => {
    // 2026-10-20T14:30:00.000Z or local
    const formatted = formatDateTime("2026-10-20T14:30:00Z");
    expect(formatted).toContain("Oct");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("·");
  });

  it("returns dash for falsy dates", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("BaseAuditTrail", () => {
  const sampleTrail = [
    {
      id: "log-1",
      domain: "reimbursement",
      domain_label: "Reimbursement",
      action_type: "CLAIM_SUBMITTED",
      label: "Submitted",
      tone: "info",
      actor_name: "Juan Dela Cruz",
      actor_role: "Employee",
      ip_address: "10.0.0.1",
      comment: "Urgent reimbursement",
      changes: [],
      created_at: "2026-10-20T08:00:00Z",
    },
    {
      id: "log-2",
      domain: "reimbursement",
      domain_label: "Reimbursement",
      action_type: "CLAIM_REVISED",
      label: "Revised",
      tone: "warning",
      actor_name: "Alex Reyes",
      actor_role: "Approver",
      ip_address: "192.168.1.100",
      comment: "Please update receipt total.",
      changes: [
        { field: "Amount", key: "amount", before: "₱1,000.00", after: "₱1,200.00" },
      ],
      created_at: "2026-10-21T09:30:00Z",
    },
    {
      id: "log-3",
      domain: "payout",
      domain_label: "Payout",
      action_type: "PAYOUT_GRANTED",
      label: "Granted",
      tone: "success",
      actor_name: "Cashier Jane",
      actor_role: "Finance",
      ip_address: null, // Employee view mask
      comment: null,
      changes: [],
      created_at: "2026-10-22T10:15:00Z",
    },
  ];

  it("renders header and starts expanded by default", () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { trail: sampleTrail },
    });
    expect(wrapper.text()).toContain("Audit Trail");
    expect(wrapper.find('[data-testid="audit-trail-body"]').exists()).toBe(true);
  });

  it("collapses and expands when clicking header toggle", async () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { trail: sampleTrail },
    });
    const toggleBtn = wrapper.find('[data-testid="audit-trail-collapse-btn"]');
    expect(wrapper.find('[data-testid="audit-trail-body"]').exists()).toBe(true);

    await toggleBtn.trigger("click");
    expect(wrapper.find('[data-testid="audit-trail-body"]').exists()).toBe(false);

    await toggleBtn.trigger("click");
    expect(wrapper.find('[data-testid="audit-trail-body"]').exists()).toBe(true);
  });

  it("toggles sorting order between Latest First and Oldest First", async () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { trail: sampleTrail },
    });
    // Default is latest first (Oct 22 first)
    let items = wrapper.findAll('[data-testid="audit-event-item"]');
    expect(items[0].text()).toContain("Granted");

    // Click sort toggle
    const sortBtn = wrapper.find('[data-testid="audit-trail-sort-btn"]');
    await sortBtn.trigger("click");

    items = wrapper.findAll('[data-testid="audit-event-item"]');
    expect(items[0].text()).toContain("Submitted");
  });

  it("shows IP address badge when present and hides it when null", () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { trail: sampleTrail },
    });
    expect(wrapper.text()).toContain("10.0.0.1");
    expect(wrapper.text()).toContain("192.168.1.100");
    // Third item has null ip_address, should not render "null" text
    expect(wrapper.text()).not.toContain("null");
  });

  it("renders comment callout and changes diff table when present", () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { trail: sampleTrail },
    });
    expect(wrapper.text()).toContain("Please update receipt total.");
    expect(wrapper.text()).toContain("Amount");
    expect(wrapper.text()).toContain("₱1,000.00");
    expect(wrapper.text()).toContain("₱1,200.00");
  });

  it("caps display at 4 items when length > 4 and toggles Show All / Show Less", async () => {
    const manyEvents = [
      ...sampleTrail,
      {
        id: "log-4",
        domain: "cash_advance",
        action_type: "CASH_ADVANCE_APPROVED",
        label: "Approved",
        tone: "success",
        actor_name: "Manager Dan",
        actor_role: "Approver",
        created_at: "2026-10-23T11:00:00Z",
      },
      {
        id: "log-5",
        domain: "cash_advance",
        action_type: "CASH_ADVANCE_DISBURSED",
        label: "Disbursed",
        tone: "success",
        actor_name: "Finance Joy",
        actor_role: "Finance",
        created_at: "2026-10-24T12:00:00Z",
      },
      {
        id: "log-6",
        domain: "cash_advance",
        action_type: "CASH_ADVANCE_ACKNOWLEDGED",
        label: "Acknowledged",
        tone: "info",
        actor_name: "Juan Dela Cruz",
        actor_role: "Employee",
        created_at: "2026-10-25T13:00:00Z",
      },
    ];

    const wrapper = mount(BaseAuditTrail, {
      props: { trail: manyEvents },
    });

    // Initial cap should be 4
    expect(wrapper.findAll('[data-testid="audit-event-item"]').length).toBe(4);
    expect(wrapper.text()).toContain("Show all 6 events");

    // Click Show all
    const showAllBtn = wrapper.find('[data-testid="audit-trail-expand-cap-btn"]');
    await showAllBtn.trigger("click");
    expect(wrapper.findAll('[data-testid="audit-event-item"]').length).toBe(6);
    expect(wrapper.text()).toContain("Show less");
  });

  it("renders empty state message when trail is empty", () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { trail: [] },
    });
    expect(wrapper.text()).toContain("No audit trail records found");
    expect(wrapper.find('[data-testid="audit-trail-download-group"]').exists()).toBe(false);
  });

  it("renders download links (XLSX, CSV, PDF, JSON) and calls exportAuditTrail on click", async () => {
    const wrapper = mount(BaseAuditTrail, {
      props: { trail: sampleTrail, entityTitle: "Reimbursement #101" },
    });

    const downloadGroup = wrapper.find('[data-testid="audit-trail-download-group"]');
    expect(downloadGroup.exists()).toBe(true);

    const xlsxBtn = wrapper.find('[data-testid="audit-export-xlsx-btn"]');
    await xlsxBtn.trigger("click");
    expect(auditTrailExportModule.exportAuditTrail).toHaveBeenCalledWith(
      sampleTrail,
      "xlsx",
      expect.objectContaining({ entityTitle: "Reimbursement #101" })
    );

    const csvBtn = wrapper.find('[data-testid="audit-export-csv-btn"]');
    await csvBtn.trigger("click");
    expect(auditTrailExportModule.exportAuditTrail).toHaveBeenCalledWith(
      sampleTrail,
      "csv",
      expect.objectContaining({ entityTitle: "Reimbursement #101" })
    );

    const pdfBtn = wrapper.find('[data-testid="audit-export-pdf-btn"]');
    await pdfBtn.trigger("click");
    expect(auditTrailExportModule.exportAuditTrail).toHaveBeenCalledWith(
      sampleTrail,
      "pdf",
      expect.objectContaining({ entityTitle: "Reimbursement #101" })
    );

    const jsonBtn = wrapper.find('[data-testid="audit-export-json-btn"]');
    await jsonBtn.trigger("click");
    expect(auditTrailExportModule.exportAuditTrail).toHaveBeenCalledWith(
      sampleTrail,
      "json",
      expect.objectContaining({ entityTitle: "Reimbursement #101" })
    );
  });

  it("hides domain badges when all events belong to a single module", () => {
    const singleModuleTrail = [
      {
        id: "log-1",
        domain: "cash_advance",
        domain_label: "Cash Advance",
        label: "Submitted",
        actor_name: "Juan Dela Cruz",
        created_at: "2026-10-20T08:00:00Z",
      },
      {
        id: "log-2",
        domain: "cash_advance",
        domain_label: "Cash Advance",
        label: "Approved",
        actor_name: "Approver Dan",
        created_at: "2026-10-21T09:00:00Z",
      },
    ];

    const wrapper = mount(BaseAuditTrail, {
      props: { trail: singleModuleTrail },
    });

    // Should NOT show [Cash Advance] on every row when all events share the same domain
    expect(wrapper.find('[data-testid="audit-domain-badge"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("[Cash Advance]");
  });

  it("shows domain badges when events span multiple linked modules (e.g. Cash Advance and Liquidation)", () => {
    const multiModuleTrail = [
      {
        id: "log-1",
        domain: "cash_advance",
        domain_label: "Cash Advance",
        label: "Disbursed",
        actor_name: "Finance Joy",
        created_at: "2026-10-20T08:00:00Z",
      },
      {
        id: "log-2",
        domain: "liquidation",
        domain_label: "Liquidation",
        label: "Submitted",
        actor_name: "Juan Dela Cruz",
        created_at: "2026-10-25T09:00:00Z",
      },
    ];

    const wrapper = mount(BaseAuditTrail, {
      props: { trail: multiModuleTrail },
    });

    const badges = wrapper.findAll('[data-testid="audit-domain-badge"]');
    expect(badges.length).toBe(2);
    expect(badges[0].text()).toBe("[Liquidation]");
    expect(badges[1].text()).toBe("[Cash Advance]");
  });
});


