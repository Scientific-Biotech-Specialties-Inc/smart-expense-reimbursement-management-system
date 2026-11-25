// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import PayoutDetailsModal from "./PayoutDetailsModal.vue";
import DaysLeftBadge from "@/components/base/DaysLeftBadge.vue";

describe("PayoutDetailsModal", () => {
  const samplePayout = {
    id: 10,
    amount: 1500,
    currency: "PHP",
    description: "Reimbursement Payout",
    payoutMethod: "Cash",
    requestDate: "2026-10-20",
    approvedDate: "2026-10-21",
    grantedDate: "2026-10-22",
    approvedBy: "Approver Dan",
    grantedBy: "Cashier Jane",
    acknowledged: false,
    audit_trail: [
      {
        id: "payout-log-1",
        domain: "reimbursement",
        domain_label: "Reimbursement",
        action_type: "CLAIM_SUBMITTED",
        label: "Submitted",
        actor_name: "Juan Dela Cruz",
        created_at: "2026-10-20T08:00:00Z",
      },
      {
        id: "payout-log-2",
        domain: "payout",
        domain_label: "Payout",
        action_type: "PAYOUT_GRANTED",
        label: "Granted",
        actor_name: "Cashier Jane",
        created_at: "2026-10-22T10:00:00Z",
      },
    ],
  };

  it("renders BaseAuditTrail with payout audit trail events", () => {
    const wrapper = mount(PayoutDetailsModal, {
      props: {
        record: samplePayout,
        isAdmin: true,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseButton: true,
          BaseSignaturePad: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Audit Trail");
    expect(wrapper.text()).toContain("Juan Dela Cruz");
    expect(wrapper.text()).toContain("Cashier Jane");
  });

  it("renders Reimbursement type badge and Payout-# entityTitle by default", () => {
    const wrapper = mount(PayoutDetailsModal, {
      props: {
        record: samplePayout,
        isAdmin: true,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseButton: true,
          BaseSignaturePad: true,
        },
      },
    });

    const typeBadge = wrapper.find('[data-testid="payout-type-badge"]');
    expect(typeBadge.exists()).toBe(true);
    expect(typeBadge.text()).toContain("Reimbursement");

    const auditTrail = wrapper.findComponent({ name: "BaseAuditTrail" });
    expect(auditTrail.exists()).toBe(true);
    expect(auditTrail.props("entityTitle")).toBe("Payout-#10");
  });

  it("renders Cash Advance type badge, Medium Date formatting, and Cash-Advance-# entityTitle for cash_advance records", () => {
    const cashAdvancePayout = {
      ...samplePayout,
      id: 25,
      type: "cash_advance",
      typeLabel: "Cash Advance",
      referenceNumber: "Ref #25",
      description: "Field Calibration Travel",
      payoutMethod: "E-wallet",
      granterSignature: "data:image/png;base64,granterSig25",
      acknowledgementStatus: "awaiting-acknowledgement",
    };

    const wrapper = mount(PayoutDetailsModal, {
      props: {
        record: cashAdvancePayout,
        isAdmin: true,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseButton: true,
          BaseSignaturePad: true,
        },
      },
    });

    const typeBadge = wrapper.find('[data-testid="payout-type-badge"]');
    expect(typeBadge.exists()).toBe(true);
    expect(typeBadge.text()).toContain("Cash Advance");
    expect(wrapper.text()).not.toContain("Payout Details");
    expect(wrapper.text()).toContain("₱1,500.00");
    expect(wrapper.text()).toContain("Oct 20, 2026");
    expect(wrapper.text()).toContain("Oct 21, 2026");
    expect(wrapper.text()).toContain("Oct 22, 2026");
    expect(wrapper.text()).toContain("E-wallet");

    const auditTrail = wrapper.findComponent({ name: "BaseAuditTrail" });
    expect(auditTrail.exists()).toBe(true);
    expect(auditTrail.props("entityTitle")).toBe("Cash-Advance-#25");
  });

  it("allows employee to sign and emit acknowledge for an unacknowledged cash_advance payout", async () => {
    const cashAdvancePayout = {
      ...samplePayout,
      id: 26,
      type: "cash_advance",
      typeLabel: "Cash Advance",
      referenceNumber: "Ref #26",
      acknowledged: false,
      acknowledgementStatus: "awaiting-acknowledgement",
    };

    const wrapper = mount(PayoutDetailsModal, {
      props: {
        record: cashAdvancePayout,
        isAdmin: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseAuditTrail: true,
        },
      },
    });

    const sigPad = wrapper.findComponent({ name: "BaseSignaturePad" });
    expect(sigPad.exists()).toBe(true);
    expect(sigPad.props("required")).toBe(true);
    expect(sigPad.find(".rounded-xl.border").classes()).toContain("border-red-500");

    const ackBtn = wrapper.find('[data-testid="acknowledge-payout-btn"]');
    expect(ackBtn.exists()).toBe(true);
    expect(ackBtn.attributes("disabled")).toBeDefined();

    await sigPad.vm.$emit("update:modelValue", "data:image/png;base64,empCaSig");
    await nextTick();
    expect(sigPad.find(".rounded-xl.border").classes()).toContain("border-slate-200");
    expect(sigPad.find(".rounded-xl.border").classes()).not.toContain("border-red-500");
    expect(ackBtn.attributes("disabled")).toBeUndefined();

    await ackBtn.trigger("click");
    expect(wrapper.emitted("acknowledge")).toEqual([["data:image/png;base64,empCaSig"]]);
  });

  it("renders read-only awaiting acknowledgement state for admin on cash_advance payout", () => {
    const cashAdvancePayout = {
      ...samplePayout,
      id: 27,
      type: "cash_advance",
      typeLabel: "Cash Advance",
      acknowledged: false,
      acknowledgementStatus: "awaiting-acknowledgement",
    };

    const wrapper = mount(PayoutDetailsModal, {
      props: {
        record: cashAdvancePayout,
        isAdmin: true,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseAuditTrail: true,
        },
      },
    });

    expect(wrapper.findComponent({ name: "BaseSignaturePad" }).exists()).toBe(false);
    expect(wrapper.find('[data-testid="acknowledge-payout-btn"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Awaiting Acknowledgement");
  });

  it("renders the 4-step Payout Roadmap accurately across awaiting, acknowledged, and date-fallback states", async () => {
    const wrapper = mount(PayoutDetailsModal, {
      props: {
        record: samplePayout,
        isAdmin: true,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseButton: true,
          BaseSignaturePad: true,
          BaseAuditTrail: true,
        },
      },
    });

    const stepper = wrapper.find('[data-testid="payout-roadmap-stepper"]');
    expect(stepper.exists()).toBe(true);

    const stepRequested = stepper.find('[data-testid="payout-step-requested"]');
    const stepApproved = stepper.find('[data-testid="payout-step-approved"]');
    const stepGranted = stepper.find('[data-testid="payout-step-granted"]');
    const stepAcknowledged = stepper.find('[data-testid="payout-step-acknowledged"]');

    expect(stepRequested.text()).toContain("Requested");
    expect(stepRequested.text()).toContain("Oct 20, 2026");
    expect(stepApproved.text()).toContain("Approved");
    expect(stepApproved.text()).toContain("Oct 21, 2026");
    expect(stepGranted.text()).toContain("Granted");
    expect(stepGranted.text()).toContain("Oct 22, 2026");

    expect(stepAcknowledged.attributes("aria-current")).toBe("step");
    expect(stepAcknowledged.find(".bg-amber-400").exists()).toBe(true);
    expect(stepAcknowledged.text()).toContain("Awaiting");

    // Update to acknowledged with timestamp
    await wrapper.setProps({
      record: {
        ...samplePayout,
        acknowledged: true,
        acknowledgedAt: "2026-10-23T09:00:00Z",
      },
    });

    expect(stepAcknowledged.attributes("aria-current")).toBeUndefined();
    expect(stepAcknowledged.find(".bg-emerald-500").exists()).toBe(true);
    expect(stepAcknowledged.text()).toContain("Oct 23, 2026");

    // Update to acknowledged without timestamp and missing dates for sublabel fallbacks
    await wrapper.setProps({
      record: {
        id: 11,
        amount: 500,
        acknowledged: true,
      },
    });

    expect(stepRequested.text()).toContain("Recorded");
    expect(stepApproved.text()).toContain("Approved");
    expect(stepGranted.text()).toContain("Disbursed");
    expect(stepAcknowledged.text()).toContain("Signed");
  });

  it("switches between Signatures and Audit Trail tabs via BaseModalTabs and resets to Signatures when record changes", async () => {
    const wrapper = mount(PayoutDetailsModal, {
      props: {
        record: samplePayout,
        isAdmin: true,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseButton: true,
          BaseSignaturePad: true,
        },
      },
    });

    const sigTabBtn = wrapper.find('[data-testid="modal-tab-signatures"]');
    const auditTabBtn = wrapper.find('[data-testid="modal-tab-audit"]');
    expect(sigTabBtn.exists()).toBe(true);
    expect(auditTabBtn.exists()).toBe(true);
    expect(sigTabBtn.attributes("aria-selected")).toBe("true");
    expect(auditTabBtn.attributes("aria-selected")).toBe("false");
    expect(auditTabBtn.text()).toContain("Audit Trail");
    expect(auditTabBtn.text()).toContain("2");

    const sigPanel = wrapper.find('[data-testid="payout-tab-panel-signatures"]');
    const auditPanel = wrapper.find('[data-testid="payout-tab-panel-audit"]');
    expect(sigPanel.element.style.display).not.toBe("none");
    expect(auditPanel.element.style.display).toBe("none");

    // Switch to Audit Trail tab
    await auditTabBtn.trigger("click");
    expect(sigTabBtn.attributes("aria-selected")).toBe("false");
    expect(auditTabBtn.attributes("aria-selected")).toBe("true");
    expect(sigPanel.element.style.display).toBe("none");
    expect(auditPanel.element.style.display).not.toBe("none");

    // Notes and Summary remain visible when on Audit Trail tab
    expect(wrapper.find('[data-testid="modal-notes-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="modal-summary-section"]').exists()).toBe(true);

    // Changing record resets active tab to signatures
    await wrapper.setProps({
      record: { ...samplePayout, id: 99 },
    });
    expect(sigTabBtn.attributes("aria-selected")).toBe("true");
    expect(sigPanel.element.style.display).not.toBe("none");
    expect(auditPanel.element.style.display).toBe("none");
  });

  it("enforces unified vertical layout order (Roadmap -> Tabs -> Notes -> Summary) and handles Notes & Summary content", async () => {
    const wrapper = mount(PayoutDetailsModal, {
      props: {
        record: {
          ...samplePayout,
          notes: "Released via petty cash box #2",
        },
        isAdmin: true,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseButton: true,
          BaseSignaturePad: true,
          BaseAuditTrail: true,
        },
      },
    });

    const html = wrapper.html();
    const roadmapIdx = html.indexOf('data-testid="payout-roadmap-stepper"');
    const tabsIdx = html.indexOf('data-testid="modal-tab-signatures"');
    const notesIdx = html.indexOf('data-testid="modal-notes-section"');
    const summaryIdx = html.indexOf('data-testid="modal-summary-section"');

    expect(roadmapIdx).toBeGreaterThan(-1);
    expect(tabsIdx).toBeGreaterThan(roadmapIdx);
    expect(notesIdx).toBeGreaterThan(tabsIdx);
    expect(summaryIdx).toBeGreaterThan(notesIdx);

    const notesSection = wrapper.find('[data-testid="modal-notes-section"]');
    expect(notesSection.text()).toContain("Released via petty cash box #2");

    const summarySection = wrapper.find('[data-testid="modal-summary-section"]');
    expect(summarySection.text()).toContain("Oct 20, 2026");
    expect(summarySection.text()).toContain("Oct 21, 2026");
    expect(summarySection.text()).toContain("Oct 22, 2026");
    expect(summarySection.text()).toContain("Cash");
    expect(summarySection.text()).toContain("Approver Dan");
    expect(summarySection.text()).toContain("Cashier Jane");
    expect(summarySection.text()).toContain("1,500.00");

    // Empty notes fallback
    await wrapper.setProps({
      record: {
        ...samplePayout,
        notes: "",
        adminNotes: "",
        description: "",
      },
    });
    expect(notesSection.text()).toContain("No notes provided");
  });

  describe("header Must Sign and 3-day signing countdown / penalty badges", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-26T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const mountModal = (record, isAdmin = false) =>
      mount(PayoutDetailsModal, {
        props: { record, isAdmin },
        global: {
          stubs: {
            StatusBadge: { template: '<span data-testid="status-badge-stub" />' },
            BaseButton: true,
            BaseSignaturePad: true,
            BaseAuditTrail: true,
          },
        },
      });

    it("renders Must Sign then DaysLeftBadge before StatusBadge for unacknowledged employee cash_advance across 3-day thresholds and PENALTY", async () => {
      const caBase = {
        ...samplePayout,
        id: 50,
        type: "cash_advance",
        typeLabel: "Cash Advance",
        acknowledged: false,
        acknowledgementStatus: "awaiting-acknowledgement",
        grantedDate: "2026-11-26T00:00:00Z", // Day 0 -> 3 days left (green)
      };

      const wrapper = mountModal(caBase, false);

      const mustSign = wrapper.find('[data-testid="payout-must-sign-badge"]');
      const daysLeft = wrapper.findComponent(DaysLeftBadge);
      expect(mustSign.exists()).toBe(true);
      expect(mustSign.text()).toContain("Must Sign");
      expect(daysLeft.exists()).toBe(true);
      expect(daysLeft.text()).toContain("3 days left");
      expect(daysLeft.classes()).toContain("bg-emerald-50");

      // Verify DOM order: Must Sign -> DaysLeftBadge -> StatusBadge
      const html = wrapper.html();
      const mustSignIdx = html.indexOf('data-testid="payout-must-sign-badge"');
      const daysLeftIdx = html.indexOf('data-testid="days-left-badge"');
      const statusIdx = html.indexOf('data-testid="status-badge-stub"');
      expect(daysLeftIdx).toBeGreaterThan(mustSignIdx);
      expect(statusIdx).toBeGreaterThan(daysLeftIdx);

      // Day 1 -> 2 days left (yellow/amber)
      await wrapper.setProps({ record: { ...caBase, grantedDate: "2026-11-25T00:00:00Z" } });
      expect(wrapper.findComponent(DaysLeftBadge).text()).toContain("2 days left");
      expect(wrapper.findComponent(DaysLeftBadge).classes()).toContain("bg-amber-50");

      // Day 2 -> 1 day left (red)
      await wrapper.setProps({ record: { ...caBase, grantedDate: "2026-11-24T00:00:00Z" } });
      expect(wrapper.findComponent(DaysLeftBadge).text()).toContain("1 day left");
      expect(wrapper.findComponent(DaysLeftBadge).classes()).toContain("bg-red-50");

      // Day 3 -> Due today (red)
      await wrapper.setProps({ record: { ...caBase, grantedDate: "2026-11-23T00:00:00Z" } });
      expect(wrapper.findComponent(DaysLeftBadge).text()).toContain("Due today");
      expect(wrapper.findComponent(DaysLeftBadge).classes()).toContain("bg-red-50");

      // Day 4+ -> PENALTY (red)
      await wrapper.setProps({ record: { ...caBase, grantedDate: "2026-11-21T00:00:00Z" } });
      expect(wrapper.findComponent(DaysLeftBadge).text()).toBe("PENALTY");
      expect(wrapper.findComponent(DaysLeftBadge).classes()).toContain("bg-red-50");
    });

    it("renders Must Sign only (without countdown or PENALTY) for unacknowledged employee reimbursement", () => {
      const wrapper = mountModal(
        {
          ...samplePayout,
          type: "reimbursement",
          acknowledged: false,
          grantedDate: "2026-11-01T00:00:00Z", // well over 3 days ago
        },
        false,
      );

      expect(wrapper.find('[data-testid="payout-must-sign-badge"]').exists()).toBe(true);
      expect(wrapper.findComponent(DaysLeftBadge).exists()).toBe(false);
    });

    it("renders countdown/PENALTY without Must Sign for admin on unacknowledged cash_advance, and neither on reimbursement", () => {
      const adminCa = mountModal(
        {
          ...samplePayout,
          type: "cash_advance",
          acknowledged: false,
          grantedDate: "2026-11-21T00:00:00Z",
        },
        true,
      );

      expect(adminCa.find('[data-testid="payout-must-sign-badge"]').exists()).toBe(false);
      expect(adminCa.findComponent(DaysLeftBadge).exists()).toBe(true);
      expect(adminCa.findComponent(DaysLeftBadge).text()).toBe("PENALTY");

      const adminReimb = mountModal(
        {
          ...samplePayout,
          type: "reimbursement",
          acknowledged: false,
          grantedDate: "2026-11-21T00:00:00Z",
        },
        true,
      );

      expect(adminReimb.find('[data-testid="payout-must-sign-badge"]').exists()).toBe(false);
      expect(adminReimb.findComponent(DaysLeftBadge).exists()).toBe(false);
    });

    it("hides Must Sign and countdown/PENALTY once acknowledged, and omits countdown if grantedDate is missing", () => {
      const ackCa = mountModal(
        {
          ...samplePayout,
          type: "cash_advance",
          acknowledged: true,
          grantedDate: "2026-11-21T00:00:00Z",
        },
        false,
      );
      expect(ackCa.find('[data-testid="payout-must-sign-badge"]').exists()).toBe(false);
      expect(ackCa.findComponent(DaysLeftBadge).exists()).toBe(false);

      const missingDateCa = mountModal(
        {
          ...samplePayout,
          type: "cash_advance",
          acknowledged: false,
          grantedDate: null,
        },
        false,
      );
      expect(missingDateCa.find('[data-testid="payout-must-sign-badge"]').exists()).toBe(true);
      expect(missingDateCa.findComponent(DaysLeftBadge).exists()).toBe(false);
    });
  });
});
