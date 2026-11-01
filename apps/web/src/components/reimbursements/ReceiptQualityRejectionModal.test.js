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
});
