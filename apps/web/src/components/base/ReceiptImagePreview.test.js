// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReceiptImagePreview from "./ReceiptImagePreview.vue";
import ImagePreviewModal from "./ImagePreviewModal.vue";

describe("ReceiptImagePreview", () => {
  it("renders index badge and cleaned filename header", () => {
    const wrapper = mount(ReceiptImagePreview, {
      props: {
        index: 1,
        fileName: "receipt_22.jpg",
        src: "https://example.com/receipt.jpg",
      },
    });

    expect(wrapper.text()).toContain("1");
    expect(wrapper.text()).toContain("receipt 22");
    expect(wrapper.find("img").exists()).toBe(true);
  });

  it("renders delete button and emits remove when clicked", async () => {
    const testReceipt = { id: 101, fileName: "sample.jpg" };
    const wrapper = mount(ReceiptImagePreview, {
      props: {
        index: 2,
        fileName: "sample.jpg",
        src: "https://example.com/sample.jpg",
        allowRemove: true,
        disabled: false,
        receipt: testReceipt,
      },
    });

    const deleteBtn = wrapper.find("button");
    expect(deleteBtn.exists()).toBe(true);
    expect(deleteBtn.text()).toContain("Delete Receipt");

    await deleteBtn.trigger("click");
    expect(wrapper.emitted("remove")).toBeTruthy();
    expect(wrapper.emitted("remove")[0]).toEqual([testReceipt]);
  });

  it("does not render delete button when allowRemove is false or disabled is true", () => {
    const wrapperDisabled = mount(ReceiptImagePreview, {
      props: {
        index: 1,
        fileName: "sample.jpg",
        allowRemove: true,
        disabled: true,
      },
    });
    expect(wrapperDisabled.find("button").exists()).toBe(false);

    const wrapperNoRemove = mount(ReceiptImagePreview, {
      props: {
        index: 1,
        fileName: "sample.jpg",
        allowRemove: false,
        disabled: false,
      },
    });
    expect(wrapperNoRemove.find("button").exists()).toBe(false);
  });

  it("displays processing overlay when isProcessing is true", () => {
    const wrapper = mount(ReceiptImagePreview, {
      props: {
        src: "https://example.com/receipt.jpg",
        isProcessing: true,
      },
    });

    expect(wrapper.text()).toContain("Extracting OCR Data...");
  });

  it("opens ImagePreviewModal when image frame is clicked and enableZoom is true", async () => {
    const wrapper = mount(ReceiptImagePreview, {
      props: {
        src: "https://example.com/receipt.jpg",
        fileName: "receipt_22.jpg",
        enableZoom: true,
      },
    });

    const imageFrame = wrapper.find(".aspect-\\[3\\/4\\]");
    expect(imageFrame.exists()).toBe(true);

    await imageFrame.trigger("click");
    expect(wrapper.emitted("click-image")).toBeTruthy();

    const modal = wrapper.findComponent(ImagePreviewModal);
    expect(modal.exists()).toBe(true);
    expect(modal.props("modelValue")).toBe(true);
  });

  it("renders StackedReceiptDeck when multiple images are provided via images prop", () => {
    const wrapper = mount(ReceiptImagePreview, {
      props: {
        images: [
          "https://example.com/part1.jpg",
          "https://example.com/part2.jpg",
        ],
        fileName: "multi_receipt.jpg",
      },
    });

    const stackedCards = wrapper.findAll("[data-testid='stacked-receipt-card']");
    expect(stackedCards).toHaveLength(2);
    expect(wrapper.text()).toContain("Part 1");
    expect(wrapper.text()).toContain("Part 2");
  });

  it("renders StackedReceiptDeck when receipt object has multiple file_urls", () => {
    const wrapper = mount(ReceiptImagePreview, {
      props: {
        receipt: {
          file_url: [
            "https://example.com/slice1.jpg",
            "https://example.com/slice2.jpg",
            "https://example.com/slice3.jpg",
          ],
        },
      },
    });

    const stackedCards = wrapper.findAll("[data-testid='stacked-receipt-card']");
    expect(stackedCards).toHaveLength(3);
    expect(wrapper.text()).toContain("Part 1");
    expect(wrapper.text()).toContain("Part 2");
    expect(wrapper.text()).toContain("Part 3");
  });
});

