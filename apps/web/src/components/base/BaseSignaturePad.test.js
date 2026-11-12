// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
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
});
