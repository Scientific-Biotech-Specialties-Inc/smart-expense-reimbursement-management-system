// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseModalTabs from "./BaseModalTabs.vue";

const sampleTabs = [
  { key: "receipts", label: "Receipts", count: 3 },
  { key: "report", label: "Report Attachment" },
  { key: "audit", label: "Audit Trail", count: 0 },
  { key: "notes", label: "Notes", count: null },
];

describe("BaseModalTabs", () => {
  it("renders accessible tablist container and tab buttons with data-testid and aria-selected", () => {
    const wrapper = mount(BaseModalTabs, {
      props: {
        tabs: sampleTabs,
        modelValue: "receipts",
      },
    });

    const tablist = wrapper.find('[role="tablist"]');
    expect(tablist.exists()).toBe(true);
    expect(tablist.attributes("aria-label")).toBe("Modal sections");

    const receiptsTab = wrapper.find('[data-testid="modal-tab-receipts"]');
    const reportTab = wrapper.find('[data-testid="modal-tab-report"]');

    expect(receiptsTab.exists()).toBe(true);
    expect(receiptsTab.attributes("type")).toBe("button");
    expect(receiptsTab.attributes("role")).toBe("tab");
    expect(receiptsTab.attributes("aria-selected")).toBe("true");
    expect(receiptsTab.classes()).toContain("bg-white");
    expect(receiptsTab.classes()).toContain("text-primary");
    expect(receiptsTab.classes()).toContain("font-semibold");

    expect(reportTab.attributes("aria-selected")).toBe("false");
    expect(reportTab.classes()).toContain("text-slate-600");
    expect(reportTab.classes()).toContain("font-medium");
  });

  it("renders count pills for numeric counts including zero and omits undefined or null counts", () => {
    const wrapper = mount(BaseModalTabs, {
      props: {
        tabs: sampleTabs,
        modelValue: "receipts",
      },
    });

    expect(wrapper.find('[data-testid="modal-tab-receipts"]').findAll("span")).toHaveLength(2);
    expect(wrapper.find('[data-testid="modal-tab-receipts"]').text()).toContain("Receipts");
    expect(wrapper.find('[data-testid="modal-tab-receipts"]').text()).toContain("3");

    expect(wrapper.find('[data-testid="modal-tab-audit"]').findAll("span")).toHaveLength(2);
    expect(wrapper.find('[data-testid="modal-tab-audit"]').text()).toContain("0");

    expect(wrapper.find('[data-testid="modal-tab-report"]').findAll("span")).toHaveLength(1);
    expect(wrapper.find('[data-testid="modal-tab-notes"]').findAll("span")).toHaveLength(1);
  });

  it("emits update:modelValue with tab key when clicked and updates active state when modelValue changes", async () => {
    const wrapper = mount(BaseModalTabs, {
      props: {
        tabs: sampleTabs,
        modelValue: "receipts",
      },
    });

    const auditTab = wrapper.find('[data-testid="modal-tab-audit"]');
    await auditTab.trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["audit"]]);

    await wrapper.setProps({ modelValue: "audit" });
    expect(auditTab.attributes("aria-selected")).toBe("true");
    expect(auditTab.classes()).toContain("bg-white");
    expect(wrapper.find('[data-testid="modal-tab-receipts"]').attributes("aria-selected")).toBe(
      "false"
    );
  });
});
