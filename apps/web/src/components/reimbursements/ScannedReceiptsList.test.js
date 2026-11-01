// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScannedReceiptsList from "./ScannedReceiptsList.vue";

describe("ScannedReceiptsList — Required Field Highlighting", () => {
  const baseReceipt = {
    id: "r-1",
    fileName: "receipt.jpg",
    invoiceNumber: "",
    date: "",
    tin: "",
    merchantName: "",
    location: "",
    categoryId: null,
    amount: "",
    subtotal: "",
    tax: "",
    vatClassification: "vat",
    currency: "PHP",
    items: [],
    isUploading: false,
    isProcessing: false,
    hasOcrReturned: false,
  };

  it("does not highlight missing fields with red border before OCR returns", () => {
    const wrapper = mount(ScannedReceiptsList, {
      props: {
        receipts: [{ ...baseReceipt, hasOcrReturned: false }],
        categories: [{ id: 1, name: "Meals" }],
      },
    });

    const invoiceInput = wrapper.find("input[type='text']");
    expect(invoiceInput.classes()).not.toContain("input-error");
  });

  it("highlights missing required fields with red border (input-error) after OCR returns", () => {
    const wrapper = mount(ScannedReceiptsList, {
      props: {
        receipts: [{ ...baseReceipt, hasOcrReturned: true }],
        categories: [{ id: 1, name: "Meals" }],
      },
    });

    // Inputs with missing values should receive error styling
    const errorInputs = wrapper.findAll(".input-error");
    expect(errorInputs.length).toBeGreaterThan(0);
  });

  it("removes red highlight when user enters a value into a missing field", async () => {
    const receipt = { ...baseReceipt, hasOcrReturned: true, invoiceNumber: "" };
    const wrapper = mount(ScannedReceiptsList, {
      props: {
        receipts: [receipt],
        categories: [{ id: 1, name: "Meals" }],
      },
    });

    const invoiceInput = wrapper.find("input[type='text']");
    expect(invoiceInput.classes()).toContain("input-error");

    // Enter value
    await invoiceInput.setValue("INV-9999");

    expect(invoiceInput.classes()).not.toContain("input-error");
  });

  it("renders Type of Event dropdown with options beside Category and binds eventType", async () => {
    const receipt = {
      ...baseReceipt,
      hasOcrReturned: true,
      categoryId: 1,
      eventType: "",
    };
    const wrapper = mount(ScannedReceiptsList, {
      props: {
        receipts: [receipt],
        categories: [{ id: 1, name: "Meals" }],
      },
    });

    const eventSelect = wrapper.find("[data-testid='receipt-event-type-select']");
    expect(eventSelect.exists()).toBe(true);

    // Verify default options exist
    const options = eventSelect.findAll("option").map((opt) => opt.text());
    expect(options).toContain("Select type of event");
    expect(options).toContain("Client Meeting");
    expect(options).toContain("Conference / Seminar");
    expect(options).toContain("Training / Workshop");
    expect(options).toContain("Team Building");
    expect(options).toContain("Project Deployment / Field Work");
    expect(options).toContain("Company Celebration / Gathering");
    expect(options).toContain("Others");

    // Missing error class when empty after OCR return
    expect(eventSelect.classes()).toContain("input-error");

    // Select an option and verify update
    await eventSelect.setValue("Client Meeting");
    expect(receipt.eventType).toBe("Client Meeting");
    expect(eventSelect.classes()).not.toContain("input-error");
  });

  it("keeps subtotal and total independent when user inputs values", async () => {
    const receipt = {
      ...baseReceipt,
      amount: "112.00",
      subtotal: "100.00",
      tax: "12.00",
    };
    const wrapper = mount(ScannedReceiptsList, {
      props: {
        receipts: [receipt],
        categories: [{ id: 1, name: "Meals" }],
      },
    });

    const numberInputs = wrapper.findAll("input[type='number']");
    // Find subtotal input (v-model receipt.subtotal)
    const subtotalInput = numberInputs.find((w) => w.element.value === "100.00" || w.element.value === "100");
    const totalInput = numberInputs.find((w) => w.element.value === "112.00" || w.element.value === "112");

    expect(subtotalInput).toBeDefined();
    expect(totalInput).toBeDefined();

    // Change subtotal manually
    await subtotalInput.setValue("105.00");
    // Total should remain intact (not auto-overwritten)
    expect(Number(receipt.subtotal)).toBe(105);
    expect(Number(receipt.amount)).toBe(112);

    // Change total manually
    await totalInput.setValue("120.00");
    // Subtotal should remain intact (not auto-overwritten by VAT formula)
    expect(Number(receipt.amount)).toBe(120);
    expect(Number(receipt.subtotal)).toBe(105);
  });
});
