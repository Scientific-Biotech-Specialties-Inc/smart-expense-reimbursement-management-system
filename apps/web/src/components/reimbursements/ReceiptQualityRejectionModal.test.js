// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReceiptQualityRejectionModal from "./ReceiptQualityRejectionModal.vue";

describe("ReceiptQualityRejectionModal", () => {
  it("renders distinct copy and manual entry override for not_a_receipt", async () => {
    const wrapper = mount(ReceiptQualityRejectionModal, {
      props: {
        isOpen: true,
        rejectionCode: "not_a_receipt",
        rejectionReason: "The uploaded image does not appear to be a valid receipt or invoice.",
        showSegmentedOption: true,
      },
      global: {
        stubs: {
          BaseModal: {
            template: `<div class="base-modal-stub"><slot /></div>`,
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Unrecognized Receipt Image");
    expect(wrapper.text()).toContain("Not a Receipt");
    expect(wrapper.text()).toContain("Continue Anyway (Enter Manually)");
    // Should NOT show upload in segments for not_a_receipt
    expect(wrapper.text()).not.toContain("Upload in Segments");
    expect(wrapper.text()).not.toContain("Long Receipt?");

    const overrideBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Continue Anyway (Enter Manually)"));
    expect(overrideBtn).toBeDefined();

    await overrideBtn.trigger("click");
    expect(wrapper.emitted("continue-anyway")).toHaveLength(1);
  });

  it("renders distinct copy and override warning for blurry receipts", async () => {
    const wrapper = mount(ReceiptQualityRejectionModal, {
      props: {
        isOpen: true,
        rejectionCode: "blurry",
        rejectionReason: "The receipt image is out of focus and cannot be read accurately.",
        showSegmentedOption: false,
      },
      global: {
        stubs: {
          BaseModal: {
            template: `<div class="base-modal-stub"><slot /></div>`,
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Blurry Receipt Image Detected");
    expect(wrapper.text()).toContain("Blurry Image");
    expect(wrapper.text()).toContain("Continue Anyway (Override Warning)");

    const overrideBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Continue Anyway (Override Warning)"));
    expect(overrideBtn).toBeDefined();

    await overrideBtn.trigger("click");
    expect(wrapper.emitted("continue-anyway")).toHaveLength(1);
  });

  it("renders distinct copy and disables override/segmented buttons for faded receipts", async () => {
    const wrapper = mount(ReceiptQualityRejectionModal, {
      props: {
        isOpen: true,
        rejectionCode: "faded",
        rejectionReason:
          "The receipt text is too faded or washed out to read accurately.",
        showSegmentedOption: true,
      },
      global: {
        stubs: {
          BaseModal: {
            template: `<div class="base-modal-stub"><slot /></div>`,
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Faded Receipt Image Detected");
    expect(wrapper.text()).toContain("Faded Receipt");
    expect(wrapper.text()).toContain(
      "Faded receipts cannot be overridden. Please upload a clearer receipt."
    );
    expect(wrapper.text()).not.toContain("Continue Anyway");
    expect(wrapper.text()).not.toContain("Upload in Segments");
    expect(wrapper.text()).not.toContain("Long Receipt?");
  });

  it("portals above an open parent BaseModal at z-[100] and handles button clicks", async () => {
    const { default: BaseModal } = await import("@/components/base/BaseModal.vue");
    const wrapper = mount(
      {
        components: { BaseModal, ReceiptQualityRejectionModal },
        data() {
          return { parentOpen: true, qualityOpen: true };
        },
        template: `
          <BaseModal :is-open="parentOpen" title="Settle Cash Advance">
            <ReceiptQualityRejectionModal
              :is-open="qualityOpen"
              rejection-code="blurry"
              rejection-reason="Blurry image"
              @retake="qualityOpen = false"
            />
          </BaseModal>
        `,
      },
      { attachTo: document.body }
    );
    await wrapper.vm.$nextTick();

    const dialogs = Array.from(document.body.querySelectorAll('[role="dialog"]'));
    expect(dialogs).toHaveLength(2);
    const qualityDialog = dialogs[1];
    expect(qualityDialog.classList.contains("z-[100]")).toBe(true);

    const retakeBtn = Array.from(qualityDialog.querySelectorAll("button")).find(
      (b) => b.textContent.includes("Upload New Receipt")
    );
    expect(retakeBtn).toBeDefined();
    retakeBtn.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.qualityOpen).toBe(false);
    expect(wrapper.vm.parentOpen).toBe(true);
    wrapper.unmount();
    document.body.innerHTML = "";
  });
});
