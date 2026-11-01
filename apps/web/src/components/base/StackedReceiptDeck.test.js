// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StackedReceiptDeck from "./StackedReceiptDeck.vue";

describe("StackedReceiptDeck", () => {
  const sampleImages = [
    "https://example.com/segment1.jpg",
    "https://example.com/segment2.jpg",
    "https://example.com/segment3.jpg",
  ];

  it("renders all images in the stack with part indicator badges", () => {
    const wrapper = mount(StackedReceiptDeck, {
      props: {
        images: sampleImages,
      },
    });

    const cards = wrapper.findAll("[data-testid='stacked-receipt-card']");
    expect(cards).toHaveLength(3);

    expect(wrapper.text()).toContain("Part 1");
    expect(wrapper.text()).toContain("Part 2");
    expect(wrapper.text()).toContain("Part 3");
  });

  it("sets the first card active by default and emits select-card when clicking another card", async () => {
    const wrapper = mount(StackedReceiptDeck, {
      props: {
        images: sampleImages,
      },
    });

    const cards = wrapper.findAll("[data-testid='stacked-receipt-card']");
    // Click second card (index 1)
    await cards[1].trigger("click");

    expect(wrapper.emitted("select-card")).toBeTruthy();
    expect(wrapper.emitted("select-card")[0]).toEqual([1]);
  });

  it("emits click-active when active card is clicked for full preview zoom", async () => {
    const wrapper = mount(StackedReceiptDeck, {
      props: {
        images: sampleImages,
      },
    });

    const cards = wrapper.findAll("[data-testid='stacked-receipt-card']");
    // Click active card (index 0)
    await cards[0].trigger("click");

    expect(wrapper.emitted("click-active")).toBeTruthy();
    expect(wrapper.emitted("click-active")[0][0]).toEqual({
      index: 0,
      image: sampleImages[0],
    });
  });

  it("includes hover animation classes on cards for tactile lift", () => {
    const wrapper = mount(StackedReceiptDeck, {
      props: {
        images: sampleImages,
      },
    });

    const firstCard = wrapper.find("[data-testid='stacked-receipt-card']");
    expect(firstCard.classes().some((c) => c.includes("hover:-translate-y-"))).toBe(true);
    expect(firstCard.classes().some((c) => c.includes("transition-"))).toBe(true);
  });

  it("handles image objects with url property", () => {
    const objectImages = [
      { url: "https://example.com/part1.png", name: "Top Part" },
      { url: "https://example.com/part2.png", name: "Bottom Part" },
    ];

    const wrapper = mount(StackedReceiptDeck, {
      props: {
        images: objectImages,
      },
    });

    const cards = wrapper.findAll("[data-testid='stacked-receipt-card']");
    expect(cards).toHaveLength(2);
    expect(wrapper.find("img").attributes("src")).toBe("https://example.com/part1.png");
  });
});
