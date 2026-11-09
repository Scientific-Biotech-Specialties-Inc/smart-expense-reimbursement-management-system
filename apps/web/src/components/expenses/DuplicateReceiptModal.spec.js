// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import DuplicateReceiptModal from "@/components/expenses/DuplicateReceiptModal.vue";

const { routerPushMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: 1, name: "Test User" },
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

describe("DuplicateReceiptModal", () => {
  let wrapper;

  beforeEach(() => {
    routerPushMock.mockClear();
    wrapper = mount(DuplicateReceiptModal, {
      global: {
        stubs: {
          Transition: {
            template: "<div><slot /></div>",
          },
        },
      },
    });
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
  });

  it("renders closed by default", () => {
    expect(wrapper.find(".fixed").exists()).toBe(false);
  });

  it("opens on receipt-duplicate-detected event and shows Cancel button beside Upload New One", async () => {
    window.dispatchEvent(
      new CustomEvent("receipt-duplicate-detected", {
        detail: {
          receiptId: "receipt-123",
          similarityScore: 0.95,
          message: "Potential duplicate detected.",
        },
      })
    );
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".fixed").exists()).toBe(true);
    expect(wrapper.text()).toContain("Duplicate Detected");
    expect(wrapper.text()).toContain("Potential duplicate detected.");

    const buttons = wrapper.findAll("button");
    const cancelButton = buttons.find((btn) => btn.text().trim() === "Cancel");
    const uploadNewButton = buttons.find((btn) =>
      btn.text().includes("Upload New One")
    );

    expect(uploadNewButton).toBeDefined();
    expect(uploadNewButton.exists()).toBe(true);
    expect(cancelButton).toBeDefined();
    expect(cancelButton.exists()).toBe(true);
  });

  it("clicking Cancel button closes the modal, emits remove-duplicate-receipt, and redirects to /reimbursements", async () => {
    const removeDuplicateSpy = vi.fn();
    const openUploadSpy = vi.fn();
    window.addEventListener("remove-duplicate-receipt", removeDuplicateSpy);
    window.addEventListener("open-receipt-upload", openUploadSpy);

    window.dispatchEvent(
      new CustomEvent("receipt-duplicate-detected", {
        detail: {
          receiptId: "receipt-456",
          similarityScore: 1.0,
        },
      })
    );
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll("button");
    const cancelButton = buttons.find((btn) => btn.text().trim() === "Cancel");
    expect(cancelButton).toBeDefined();
    expect(cancelButton.exists()).toBe(true);

    await cancelButton.trigger("click");
    await wrapper.vm.$nextTick();

    // Modal should now be closed
    expect(wrapper.find(".fixed").exists()).toBe(false);

    // remove-duplicate-receipt should have been dispatched with receiptId
    expect(removeDuplicateSpy).toHaveBeenCalledTimes(1);
    expect(removeDuplicateSpy.mock.calls[0][0].detail).toEqual({
      receiptId: "receipt-456",
    });

    // open-receipt-upload should NOT have been dispatched
    expect(openUploadSpy).not.toHaveBeenCalled();

    // router.push('/reimbursements') should have been called
    expect(routerPushMock).toHaveBeenCalledWith("/reimbursements");

    window.removeEventListener("remove-duplicate-receipt", removeDuplicateSpy);
    window.removeEventListener("open-receipt-upload", openUploadSpy);
  });

  it("clicking Upload New One closes modal and emits both remove-duplicate-receipt and open-receipt-upload without redirecting", async () => {
    const removeDuplicateSpy = vi.fn();
    const openUploadSpy = vi.fn();
    window.addEventListener("remove-duplicate-receipt", removeDuplicateSpy);
    window.addEventListener("open-receipt-upload", openUploadSpy);

    window.dispatchEvent(
      new CustomEvent("receipt-duplicate-detected", {
        detail: {
          receiptId: "receipt-789",
          similarityScore: 1.0,
        },
      })
    );
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll("button");
    const uploadNewButton = buttons.find((btn) =>
      btn.text().includes("Upload New One")
    );
    expect(uploadNewButton).toBeDefined();

    await uploadNewButton.trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".fixed").exists()).toBe(false);
    expect(removeDuplicateSpy).toHaveBeenCalledTimes(1);
    expect(removeDuplicateSpy.mock.calls[0][0].detail).toEqual({
      receiptId: "receipt-789",
    });
    expect(openUploadSpy).toHaveBeenCalledTimes(1);
    expect(routerPushMock).not.toHaveBeenCalled();

    window.removeEventListener("remove-duplicate-receipt", removeDuplicateSpy);
    window.removeEventListener("open-receipt-upload", openUploadSpy);
  });
});
