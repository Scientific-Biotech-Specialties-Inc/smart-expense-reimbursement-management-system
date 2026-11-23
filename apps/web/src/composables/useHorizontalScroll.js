import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";

/**
 * useHorizontalScroll
 *
 * Provides reactive scroll state (canScrollLeft, canScrollRight, isOverflowing)
 * and an auto-centering helper for horizontally scrollable containers (e.g. steppers).
 *
 * @param {import("vue").Ref<HTMLElement | null>} containerRef
 * @param {Object} [options]
 * @param {string} [options.activeSelector='[aria-current="step"]']
 * @param {boolean} [options.autoScrollOnMount=true]
 */
export function useHorizontalScroll(containerRef, options = {}) {
  const {
    activeSelector = '[aria-current="step"]',
    autoScrollOnMount = true,
  } = options;

  const canScrollLeft = ref(false);
  const canScrollRight = ref(false);
  const isOverflowing = ref(false);

  function updateScrollState() {
    const el = containerRef.value;
    if (!el) {
      canScrollLeft.value = false;
      canScrollRight.value = false;
      isOverflowing.value = false;
      return;
    }

    const scrollLeft = el.scrollLeft;
    const scrollWidth = el.scrollWidth;
    const clientWidth = el.clientWidth;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);

    isOverflowing.value = maxScroll > 1;
    canScrollLeft.value = scrollLeft > 2;
    canScrollRight.value = scrollLeft < maxScroll - 2;
  }

  function scrollToActive(selector = activeSelector) {
    nextTick(() => {
      const container = containerRef.value;
      if (!container) return;

      const activeEl = container.querySelector(selector);
      if (!activeEl) return;

      try {
        if (typeof activeEl.scrollIntoView === "function") {
          activeEl.scrollIntoView({
            behavior: "smooth",
            inline: "center",
            block: "nearest",
          });
          return;
        }
      } catch {
        // Fall back to direct offset math if scrollIntoView throws or options unsupported
      }

      try {
        const containerWidth = container.clientWidth || 0;
        const targetOffset = activeEl.offsetLeft || 0;
        const targetWidth = activeEl.clientWidth || 0;
        const targetLeft = Math.max(
          0,
          targetOffset - containerWidth / 2 + targetWidth / 2,
        );

        if (typeof container.scrollTo === "function") {
          container.scrollTo({ left: targetLeft, behavior: "smooth" });
        } else {
          container.scrollLeft = targetLeft;
        }
      } catch {
        // No-op for test/SSR environments
      }
    });
  }

  let resizeObserver = null;

  function onScroll() {
    updateScrollState();
  }

  onMounted(() => {
    const el = containerRef.value;
    if (el) {
      el.addEventListener("scroll", onScroll, { passive: true });

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          updateScrollState();
        });
        resizeObserver.observe(el);
      }
    }

    updateScrollState();
    if (autoScrollOnMount) {
      scrollToActive();
    }
  });

  onBeforeUnmount(() => {
    const el = containerRef.value;
    if (el) {
      el.removeEventListener("scroll", onScroll);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  });

  return {
    canScrollLeft,
    canScrollRight,
    isOverflowing,
    updateScrollState,
    scrollToActive,
  };
}

