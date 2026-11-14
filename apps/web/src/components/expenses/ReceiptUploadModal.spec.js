// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ReceiptUploadModal from "@/components/expenses/ReceiptUploadModal.vue";

// Mock the stores/composables the component pulls in at setup so the test focuses
// on the component's own logic (buildUpdatePayload / saveReceipt) without hitting
// real HTTP, sessionStorage, or window listeners from the upload composable.
const mockStore = {
  isSaving: false,
  isLoading: false,
  fetchCategories: vi.fn(),
  updateReceipt: vi.fn(),
  resubmitReceipt: vi.fn(),
  uploadReceipt: vi.fn(),
  retryOcr: vi.fn(),
  refreshReceipt: vi.fn(),
};

vi.mock("@/stores/receipts", () => ({
  useReceiptStore: () => mockStore,
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/composables/reimbursements/useReceiptUploads", () => ({
  useReceiptUploads: () => ({
    localReceipts: { value: [] },
    receiptDrag: { value: false },
    receiptInput: { value: null },
    handleReceiptDrop: vi.fn(),
    handleReceiptSelect: vi.fn(),
    addReceiptFiles: vi.fn(),
    removeReceipt: vi.fn(),
    clearDraftReceipts: vi.fn(),
    qualityRejection: { value: null },
    clearQualityRejection: vi.fn(),
    showSegmentedUpload: { value: false },
    continueAnyway: vi.fn(),
    submitSegments: vi.fn(),
  }),
}));

vi.mock("@/composables/useUnsavedChanges", () => ({
  useUnsavedChanges: () => ({
    showConfirmModal: false,
    handleConfirmLeave: vi.fn(),
    handleCancelLeave: vi.fn(),
    dismissWithConfirm: (cb) => cb(),
  }),
}));

const stubs = {
  ConfirmModal: true,
  CurrencySelect: true,
  ScannedReceiptsList: true,
  SegmentedReceiptUpload: true,
  ReceiptQualityRejectionModal: true,
};

function mountModal(props = {}) {
  return mount(ReceiptUploadModal, {
    props: { modelValue: true, categories: [], ...props },
    global: { stubs },
  });
}

describe("ReceiptUploadModal — BUG 2 (OCR auto-trigger)", () => {
  it("buildUpdatePayload does NOT force status='processed'", () => {
    const wrapper = mountModal();
    const fakeReceipt = {
      id: "temp-1",
      dbId: 1,
      invoiceNumber: "INV-1",
      date: "2026-06-01",
      tin: "123-456-789",
      merchantName: "Vendor",
      categoryId: 2,
      amount: 100,
      tax: 12,
      vatClassification: "vat",
      currency: "PHP",
      location: "Manila",
      items: [],
    };

    const payload = wrapper.vm.buildUpdatePayload(fakeReceipt);

    // The receipt must remain `processing` (set by the backend storeReceipt) so the
    // async OCR callback is applied instead of being skipped by the replay guard.
    expect(payload.status).toBeUndefined();
    expect(payload).not.toHaveProperty("status", "processed");
  });
});

describe("ReceiptUploadModal — BUG 1 (duplicate surfaced in edit modal)", () => {
  beforeEach(() => {
    mockStore.resubmitReceipt.mockReset();
  });

  it("saveReceipt (edit-mode) dispatches receipt-duplicate-detected on a duplicate resubmit", async () => {
    const duplicateReceipt = {
      id: "RCPT-2026-001",
      dbId: 1,
      status: "rejected",
      ocrFlagged: true,
      rejectionCode: "duplicate",
      rejectionReason: "Duplicate receipt detected based on file hash.",
      duplicateSimilarity: null,
      vendorName: "Vendor",
      amount: 100,
    };
    mockStore.resubmitReceipt.mockResolvedValue(duplicateReceipt);

    const wrapper = mountModal({
      receiptToEdit: {
        id: "RCPT-2026-001",
        dbId: 1,
        status: "processing",
      },
    });

    // Simulate the user having selected a replacement file (edit-mode file branch).
    wrapper.vm.uploadFile = new File(["x"], "r.png", { type: "image/png" });

    // Fill the required form fields so isFormValid passes.
    Object.assign(wrapper.vm.uploadForm, {
      invoice_number: "INV-1",
      transaction_date: "2026-06-01",
      tin: "123-456-789-000",
      vendor_name: "Vendor",
      expense_category_id: 2,
      vat_classification: "vat",
      total_amount: 100,
      vat_amount: 12,
      items: [],
    });

    const events = [];
    const handler = (e) => events.push(e);
    window.addEventListener("receipt-duplicate-detected", handler);

    await wrapper.vm.saveReceipt();

    window.removeEventListener("receipt-duplicate-detected", handler);

    expect(mockStore.resubmitReceipt).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].detail.receiptId).toBe(1);
    expect(events[0].detail.message.toLowerCase()).toContain("duplicate");
  });

  it("saveReceipt (edit-mode) does NOT dispatch the duplicate event for a normal update", async () => {
    mockStore.resubmitReceipt.mockResolvedValue({
      id: "RCPT-2026-001",
      dbId: 1,
      status: "processed",
      ocrFlagged: false,
      rejectionCode: null,
      rejectionReason: null,
      vendorName: "Vendor",
      amount: 100,
    });

    const wrapper = mountModal({
      receiptToEdit: { id: "RCPT-2026-001", dbId: 1, status: "processing" },
    });

    wrapper.vm.uploadFile = new File(["x"], "r.png", { type: "image/png" });
    Object.assign(wrapper.vm.uploadForm, {
      invoice_number: "INV-1",
      transaction_date: "2026-06-01",
      tin: "123-456-789-000",
      vendor_name: "Vendor",
      expense_category_id: 2,
      vat_classification: "vat",
      total_amount: 100,
      vat_amount: 12,
      items: [],
    });

    const events = [];
    const handler = (e) => events.push(e);
    window.addEventListener("receipt-duplicate-detected", handler);

    await wrapper.vm.saveReceipt();

    window.removeEventListener("receipt-duplicate-detected", handler);

    expect(events).toHaveLength(0);
  });
});
