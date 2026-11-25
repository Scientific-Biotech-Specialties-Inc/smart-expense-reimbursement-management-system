// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import GrantPayoutModal from "./GrantPayoutModal.vue";

describe("GrantPayoutModal (G2-043 to G2-046)", () => {
  const sampleApprovedRecord = {
    id: 42,
    amount: "4500.00",
    currency: "PHP",
    description: "Regional Conference Expenses",
    date: "2026-10-01",
    approved_at: "2026-10-05T10:00:00Z",
    approved_by: "Approver Jane",
    status: "approved",
  };

  it("auto-fills read-only request date, approval date, grant date, amount, and approver (G2-044, G2-045)", () => {
    const wrapper = mount(GrantPayoutModal, {
      props: {
        isOpen: true,
        record: sampleApprovedRecord,
        defaultGrantedBy: "Admin John",
      },
    });

    const text = wrapper.text();
    expect(text).toContain("4,500.00");
    expect(text).toContain("Approver Jane");
    expect(text).toContain("Oct 1, 2026");
    expect(text).toContain("Oct 5, 2026");
  });

  it("requires Granted by, Payout Method, conditional Other specification, and signature before proceeding (G2-045, G2-046)", async () => {
    const wrapper = mount(GrantPayoutModal, {
      props: {
        isOpen: true,
        record: sampleApprovedRecord,
        defaultGrantedBy: "Admin John",
      },
    });

    const submitBtn = wrapper.find('[data-testid="submit-payout-btn"]');
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Select Payout Method = Other
    const methodSelect = wrapper.find("select#payout-method-select");
    await methodSelect.setValue("Other");

    // Other specification input appears
    const otherInput = wrapper.find("input#payout-method-other-input");
    expect(otherInput.exists()).toBe(true);
    await otherInput.setValue("Direct Bank Wire");

    // Provide signature
    const sigPad = wrapper.findComponent({ name: "BaseSignaturePad" });
    expect(sigPad.props("required")).toBe(true);
    await sigPad.vm.$emit("update:modelValue", "data:image/png;base64,granterSig");

    expect(submitBtn.attributes("disabled")).toBeUndefined();
  });

  it("shows handover confirmation question and password prompt on submit (G2-046 Task 3)", async () => {
    const wrapper = mount(GrantPayoutModal, {
      props: {
        isOpen: true,
        record: sampleApprovedRecord,
        defaultGrantedBy: "Admin John",
      },
    });

    // Fill form
    await wrapper.find("select#payout-method-select").setValue("Cash");
    await wrapper.findComponent({ name: "BaseSignaturePad" }).vm.$emit("update:modelValue", "data:image/png;base64,granterSig");
    await nextTick();

    const submitBtn = wrapper.find('[data-testid="submit-payout-btn"]');
    expect(submitBtn.attributes("disabled")).toBeUndefined();
    await submitBtn.trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Has the money been handed to the employee?");

    const passwordInput = wrapper.find('input[type="password"]');
    expect(passwordInput.exists()).toBe(true);
    await passwordInput.setValue("secret123");

    const proceedBtn = wrapper.find('[data-testid="final-grant-proceed-btn"]');
    await proceedBtn.trigger("click");

    const emitted = wrapper.emitted("confirm");
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toMatchObject({
      granted_by: "Admin John",
      payout_method: "Cash",
      granter_signature: "data:image/png;base64,granterSig",
      password: "secret123",
    });
  });

  it("renders default Reimbursement labels when optional label props are omitted", async () => {
    const wrapper = mount(GrantPayoutModal, {
      props: {
        isOpen: true,
        record: sampleApprovedRecord,
        defaultGrantedBy: "Admin John",
      },
    });

    expect(wrapper.text()).toContain("Grant Reimbursement Payout");
    expect(wrapper.find('[data-testid="submit-payout-btn"]').text()).toBe("Submit Payout");

    await wrapper.findComponent({ name: "BaseSignaturePad" }).vm.$emit("update:modelValue", "data:image/png;base64,sig");
    await nextTick();
    await wrapper.find('[data-testid="submit-payout-btn"]').trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Confirm Payout Handover");
    expect(wrapper.find('[data-testid="final-grant-proceed-btn"]').text()).toBe("Confirm & Grant");
  });

  it("supports custom Cash Advance title/button props and Cash Advance record date/approver shapes", async () => {
    const cashAdvanceRecord = {
      id: 77,
      amount: "12500.00",
      currency: "PHP",
      requested: "2026-10-10",
      approvedAt: "2026-10-12T14:30:00Z",
      approvedBy: "Manager Maria",
      status: "approved",
    };

    const wrapper = mount(GrantPayoutModal, {
      props: {
        isOpen: true,
        record: cashAdvanceRecord,
        defaultGrantedBy: "Finance Admin",
        title: "Disburse Cash Advance",
        confirmTitle: "Confirm Cash Advance Handover",
        submitLabel: "Submit Disbursement",
        confirmLabel: "Confirm & Disburse",
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Disburse Cash Advance");
    expect(text).toContain("12,500.00");
    expect(text).toContain("Oct 10, 2026");
    expect(text).toContain("Oct 12, 2026");
    expect(text).toContain("Manager Maria");
    expect(wrapper.find('[data-testid="submit-payout-btn"]').text()).toBe("Submit Disbursement");

    await wrapper.findComponent({ name: "BaseSignaturePad" }).vm.$emit("update:modelValue", "data:image/png;base64,caSig");
    await nextTick();
    await wrapper.find('[data-testid="submit-payout-btn"]').trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Confirm Cash Advance Handover");
    expect(wrapper.find('[data-testid="final-grant-proceed-btn"]').text()).toBe("Confirm & Disburse");
  });

  it("falls back to nested payout approved_at and approved_by when top-level approval fields are absent", () => {
    const wrapper = mount(GrantPayoutModal, {
      props: {
        isOpen: true,
        record: {
          id: 88,
          amount: "3000.00",
          created_at: "2026-11-01T08:00:00Z",
          payout: {
            approved_at: "2026-11-03T11:00:00Z",
            approved_by: "Nested Approver",
          },
        },
        defaultGrantedBy: "Cashier",
      },
    });

    const text = wrapper.text();
    expect(text).toContain("Nov 1, 2026");
    expect(text).toContain("Nov 3, 2026");
    expect(text).toContain("Nested Approver");
  });
});
