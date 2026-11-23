// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import PayoutDetailsModal from "./PayoutDetailsModal.vue";

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
    expect(wrapper.text()).toContain("Payout Details");
    expect(wrapper.text()).toContain("Ref #25");
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

    const ackBtn = wrapper.find('[data-testid="acknowledge-payout-btn"]');
    expect(ackBtn.exists()).toBe(true);
    expect(ackBtn.attributes("disabled")).toBeDefined();

    await sigPad.vm.$emit("update:modelValue", "data:image/png;base64,empCaSig");
    await nextTick();
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
});
