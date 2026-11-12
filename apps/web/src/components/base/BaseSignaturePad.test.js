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
});
