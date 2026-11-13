// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LiquidationSettlementForm from "./LiquidationSettlementForm.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import BaseReceiptDetailModal from "@/components/base/BaseReceiptDetailModal.vue";
import ReceiptImagePreview from "@/components/base/ReceiptImagePreview.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";

describe("LiquidationSettlementForm — Receipt Grid vs Form List", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const sampleAdvance = {
    id: 101,
    purpose: "Client Conference",
    balance: 5000,
    amount: 5000,
    status: "signed",
    acknowledgedAt: "2026-10-10",
  };

  const sampleReceipts = [
    {
      id: 1,
      fileName: "jollibee_receipt.jpg",
      merchantName: "Jollibee Las Vegas",
      location: "Las Vegas NV",
      amount: 1250,
      vat: 150,
      invoiceNumber: "INV-101",
      category: "Meals",
      status: "pending",
    },
    {
      id: 2,
      fileName: "taxi_fare.jpg",
      merchantName: "Grab Express",
      location: "Makati City",
      amount: 450,
      vat: 0,
      invoiceNumber: "INV-102",
      category: "Transportation",
      status: "pending",
    },
  ];

  it("renders full-bleed receipt cards with only title, status, price, and View Details button in view mode", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: true,
        receipts: sampleReceipts,
        existingLiquidation: {
          id: 5,
          status: "pending",
          receipts: sampleReceipts,
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          BaseReceiptDetailModal: true,
          ImagePreviewModal: true,
        },
      },
    });

    // ScannedReceiptsList should NOT be rendered when disabled / in view mode
    expect(wrapper.findComponent(ScannedReceiptsList).exists()).toBe(false);

    // Grid cards should be rendered without outer card padding (edge-to-edge upper image)
    const articles = wrapper.findAll("article");
    expect(articles).toHaveLength(2);
    expect(articles[0].classes()).not.toContain("p-4");
    expect(articles[0].classes()).toContain("overflow-hidden");
    expect(articles[0].classes()).toContain("rounded-3xl");
    expect(articles[0].classes()).toContain("isolate");
    expect(articles[0].classes()).toContain("transform-gpu");
    expect(articles[0].classes()).not.toContain("hover:shadow-xl");
    expect(articles[0].classes()).not.toContain("hover:shadow-md");

    // Full-bleed vertically stretched image without circle number badge or filename header
    const previews = wrapper.findAllComponents(ReceiptImagePreview);
    expect(previews).toHaveLength(2);
    expect(previews[0].props("showBadge")).toBe(false);
    expect(previews[0].props("aspectClass")).toBe("h-full w-full");
    expect(previews[0].props("imgClass")).toContain("object-cover");
    expect(previews[0].props("frameClass")).toContain("border-0");
    expect(previews[0].props("frameClass")).toContain("rounded-3xl");
    expect(previews[0].props("frameClass")).not.toContain("rounded-none");
    expect(previews[0].element.parentElement.classList.contains("rounded-3xl")).toBe(true);
    expect(previews[0].element.parentElement.classList.contains("overflow-hidden")).toBe(true);
    expect(articles[0].classes()).toContain("min-h-[390px]");
    expect(articles[0].text()).not.toContain("jollibee receipt");

    // Transparent frosted blur overlay over lower card portion
    const blurOverlay = articles[0].find("[aria-hidden='true']");
    expect(blurOverlay.exists()).toBe(true);
    expect(blurOverlay.classes()).toContain("backdrop-blur-md");
    expect(blurOverlay.classes()).toContain("rounded-b-3xl");

    // Only one title, status, price, and View Details button are displayed
    const cardText = articles[0].text();
    expect(cardText).toContain("Jollibee Las Vegas");
    expect(cardText).toContain("Pending");
    expect(cardText).toContain("1,250.00");
    expect(cardText).toContain("View Details");
    expect(cardText).not.toContain("Las Vegas NV");
    expect(cardText).not.toContain("Meals");

    expect(articles[1].text()).toContain("Grab Express");
    expect(articles[1].text()).toContain("450.00");
    expect(articles[1].text()).not.toContain("Makati City");
    expect(articles[1].text()).not.toContain("Transportation");

    const viewDetailsBtn = articles[0].find("button");
    expect(viewDetailsBtn.classes()).toContain("bg-primary");
    expect(viewDetailsBtn.classes()).toContain("rounded-md");
    expect(viewDetailsBtn.classes()).toContain("h-9");
    expect(viewDetailsBtn.classes()).toContain("sm:w-auto");
    expect(viewDetailsBtn.classes()).not.toContain("rounded-full");
    expect(viewDetailsBtn.classes()).not.toContain("h-10");

    expect(wrapper.findAllComponents(StatusBadge).length).toBeGreaterThanOrEqual(2);
  });

  it("opens BaseReceiptDetailModal via BaseModal portal on top of liquidation details instead of trapping it inline", async () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: true,
        receipts: sampleReceipts,
        existingLiquidation: {
          id: 5,
          status: "pending",
          receipts: sampleReceipts,
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          BaseReceiptImage: true,
          ImagePreviewModal: true,
          StatusBadge: true,
        },
      },
    });

    const viewDetailsButtons = wrapper
      .findAll("button")
      .filter((b) => b.text().includes("View Details"));
    expect(viewDetailsButtons).toHaveLength(2);

    await viewDetailsButtons[0].trigger("click");

    const modal = wrapper.findComponent(BaseReceiptDetailModal);
    expect(modal.exists()).toBe(true);
    expect(modal.props("isOpen")).toBe(true);
    expect(modal.props("receipt")?.vendor).toBe("Jollibee Las Vegas");

    // Must portal out to document.body centered with fixed positioning at z-[60]
    expect(wrapper.element.textContent).not.toContain("INV-101");
    expect(document.body.textContent).toContain("Jollibee Las Vegas");
    expect(document.body.textContent).toContain("INV-101");
    const dialogEl = document.body.querySelector('[role="dialog"]');
    expect(dialogEl).not.toBeNull();
    expect(dialogEl.classList.contains("fixed")).toBe(true);
    expect(dialogEl.classList.contains("relative")).toBe(false);
    expect(dialogEl.classList.contains("z-[60]")).toBe(true);

    const closeBtn = document.body.querySelector('button[aria-label="Close receipt details"]');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    await wrapper.vm.$nextTick();

    expect(modal.props("isOpen")).toBe(false);
    wrapper.unmount();
  });

  it("renders ScannedReceiptsList when actively composing / editing a liquidation", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: false,
        receipts: sampleReceipts,
        existingLiquidation: null,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ScannedReceiptsList: {
            template: `<div data-testid="scanned-receipts-list"></div>`,
          },
        },
      },
    });

    // When actively composing, ScannedReceiptsList should be rendered
    expect(wrapper.find('[data-testid="scanned-receipts-list"]').exists()).toBe(true);
  });

  it("renders Delete and Update buttons with matching sizing classes for pending liquidations in view mode", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: sampleAdvance,
        disabled: true,
        receipts: sampleReceipts,
        existingLiquidation: {
          id: 5,
          status: "pending",
          receipts: sampleReceipts,
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          StatusBadge: true,
          BaseReceiptDetailModal: true,
        },
      },
    });

    const deleteBtn = wrapper.find("#delete-liquidation-btn");
    const submitBtn = wrapper.find("#submit-liquidation-btn");
    expect(deleteBtn.exists()).toBe(true);
    expect(submitBtn.exists()).toBe(true);

    for (const cls of ["h-[42px]", "w-full", "sm:w-auto", "sm:min-w-[120px]"]) {
      expect(deleteBtn.classes()).toContain(cls);
      expect(submitBtn.classes()).toContain(cls);
    }
    expect(deleteBtn.classes()).not.toContain("h-9");
    expect(submitBtn.classes()).not.toContain("h-9");
  });
});
