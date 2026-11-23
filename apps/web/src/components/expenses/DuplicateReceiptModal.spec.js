// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import DuplicateReceiptModal from "@/components/expenses/DuplicateReceiptModal.vue";
import BaseModal from "@/components/base/BaseModal.vue";

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

function getOpenDialogs() {
  return Array.from(document.body.querySelectorAll('[role="dialog"][data-state="open"]'));
}

function getTopDialog() {
  const dialogs = getOpenDialogs();
  return dialogs[dialogs.length - 1] || null;
}

describe("DuplicateReceiptModal", () => {
  let wrapper;

  beforeEach(() => {
    routerPushMock.mockClear();
    document.body.innerHTML = "";
    wrapper = mount(DuplicateReceiptModal, {
      attachTo: document.body,
    });
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = "";
  });

  it("renders closed by default", () => {
    expect(getTopDialog()).toBeNull();
  });

  it("opens on receipt-duplicate-detected event in BaseModal portal at z-[100] and shows Cancel button beside Upload New One", async () => {
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

    const dialog = getTopDialog();
    expect(dialog).not.toBeNull();
    expect(dialog.classList.contains("z-[100]")).toBe(true);
    expect(dialog.textContent).toContain("Duplicate Detected");
    expect(dialog.textContent).toContain("Potential duplicate detected.");

    const buttons = Array.from(dialog.querySelectorAll("button"));
    const cancelButton = buttons.find((btn) => btn.textContent.trim() === "Cancel");
    const uploadNewButton = buttons.find((btn) =>
      btn.textContent.includes("Upload New One")
    );

    expect(uploadNewButton).toBeDefined();
    expect(cancelButton).toBeDefined();
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

    const dialog = getTopDialog();
    const cancelButton = Array.from(dialog.querySelectorAll("button")).find(
      (btn) => btn.textContent.trim() === "Cancel"
    );
    expect(cancelButton).toBeDefined();

    cancelButton.click();
    await wrapper.vm.$nextTick();

    expect(getTopDialog()).toBeNull();
    expect(removeDuplicateSpy).toHaveBeenCalledTimes(1);
    expect(removeDuplicateSpy.mock.calls[0][0].detail).toEqual({
      receiptId: "receipt-456",
    });
    expect(openUploadSpy).not.toHaveBeenCalled();
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

    const dialog = getTopDialog();
    const uploadNewButton = Array.from(dialog.querySelectorAll("button")).find(
      (btn) => btn.textContent.includes("Upload New One")
    );
    expect(uploadNewButton).toBeDefined();

    uploadNewButton.click();
    await wrapper.vm.$nextTick();

    expect(getTopDialog()).toBeNull();
    expect(removeDuplicateSpy).toHaveBeenCalledTimes(1);
    expect(removeDuplicateSpy.mock.calls[0][0].detail).toEqual({
      receiptId: "receipt-789",
    });
    expect(openUploadSpy).toHaveBeenCalledTimes(1);
    expect(routerPushMock).not.toHaveBeenCalled();

    window.removeEventListener("remove-duplicate-receipt", removeDuplicateSpy);
    window.removeEventListener("open-receipt-upload", openUploadSpy);
  });

  it("allows clicking Cancel and Upload New One above an open Liquidation BaseModal without redirecting or closing it", async () => {
    const liquidationOpen = ref(true);
    const parentModal = mount(
      {
        components: { BaseModal },
        setup: () => ({ liquidationOpen }),
        template: `
          <BaseModal :is-open="liquidationOpen" title="Settle Cash Advance" @close="liquidationOpen = false">
            <input type="text" aria-label="Invoice Number" />
          </BaseModal>
        `,
      },
      { attachTo: document.body }
    );
    await parentModal.vm.$nextTick();

    const removeDuplicateSpy = vi.fn();
    window.addEventListener("remove-duplicate-receipt", removeDuplicateSpy);

    window.dispatchEvent(
      new CustomEvent("receipt-duplicate-detected", {
        detail: {
          receiptId: "temp-liq-1",
          source: "liquidation",
          message: "Duplicate detected.",
        },
      })
    );
    await wrapper.vm.$nextTick();

    const dialogs = getOpenDialogs();
    expect(dialogs).toHaveLength(2);
    const duplicateDialog = dialogs.find((d) => d.classList.contains("z-[100]"));
    expect(duplicateDialog).toBeDefined();
    expect(getComputedStyle(duplicateDialog).pointerEvents).not.toBe("none");

    const cancelButton = Array.from(duplicateDialog.querySelectorAll("button")).find(
      (btn) => btn.textContent.trim() === "Cancel"
    );
    cancelButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    cancelButton.click();
    await wrapper.vm.$nextTick();

    expect(removeDuplicateSpy).toHaveBeenCalledTimes(1);
    expect(removeDuplicateSpy.mock.calls[0][0].detail).toEqual({
      receiptId: "temp-liq-1",
    });
    expect(routerPushMock).not.toHaveBeenCalled();
    expect(liquidationOpen.value).toBe(true);
    expect(getOpenDialogs()).toHaveLength(1);

    window.removeEventListener("remove-duplicate-receipt", removeDuplicateSpy);
    parentModal.unmount();
  });
});
