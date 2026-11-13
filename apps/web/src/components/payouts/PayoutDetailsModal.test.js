// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
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
});
