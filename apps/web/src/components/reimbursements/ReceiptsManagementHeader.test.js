// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReceiptsManagementHeader from "./ReceiptsManagementHeader.vue";

describe("ReceiptsManagementHeader", () => {
  it("gives the card section an elevated stacking context above subsequent cards", () => {
    const wrapper = mount(ReceiptsManagementHeader, {
      props: { receiptCount: 1 },
    });

    const card = wrapper.find("section.card");
    expect(card.exists()).toBe(true);
    expect(card.classes()).toContain("relative");
    expect(card.classes()).toContain("z-30");
  });

  it("opens the dropdown menu on top and emits single/multi receipt events", async () => {
    const wrapper = mount(ReceiptsManagementHeader, {
      props: { receiptCount: 2 },
    });

    const toggleBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Add More Receipts"));
    expect(toggleBtn).toBeTruthy();

    await toggleBtn.trigger("click");

    const menu = wrapper.find("div.absolute.z-30");
    expect(menu.exists()).toBe(true);

    const buttons = menu.findAll("button");
    expect(buttons.map((b) => b.text())).toEqual([
      "Single Receipt",
      "Multi Receipt",
    ]);

    await buttons[0].trigger("click");
    expect(wrapper.emitted("add-receipts")).toHaveLength(1);

    await toggleBtn.trigger("click");
    const menuReopened = wrapper.find("div.absolute.z-30");
    await menuReopened.findAll("button")[1].trigger("click");
    expect(wrapper.emitted("open-segmented-upload")).toHaveLength(1);
  });
});
