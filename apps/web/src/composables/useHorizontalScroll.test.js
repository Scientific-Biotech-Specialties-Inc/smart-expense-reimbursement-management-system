// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useHorizontalScroll } from "./useHorizontalScroll";

describe("useHorizontalScroll", () => {
  it("initializes scroll state and detects overflow correctly", async () => {
    const TestComponent = defineComponent({
      setup() {
        const containerRef = ref(null);
        const { canScrollLeft, canScrollRight, isOverflowing, updateScrollState, scrollToActive } =
          useHorizontalScroll(containerRef);
        return { containerRef, canScrollLeft, canScrollRight, isOverflowing, updateScrollState, scrollToActive };
      },
      template: `
        <div ref="containerRef" style="width: 200px; overflow-x: auto;">
          <div id="item1" style="width: 150px;">Item 1</div>
          <div id="item2" aria-current="step" style="width: 150px;">Item 2</div>
        </div>
      `,
    });

    const wrapper = mount(TestComponent);
    const container = wrapper.find({ ref: "containerRef" }).element;

    // Simulate overflow
    Object.defineProperty(container, "clientWidth", { value: 200, configurable: true });
    Object.defineProperty(container, "scrollWidth", { value: 300, configurable: true });
    Object.defineProperty(container, "scrollLeft", { value: 0, writable: true, configurable: true });

    wrapper.vm.updateScrollState();

    expect(wrapper.vm.isOverflowing).toBe(true);
    expect(wrapper.vm.canScrollLeft).toBe(false);
    expect(wrapper.vm.canScrollRight).toBe(true);

    // Simulate scrolled to middle
    container.scrollLeft = 50;
    wrapper.vm.updateScrollState();
    expect(wrapper.vm.canScrollLeft).toBe(true);
    expect(wrapper.vm.canScrollRight).toBe(true);

    // Simulate scrolled to end
    container.scrollLeft = 100;
    wrapper.vm.updateScrollState();
    expect(wrapper.vm.canScrollLeft).toBe(true);
    expect(wrapper.vm.canScrollRight).toBe(false);
  });

  it("calls scrollIntoView or scrollTo on active element when scrollToActive is called", async () => {
    const scrollIntoViewMock = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        const containerRef = ref(null);
        const { scrollToActive } = useHorizontalScroll(containerRef);
        return { containerRef, scrollToActive };
      },
      template: `
        <div ref="containerRef">
          <div id="step-1">Step 1</div>
          <button id="step-2" aria-current="step">Step 2</button>
        </div>
      `,
    });

    const wrapper = mount(TestComponent);
    const activeEl = wrapper.find('[aria-current="step"]').element;
    activeEl.scrollIntoView = scrollIntoViewMock;

    wrapper.vm.scrollToActive();
    await wrapper.vm.$nextTick();

    expect(scrollIntoViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: "smooth",
        inline: "center",
      })
    );
  });
});

