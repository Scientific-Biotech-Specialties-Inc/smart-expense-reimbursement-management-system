// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

describe("ImagePreviewModal calculations & state logic", () => {
  function clampZoom(val, min = 0.5, max = 4.0) {
    return Math.min(Math.max(val, min), max);
  }

  function calculateZoomPercentage(zoom) {
    return `${Math.round(zoom * 100)}%`;
  }

  function stepZoom(current, step, direction, min = 0.5, max = 4.0) {
    const next = direction === "in" ? current + step : current - step;
    return clampZoom(+next.toFixed(2), min, max);
  }

  it("calculates zoom percentage correctly for default and fractional values", () => {
    expect(calculateZoomPercentage(1.0)).toBe("100%");
    expect(calculateZoomPercentage(0.5)).toBe("50%");
    expect(calculateZoomPercentage(1.25)).toBe("125%");
    expect(calculateZoomPercentage(2.5)).toBe("250%");
    expect(calculateZoomPercentage(4.0)).toBe("400%");
  });

  it("steps zoom in by step and clamps at maxZoom", () => {
    let current = 1.0;
    current = stepZoom(current, 0.25, "in");
    expect(current).toBe(1.25);

    current = stepZoom(3.9, 0.25, "in", 0.5, 4.0);
    expect(current).toBe(4.0);
  });

  it("steps zoom out by step and clamps at minZoom", () => {
    let current = 1.0;
    current = stepZoom(current, 0.25, "out");
    expect(current).toBe(0.75);

    current = stepZoom(0.6, 0.25, "out", 0.5, 4.0);
    expect(current).toBe(0.5);
  });

  it("computes 90-degree rotations cleanly", () => {
    let rotation = 0;
    rotation = (rotation + 90) % 360;
    expect(rotation).toBe(90);
    rotation = (rotation + 90) % 360;
    expect(rotation).toBe(180);
    rotation = (rotation + 90) % 360;
    expect(rotation).toBe(270);
    rotation = (rotation + 90) % 360;
    expect(rotation).toBe(0);
  });

  it("toggles zoom to 200% on single click from default 100% and resets on subsequent click", () => {
    let currentZoom = 1.0;
    function toggleZoom(zoom, hasMoved = false) {
      if (hasMoved) return zoom;
      return zoom <= 1.05 ? 2.0 : 1.0;
    }

    currentZoom = toggleZoom(currentZoom, false);
    expect(currentZoom).toBe(2.0);
    expect(calculateZoomPercentage(currentZoom)).toBe("200%");

    // If dragging/moving happened, zoom level should not toggle
    currentZoom = toggleZoom(currentZoom, true);
    expect(currentZoom).toBe(2.0);

    // Clean click while zoomed in resets back to 100%
    currentZoom = toggleZoom(currentZoom, false);
    expect(currentZoom).toBe(1.0);
    expect(calculateZoomPercentage(currentZoom)).toBe("100%");
  });

  it("calculates pan offsets to keep cursor target locked when zooming to 200%", () => {
    function computeZoomPan({
      oldZoom,
      newZoom,
      pan,
      clientX,
      clientY,
      viewportCenterX,
      viewportCenterY,
    }) {
      const scaleFactor = newZoom / oldZoom;
      return {
        x: pan.x - (clientX - (viewportCenterX + pan.x)) * (scaleFactor - 1),
        y: pan.y - (clientY - (viewportCenterY + pan.y)) * (scaleFactor - 1),
      };
    }

    // Viewport center at (500, 400). Initial pan at (0, 0).
    // User clicks at (700, 400) which is +200px to the right.
    const newPan = computeZoomPan({
      oldZoom: 1.0,
      newZoom: 2.0,
      pan: { x: 0, y: 0 },
      clientX: 700,
      clientY: 400,
      viewportCenterX: 500,
      viewportCenterY: 400,
    });

    // Pan shifts by -200px to keep (700, 400) under the cursor
    expect(newPan.x).toBe(-200);
    expect(newPan.y).toBe(0);

    // Verify screen coordinate of the clicked local point (+200):
    // Screen X = viewportCenterX + pan.x + (localX * newZoom) = 500 - 200 + (200 * 2) = 700
    const screenX = 500 + newPan.x + (200 * 2.0);
    expect(screenX).toBe(700);
  });
});

import { mount } from "@vue/test-utils";
import ImagePreviewModal from "./ImagePreviewModal.vue";

describe("ImagePreviewModal Multi-Image Carousel", () => {
  const images = [
    "https://example.com/part1.jpg",
    "https://example.com/part2.jpg",
    "https://example.com/part3.jpg",
  ];

  it("renders part counter and navigation chevrons when multiple images are passed", () => {
    const wrapper = mount(ImagePreviewModal, {
      props: {
        modelValue: true,
        images,
        initialIndex: 0,
      },
      attachTo: document.body,
    });

    expect(document.body.textContent).toContain("Part 1 of 3");
    const prevBtn = document.body.querySelector("[data-testid='preview-prev-btn']");
    const nextBtn = document.body.querySelector("[data-testid='preview-next-btn']");
    expect(prevBtn).not.toBeNull();
    expect(nextBtn).not.toBeNull();
    wrapper.unmount();
  });

  it("navigates to next and previous images on button click", async () => {
    const wrapper = mount(ImagePreviewModal, {
      props: {
        modelValue: true,
        images,
        initialIndex: 0,
      },
      attachTo: document.body,
    });

    const nextBtn = document.body.querySelector("[data-testid='preview-next-btn']");
    nextBtn.click();
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain("Part 2 of 3");
    const img = document.body.querySelector("img");
    expect(img.getAttribute("src")).toBe(images[1]);

    const prevBtn = document.body.querySelector("[data-testid='preview-prev-btn']");
    prevBtn.click();
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain("Part 1 of 3");
    expect(img.getAttribute("src")).toBe(images[0]);
    wrapper.unmount();
  });
});

