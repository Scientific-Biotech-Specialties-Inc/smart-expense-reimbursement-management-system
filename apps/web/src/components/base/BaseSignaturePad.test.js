// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import BaseSignaturePad from "./BaseSignaturePad.vue";

describe("BaseSignaturePad", () => {
  it("renders canvas and placeholder, emits data URL on draw, and clears when Clear is clicked", async () => {
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        placeholder: "Sign inside box",
        allowProfileSignature: false,
      },
    });

    expect(wrapper.text()).toContain("Sign inside box");
    const canvas = wrapper.find("canvas");
    expect(canvas.exists()).toBe(true);

    const ctxMock = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    };
    canvas.element.getContext = vi.fn(() => ctxMock);
    canvas.element.toDataURL = vi.fn(() => "data:image/png;base64,mockSig");

    await canvas.trigger("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 });
    await canvas.trigger("pointermove", { clientX: 25, clientY: 25 });
    await canvas.trigger("pointerup");

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    expect(emitted[emitted.length - 1][0]).toBe("data:image/png;base64,mockSig");

    const clearBtn = wrapper.find('[data-testid="clear-signature-btn"]');
    await clearBtn.trigger("click");
    expect(wrapper.emitted("update:modelValue").slice(-1)[0][0]).toBe("");
  });

  it("auto-prefills saved signature on mount when allowProfileSignature is enabled", async () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        savedSignature: savedSig,
        allowProfileSignature: true,
      },
    });

    expect(wrapper.emitted("update:modelValue")).toBeTruthy();
    expect(wrapper.emitted("update:modelValue")[0][0]).toBe(savedSig);
  });

  it("displays helper badge when modelValue matches saved signature", async () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: savedSig,
        savedSignature: savedSig,
        allowProfileSignature: true,
      },
    });

    const indicator = wrapper.find('[data-testid="saved-signature-indicator"]');
    expect(indicator.exists()).toBe(true);
    expect(indicator.text()).toContain("Pre-filled from your profile signature");
  });

  it("shows 'Use Saved Signature' button when cleared and clicking it reloads the saved signature", async () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: savedSig,
        savedSignature: savedSig,
        allowProfileSignature: true,
      },
    });

    // Clear it
    const clearBtn = wrapper.find('[data-testid="clear-signature-btn"]');
    await clearBtn.trigger("click");
    await wrapper.setProps({ modelValue: "" });

    // "Use Saved Signature" should now be visible
    const useSavedBtn = wrapper.find('[data-testid="use-saved-signature-btn"]');
    expect(useSavedBtn.exists()).toBe(true);
    expect(useSavedBtn.text()).toContain("Use Saved Signature");

    // Click it
    await useSavedBtn.trigger("click");
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted.slice(-1)[0][0]).toBe(savedSig);
  });

  it("hides 'Use Saved Signature' when allowProfileSignature is false", () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        savedSignature: savedSig,
        allowProfileSignature: false,
      },
    });

    expect(wrapper.find('[data-testid="use-saved-signature-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="saved-signature-indicator"]').exists()).toBe(false);
  });

  it("clears pre-filled saved signature before drawing when user free-draws directly on canvas", async () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: savedSig,
        savedSignature: savedSig,
        allowProfileSignature: true,
      },
    });

    const canvas = wrapper.find("canvas");
    const ctxMock = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    };
    canvas.element.getContext = vi.fn(() => ctxMock);
    canvas.element.toDataURL = vi.fn(() => "data:image/png;base64,customDrawnSig");

    await canvas.trigger("pointerdown", { clientX: 12, clientY: 14, pointerId: 1 });
    expect(ctxMock.clearRect).toHaveBeenCalled();

    await canvas.trigger("pointermove", { clientX: 40, clientY: 30 });
    await canvas.trigger("pointerup");

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted.at(-1)[0]).toBe("data:image/png;base64,customDrawnSig");
  });

  it("auto-prefills when savedSignature arrives after mount if untouched", async () => {
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        savedSignature: "",
        allowProfileSignature: true,
      },
    });

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    await wrapper.setProps({ savedSignature: "data:image/png;base64,lateProfileSig" });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["data:image/png;base64,lateProfileSig"]);
  });

  it("does not re-render or clear canvas when modelValue echoes back from endStroke (multi-stroke free draw)", async () => {
    const originalImage = globalThis.Image;
    let imageConstructCount = 0;
    globalThis.Image = class MockImage {
      constructor() {
        imageConstructCount += 1;
        this.naturalWidth = 100;
        this.naturalHeight = 50;
      }
      set src(_val) {}
    };

    try {
      const wrapper = mount(BaseSignaturePad, {
        props: {
          modelValue: "",
          savedSignature: "",
          allowProfileSignature: false,
        },
      });

      const canvas = wrapper.find("canvas");
      const ctxMock = {
        scale: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      };
      canvas.element.getContext = vi.fn(() => ctxMock);
      let strokeIdx = 0;
      canvas.element.toDataURL = vi.fn(() => `data:image/png;base64,customStroke${++strokeIdx}`);

      // Stroke 1
      await canvas.trigger("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 });
      await canvas.trigger("pointermove", { clientX: 40, clientY: 25 });
      await canvas.trigger("pointerup");

      const emitted1 = wrapper.emitted("update:modelValue")?.at(-1)?.[0];
      expect(emitted1).toBe("data:image/png;base64,customStroke1");

      // Simulate v-model parent echo back into props.modelValue
      await wrapper.setProps({ modelValue: emitted1 });
      expect(ctxMock.clearRect).not.toHaveBeenCalled();
      expect(imageConstructCount).toBe(0);

      // Stroke 2 should draw on top without clearing Stroke 1
      await canvas.trigger("pointerdown", { clientX: 50, clientY: 20, pointerId: 1 });
      await canvas.trigger("pointermove", { clientX: 80, clientY: 35 });
      await canvas.trigger("pointerup");

      expect(ctxMock.clearRect).not.toHaveBeenCalled();
      expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toBe("data:image/png;base64,customStroke2");
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it("ignores accidental click/tap without pointermove and restores saved signature instead of emitting blank PNG", async () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const originalImage = globalThis.Image;
    const drawnSrcs = [];
    globalThis.Image = class MockImage {
      constructor() {
        this.naturalWidth = 100;
        this.naturalHeight = 50;
      }
      set src(val) {
        drawnSrcs.push(val);
        this.onload?.();
      }
    };

    try {
      const wrapper = mount(BaseSignaturePad, {
        props: {
          modelValue: savedSig,
          savedSignature: savedSig,
          allowProfileSignature: true,
        },
      });

      const canvas = wrapper.find("canvas");
      const ctxMock = {
        scale: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      };
      canvas.element.getContext = vi.fn(() => ctxMock);
      canvas.element.toDataURL = vi.fn(() => "data:image/png;base64,blankCanvas");

      drawnSrcs.length = 0;
      await canvas.trigger("pointerdown", { clientX: 15, clientY: 15, pointerId: 1 });
      await canvas.trigger("pointerup");

      // Should NOT have emitted a blank canvas PNG
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
      // Should have restored the saved signature onto the canvas
      expect(drawnSrcs).toContain(savedSig);

      // Empty pad accidental tap should also emit nothing
      const emptyWrapper = mount(BaseSignaturePad, {
        props: {
          modelValue: "",
          savedSignature: "",
          allowProfileSignature: false,
        },
      });
      const emptyCanvas = emptyWrapper.find("canvas");
      emptyCanvas.element.getContext = vi.fn(() => ctxMock);
      emptyCanvas.element.toDataURL = vi.fn(() => "data:image/png;base64,blankCanvas");
      await emptyCanvas.trigger("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 });
      await emptyCanvas.trigger("pointerup");
      expect(emptyWrapper.emitted("update:modelValue")).toBeUndefined();
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it("re-renders existing signature when canvas container resizes (e.g. Expand Editor toggle)", async () => {
    const originalImage = globalThis.Image;
    const originalResizeObserver = globalThis.ResizeObserver;
    let observerCallback = null;
    const drawImageSpy = vi.fn();

    globalThis.Image = class MockImage {
      constructor() {
        this.naturalWidth = 120;
        this.naturalHeight = 40;
      }
      set src(_val) {
        this.onload?.();
      }
    };
    globalThis.ResizeObserver = class MockResizeObserver {
      constructor(cb) {
        observerCallback = cb;
      }
      observe() {}
      disconnect() {
        observerCallback = null;
      }
    };

    try {
      const wrapper = mount(BaseSignaturePad, {
        props: {
          modelValue: "data:image/png;base64,existingSignature",
          savedSignature: "",
          allowProfileSignature: false,
        },
      });

      const canvas = wrapper.find("canvas");
      let currentRect = { width: 200, height: 80, left: 0, top: 0 };
      canvas.element.getBoundingClientRect = vi.fn(() => currentRect);
      canvas.element.getContext = vi.fn(() => ({
        scale: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        clearRect: vi.fn(),
        drawImage: drawImageSpy,
      }));

      // Initial resize observation syncs to 200x80
      observerCallback?.();
      expect(canvas.element.width).toBe(200);
      expect(drawImageSpy).toHaveBeenCalledTimes(1);

      // Expand to 500x150 -> ResizeObserver re-resizes and re-renders signature
      currentRect = { width: 500, height: 150, left: 0, top: 0 };
      observerCallback?.();
      expect(canvas.element.width).toBe(500);
      expect(canvas.element.height).toBe(150);
      expect(drawImageSpy).toHaveBeenCalledTimes(2);

      wrapper.unmount();
      expect(observerCallback).toBeNull();
    } finally {
      globalThis.Image = originalImage;
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it("keeps default slate border when required is false and pad is empty", () => {
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        allowProfileSignature: false,
      },
    });

    const container = wrapper.find(".rounded-xl.border");
    const canvas = wrapper.find("canvas");
    expect(container.classes()).toContain("border-slate-200");
    expect(container.classes()).not.toContain("border-red-500");
    expect(canvas.attributes("aria-invalid")).toBeUndefined();
    expect(canvas.attributes("aria-required")).toBeUndefined();
  });

  it("shows red border when required and unsigned, removes it when drawn, and restores it when cleared", async () => {
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        allowProfileSignature: false,
        required: true,
      },
    });

    const container = wrapper.find(".rounded-xl.border");
    const canvas = wrapper.find("canvas");
    expect(container.classes()).toContain("border-red-500");
    expect(container.classes()).not.toContain("border-slate-200");
    expect(canvas.attributes("aria-required")).toBe("true");
    expect(canvas.attributes("aria-invalid")).toBe("true");

    const ctxMock = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    };
    canvas.element.getContext = vi.fn(() => ctxMock);
    canvas.element.toDataURL = vi.fn(() => "data:image/png;base64,drawnSig");

    await canvas.trigger("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 });
    await canvas.trigger("pointermove", { clientX: 25, clientY: 25 });
    await canvas.trigger("pointerup");

    expect(container.classes()).toContain("border-slate-200");
    expect(container.classes()).not.toContain("border-red-500");
    expect(canvas.attributes("aria-invalid")).toBeUndefined();

    await wrapper.find('[data-testid="clear-signature-btn"]').trigger("click");
    expect(container.classes()).toContain("border-red-500");
    expect(container.classes()).not.toContain("border-slate-200");
    expect(canvas.attributes("aria-invalid")).toBe("true");
  });

  it("omits red border when required pad is pre-filled from saved signature and restores it on clear", async () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        savedSignature: savedSig,
        allowProfileSignature: true,
        required: true,
      },
    });
    await nextTick();

    const container = wrapper.find(".rounded-xl.border");
    expect(container.classes()).toContain("border-slate-200");
    expect(container.classes()).not.toContain("border-red-500");

    await wrapper.find('[data-testid="clear-signature-btn"]').trigger("click");
    await wrapper.setProps({ modelValue: "" });
    expect(container.classes()).toContain("border-red-500");

    await wrapper.find('[data-testid="use-saved-signature-btn"]').trigger("click");
    expect(container.classes()).toContain("border-slate-200");
    expect(container.classes()).not.toContain("border-red-500");
  });

  it("suppresses red border when required pad is disabled", () => {
    const wrapper = mount(BaseSignaturePad, {
      props: {
        modelValue: "",
        allowProfileSignature: false,
        required: true,
        disabled: true,
      },
    });

    const container = wrapper.find(".rounded-xl.border");
    const canvas = wrapper.find("canvas");
    expect(container.classes()).toContain("border-slate-200");
    expect(container.classes()).not.toContain("border-red-500");
    expect(canvas.attributes("aria-invalid")).toBeUndefined();
  });
});
