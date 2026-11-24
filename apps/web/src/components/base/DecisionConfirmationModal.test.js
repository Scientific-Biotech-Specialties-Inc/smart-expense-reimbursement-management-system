// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DecisionConfirmationModal from "./DecisionConfirmationModal.vue";

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: { email: "approver@example.com" } }),
}));

describe("DecisionConfirmationModal", () => {
  const stubs = {
    BaseModal: { template: "<div><slot /></div>" },
  };

  it("renders plain confirmation step without yellow/amber background on reject", async () => {
    setActivePinia(createPinia());
    const wrapper = mount(DecisionConfirmationModal, {
      props: {
        isOpen: true,
        mode: "reject",
        comment: "Receipt amount does not match invoice",
        password: "",
      },
      global: { stubs },
    });

    const nextBtn = wrapper.findAll("button").find((b) => b.text().includes("Confirm Reject"));
    await nextBtn.trigger("click");

    expect(wrapper.text()).toContain("Confirm Rejection");
    expect(wrapper.text()).toContain("Rejection Reason");
    expect(wrapper.text()).toContain("Receipt amount does not match invoice");
    expect(wrapper.html()).not.toContain("bg-amber-50");
    expect(wrapper.html()).not.toContain("border-amber-200");

    const backBtn = wrapper.findAll("button").find((b) => b.text().includes("Back"));
    expect(backBtn).toBeDefined();

    await wrapper.setProps({ password: "secret" });
    const proceedBtn = wrapper.findAll("button").find((b) => b.text().includes("Proceed"));
    await proceedBtn.trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it("renders plain confirmation layout for approve mode", async () => {
    setActivePinia(createPinia());
    const wrapper = mount(DecisionConfirmationModal, {
      props: {
        isOpen: true,
        mode: "approve",
        password: "secret",
      },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Approve Request");
    expect(wrapper.html()).not.toContain("bg-amber-50");
    const cancelBtn = wrapper.findAll("button").find((b) => b.text().includes("Cancel"));
    expect(cancelBtn).toBeDefined();

    const proceedBtn = wrapper.findAll("button").find((b) => b.text().includes("Proceed"));
    await proceedBtn.trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it.each([
    ["reject", "bg-red-50/80"],
    ["revise", "bg-yellow-50/80"],
    ["approve", "bg-emerald-50/80"],
    ["grant", "bg-emerald-50/80"],
    ["disburse", "bg-slate-50/80"],
  ])("applies %s header background class for %s mode", (mode, expectedBgClass) => {
    setActivePinia(createPinia());
    const wrapper = mount(DecisionConfirmationModal, {
      props: {
        isOpen: true,
        mode,
      },
      global: { stubs },
    });

    const header = wrapper.find(".border-b.border-slate-200");
    expect(header.classes()).toContain(expectedBgClass);
  });

  it("keeps reject icon and title while closing even if parent resets mode to revise", async () => {
    setActivePinia(createPinia());
    const wrapper = mount(DecisionConfirmationModal, {
      props: {
        isOpen: true,
        mode: "reject",
      },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Reject Request");

    await wrapper.setProps({ isOpen: false, mode: "revise" });
    expect(wrapper.text()).toContain("Reject Request");
    expect(wrapper.text()).not.toContain("Request Revision");
  });
});
