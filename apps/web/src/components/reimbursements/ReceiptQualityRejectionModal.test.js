// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReceiptQualityRejectionModal from "./ReceiptQualityRejectionModal.vue";

const baseModalStub = {
  name: "BaseModal",
  props: ["isOpen", "title", "description"],
  emits: ["close"],
  template: `<div class="base-modal-stub"><slot /></div>`,
};

function mountModal(props = {}) {
  return mount(ReceiptQualityRejectionModal, {
    props: {
      isOpen: true,
      rejectionReason: "Quality check failed.",
      ...props,
    },
    global: {
      stubs: {
        BaseModal: baseModalStub,
      },
    },
  });
}

describe("ReceiptQualityRejectionModal", () => {
  it.each([
    ["blurry", "Blurry Receipt Image Detected", "Blurry Image"],
    ["faded", "Faded Receipt Image Detected", "Faded Receipt"],
    ["unreadable", "Unreadable or Damaged Receipt", "Unreadable Receipt"],
    ["too_dark", "Receipt Image Quality Issue", "Too Dark"],
    ["too_small", "Receipt Image Quality Issue", "Resolution Too Low"],
    ["not_a_receipt", "Unrecognized Receipt Image", "Not a Receipt"],
    ["duplicate", "Duplicate Receipt Detected", "Duplicate Receipt"],
  ])(
    "never renders a 'Continue Anyway' button for %s rejection code",
    (code, expectedTitle, expectedBadge) => {
      const wrapper = mountModal({
        rejectionCode: code,
        rejectionReason: `Reason for ${code}`,
        showSegmentedOption: true,
      });

      expect(wrapper.text()).toContain(expectedTitle);
      expect(wrapper.text()).toContain(expectedBadge);
      expect(wrapper.text()).toContain(`Reason for ${code}`);
      expect(wrapper.text()).not.toContain("Continue Anyway");
      expect(wrapper.text()).not.toContain("cannot be overridden");

      const buttons = wrapper.findAll("button");
      expect(buttons.some((b) => b.text().toLowerCase().includes("continue"))).toBe(false);

      const closeBtn = buttons.find((b) => b.text().trim() === "Close");
      const retakeBtn = buttons.find((b) => b.text().includes("Upload New Receipt"));
      expect(closeBtn).toBeDefined();
      expect(retakeBtn).toBeDefined();
      expect(closeBtn.classes()).toContain("h-9");
      expect(retakeBtn.classes()).toContain("h-9");
      expect(closeBtn.classes()).toContain("px-3.5");
      expect(retakeBtn.classes()).toContain("px-4");
      expect(closeBtn.classes()).not.toContain("w-full");
    },
  );

  it("renders unreadable badge, title, subtitle, reason, and damaged-receipt tips without segmented option", () => {
    const reason =
      "The receipt is damaged, incomplete, or too unreadable to extract critical details (Total Amount, Transaction Date). Please upload a clearer photo of the receipt.";
    const wrapper = mountModal({
      rejectionCode: "unreadable",
      rejectionReason: reason,
      showSegmentedOption: true,
    });

    expect(wrapper.text()).toContain("Unreadable or Damaged Receipt");
    expect(wrapper.text()).toContain(
      "Critical receipt details could not be read from this image",
    );
    expect(wrapper.text()).toContain("Unreadable Receipt");
    expect(wrapper.text()).toContain(reason);
    expect(wrapper.text()).toContain("merchant name, date, items, and total");
    expect(wrapper.text()).toContain("creases");
    expect(wrapper.text()).not.toContain("Upload in Segments");
    expect(wrapper.text()).not.toContain("Long Receipt?");
    expect(wrapper.text()).not.toContain("Continue Anyway");
  });

  it("renders 'Upload in Segments' only when showSegmentedOption is true and rejectionCode is too_small", async () => {
    const tooSmallWrapper = mountModal({
      rejectionCode: "too_small",
      rejectionReason: "Image resolution is too small.",
      showSegmentedOption: true,
    });
    expect(tooSmallWrapper.text()).toContain("Upload in Segments");
    expect(tooSmallWrapper.text()).toContain("Long Receipt?");

    const segBtn = tooSmallWrapper
      .findAll("button")
      .find((b) => b.text().includes("Upload in Segments"));
    await segBtn.trigger("click");
    expect(tooSmallWrapper.emitted("upload-segmented")).toHaveLength(1);

    const hiddenWrapper = mountModal({
      rejectionCode: "too_small",
      rejectionReason: "Image resolution is too small.",
      showSegmentedOption: false,
    });
    expect(hiddenWrapper.text()).not.toContain("Upload in Segments");
    expect(hiddenWrapper.text()).not.toContain("Long Receipt?");
  });

  it("renders a Close button and emits 'close' from both button click and BaseModal close", async () => {
    const wrapper = mountModal({
      rejectionCode: "unreadable",
      rejectionReason: "Cannot read critical fields.",
    });

    const footer = wrapper.find("footer");
    const buttonGroup = footer.find("div.flex");
    expect(buttonGroup.exists()).toBe(true);
    expect(buttonGroup.classes()).toContain("items-center");
    expect(buttonGroup.classes()).toContain("justify-end");
    expect(buttonGroup.classes()).not.toContain("grid");

    const closeBtn = wrapper
      .findAll("button")
      .find((b) => b.text().trim() === "Close");
    expect(closeBtn).toBeDefined();

    await closeBtn.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);

    wrapper.findComponent({ name: "BaseModal" }).vm.$emit("close");
    expect(wrapper.emitted("close")).toHaveLength(2);
  });

  it("portals above an open parent BaseModal at z-[100] and handles Upload New Receipt and Close clicks", async () => {
    const { default: BaseModal } = await import("@/components/base/BaseModal.vue");
    const wrapper = mount(
      {
        components: { BaseModal, ReceiptQualityRejectionModal },
        data() {
          return { parentOpen: true, qualityOpen: true, retakeCount: 0 };
        },
        template: `
          <BaseModal :is-open="parentOpen" title="Settle Cash Advance">
            <ReceiptQualityRejectionModal
              :is-open="qualityOpen"
              rejection-code="unreadable"
              rejection-reason="Unreadable image"
              @retake="retakeCount++; qualityOpen = false"
              @close="qualityOpen = false"
            />
          </BaseModal>
        `,
      },
      { attachTo: document.body },
    );
    await wrapper.vm.$nextTick();

    const dialogs = Array.from(document.body.querySelectorAll('[role="dialog"]'));
    expect(dialogs).toHaveLength(2);
    const qualityDialog = dialogs[1];
    expect(qualityDialog.classList.contains("z-[100]")).toBe(true);
    expect(qualityDialog.textContent).not.toContain("Continue Anyway");

    const retakeBtn = Array.from(qualityDialog.querySelectorAll("button")).find(
      (b) => b.textContent.includes("Upload New Receipt"),
    );
    expect(retakeBtn).toBeDefined();
    retakeBtn.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.qualityOpen).toBe(false);
    expect(wrapper.vm.retakeCount).toBe(1);
    expect(wrapper.vm.parentOpen).toBe(true);

    // Re-open and test Close button
    wrapper.vm.qualityOpen = true;
    await wrapper.vm.$nextTick();
    const reopenedDialog = Array.from(document.body.querySelectorAll('[role="dialog"]'))[1];
    const closeBtn = Array.from(reopenedDialog.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === "Close",
    );
    expect(closeBtn).toBeDefined();
    closeBtn.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.qualityOpen).toBe(false);
    expect(wrapper.vm.retakeCount).toBe(1);
    wrapper.unmount();
    document.body.innerHTML = "";
  });
});
