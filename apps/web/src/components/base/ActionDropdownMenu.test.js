// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ActionDropdownMenu from "./ActionDropdownMenu.vue";

describe("ActionDropdownMenu", () => {
  const actions = [
    {
      label: "View",
      visible: true,
      handler: vi.fn(),
    },
  ];

  it("does not render the red pending indicator by default", () => {
    const wrapper = mount(ActionDropdownMenu, {
      props: { actions },
    });

    const button = wrapper.find('button[title="Actions"]');
    expect(button.exists()).toBe(true);
    expect(button.attributes("aria-label")).toBe("Actions");
    expect(wrapper.find('[data-testid="action-pending-indicator"]').exists()).toBe(false);
  });

  it("renders a top-right red circle indicator with a custom required-action tooltip", () => {
    const wrapper = mount(ActionDropdownMenu, {
      props: {
        actions,
        showIndicator: true,
        indicatorLabel: "Grant payout",
      },
    });

    const button = wrapper.find('button[title="Actions"]');
    expect(button.exists()).toBe(true);
    expect(button.classes()).toContain("relative");
    expect(button.attributes("aria-label")).toBe("Actions — Grant payout");

    const dot = wrapper.find('[data-testid="action-pending-indicator"]');
    expect(dot.exists()).toBe(true);
    expect(dot.classes()).toContain("bg-red-500");
    expect(dot.classes()).toContain("rounded-full");
    expect(dot.classes()).toContain("-top-1");
    expect(dot.classes()).toContain("-right-1");
    expect(dot.attributes("title")).toBe("Grant payout");
    expect(button.text()).toContain("Grant payout");
  });
});
