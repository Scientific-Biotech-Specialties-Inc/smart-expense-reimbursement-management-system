// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import FileUpload from "./FileUpload.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";

const { apiFetchMock, addToastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  addToastMock: vi.fn(),
}));

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: addToastMock }),
}));

describe("FileUpload — Liquidation OCR missing fields warning", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:mock-preview");
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("highlights unprefilled fields in red in ScannedReceiptsList after liquidation OCR completes and clears warning on input", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 901,
          status: "processed",
          vendor_name: "THE FRESH FARMER",
          transaction_date: "2018-05-29",
          invoice_number: "",
          tin: "",
          location: "1468 Tanglewood Road, Memphis, MS",
          total_amount: 18.92,
          vat_amount: 1.23,
          vat_classification: "vat",
          expense_category_id: 1,
          ocr_confidence_score: 0.92,
        },
      }),
    });

    const Wrapper = {
      components: { FileUpload, ScannedReceiptsList },
      setup() {
        const receipts = ref([]);
        const categories = [{ id: 1, name: "Meals" }];
        return { receipts, categories };
      },
      template: `
        <div>
          <FileUpload v-model="receipts" />
          <ScannedReceiptsList
            v-if="receipts.length > 0"
            :receipts="receipts"
            :categories="categories"
          />
        </div>
      `,
    };

    const wrapper = mount(Wrapper, {
      global: {
        stubs: {
          ConfirmModal: true,
          ReceiptQualityRejectionModal: true,
          ReceiptImagePreview: true,
          CurrencySelect: true,
        },
      },
    });

    const fileUpload = wrapper.findComponent(FileUpload);
    const file = new File(["img"], "receipt-12.jpg", { type: "image/jpeg" });

    fileUpload.vm.processFiles([file], "single");
    await flushPromises();
    await nextTick();

    const receipt = wrapper.vm.receipts[0];
    expect(receipt.ocrStatus).toBe("done");
    expect(receipt.hasOcrReturned).toBe(true);

    // Unprefilled fields show red warning text and input-error class
    const text = wrapper.text();
    expect(text).toContain("Invoice number is required");
    expect(text).toContain("TIN number is required");
    expect(text).toContain("Type of event is required");

    // Prefilled fields do NOT show red warning text
    expect(text).not.toContain("Date is required");
    expect(text).not.toContain("Merchant name is required");
    expect(text).not.toContain("Location is required");
    expect(text).not.toContain("Category is required");
    expect(text).not.toContain("Subtotal is required");
    expect(text).not.toContain("Total amount is required");

    // Warning toast is triggered listing missing required fields
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        message: expect.stringMatching(/Invoice Number.*TIN Number|TIN Number.*Invoice Number/),
      }),
    );

    // Entering the missing invoice number removes its red warning immediately
    const invoiceInput = wrapper.findAll("input[type='text']")[0];
    expect(invoiceInput.classes()).toContain("input-error");
    await invoiceInput.setValue("INV-1234");
    await nextTick();
    expect(invoiceInput.classes()).not.toContain("input-error");
    expect(wrapper.text()).not.toContain("Invoice number is required");
  });

  it("does not highlight missing fields while OCR is still processing", async () => {
    let resolveScan;
    apiFetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveScan = resolve;
      }),
    );

    const Wrapper = {
      components: { FileUpload, ScannedReceiptsList },
      setup() {
        const receipts = ref([]);
        return { receipts };
      },
      template: `
        <div>
          <FileUpload v-model="receipts" />
          <ScannedReceiptsList v-if="receipts.length > 0" :receipts="receipts" :categories="[]" />
        </div>
      `,
    };

    const wrapper = mount(Wrapper, {
      global: {
        stubs: {
          ConfirmModal: true,
          ReceiptQualityRejectionModal: true,
          ReceiptImagePreview: true,
          CurrencySelect: true,
        },
      },
    });

    const file = new File(["img"], "receipt-pending.jpg", { type: "image/jpeg" });
    wrapper.findComponent(FileUpload).vm.processFiles([file], "single");
    await nextTick();

    expect(wrapper.vm.receipts[0].ocrStatus).toBe("processing");
    expect(wrapper.vm.receipts[0].hasOcrReturned).toBe(false);
    expect(wrapper.findAll(".input-error")).toHaveLength(0);

    resolveScan({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 902,
          status: "processed",
          vendor_name: "Test Shop",
          transaction_date: "2026-10-15",
          invoice_number: "OR-55",
          tin: "123-456-789-000",
          location: "Manila",
          total_amount: 100,
          vat_amount: 10.71,
          expense_category_id: 1,
        },
      }),
    });
    await flushPromises();
    await nextTick();
  });

  it("dispatches liquidation duplicate event with localId and removes entry on remove-duplicate-receipt", async () => {
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        message: "Duplicate detected. A receipt with this file hash already exists.",
      }),
    });

    const dupEvents = [];
    const onDup = (e) => dupEvents.push(e.detail);
    window.addEventListener("receipt-duplicate-detected", onDup);

    const receipts = ref([]);
    const wrapper = mount(
      {
        components: { FileUpload },
        setup: () => ({ receipts }),
        template: `<FileUpload v-model="receipts" />`,
      },
      {
        global: {
          stubs: {
            ConfirmModal: true,
            ReceiptQualityRejectionModal: true,
          },
        },
      },
    );

    const file = new File(["img"], "dup.jpg", { type: "image/jpeg" });
    wrapper.findComponent(FileUpload).vm.processFiles([file], "single");
    await flushPromises();
    await nextTick();

    expect(wrapper.vm.receipts).toHaveLength(1);
    expect(dupEvents).toHaveLength(1);
    expect(dupEvents[0].source).toBe("liquidation");
    expect(dupEvents[0].receiptId).toBeTruthy();

    window.dispatchEvent(
      new CustomEvent("remove-duplicate-receipt", {
        detail: { receiptId: dupEvents[0].receiptId },
      }),
    );
    await flushPromises();
    await nextTick();

    expect(wrapper.vm.receipts).toHaveLength(0);
    window.removeEventListener("receipt-duplicate-detected", onDup);
    wrapper.unmount();
  });
});
