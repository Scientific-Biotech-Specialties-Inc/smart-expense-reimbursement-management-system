// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import ReceiptUploadModal from "@/components/expenses/ReceiptUploadModal.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";

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

const {
  mockLocalReceipts,
  mockQualityRejection,
  mockClearQualityRejection,
  mockClearDraftReceipts,
  mockAbortSessionReceipts,
  mockHandleConfirmLeave,
  mockUnsavedState,
} = vi.hoisted(() => ({
  mockLocalReceipts: { ref: null },
  mockQualityRejection: { ref: null },
  mockClearQualityRejection: vi.fn(),
  mockClearDraftReceipts: vi.fn(),
  mockAbortSessionReceipts: vi.fn(),
  mockHandleConfirmLeave: vi.fn(),
  mockUnsavedState: { isDirtyRef: null, isSubmittedRef: null },
}));

vi.mock("@/composables/reimbursements/useReceiptUploads", async () => {
  const { ref: vueRef } = await import("vue");
  mockLocalReceipts.ref = vueRef([]);
  mockQualityRejection.ref = vueRef(null);
  return {
    useReceiptUploads: () => ({
      localReceipts: mockLocalReceipts.ref,
      receiptDrag: vueRef(false),
      receiptInput: vueRef(null),
      handleReceiptDrop: vi.fn(),
      handleReceiptSelect: vi.fn(),
      addReceiptFiles: vi.fn(),
      removeReceipt: vi.fn(),
      clearDraftReceipts: mockClearDraftReceipts,
      abortSessionReceipts: mockAbortSessionReceipts,
      qualityRejection: mockQualityRejection.ref,
      clearQualityRejection: mockClearQualityRejection,
      showSegmentedUpload: vueRef(false),
      continueAnyway: vi.fn(),
      submitSegments: vi.fn(),
    }),
  };
});

vi.mock("@/composables/useUnsavedChanges", () => ({
  useUnsavedChanges: (isDirtyRef, isSubmittedRef) => {
    mockUnsavedState.isDirtyRef = isDirtyRef;
    mockUnsavedState.isSubmittedRef = isSubmittedRef;
    return {
      showConfirmModal: false,
      handleConfirmLeave: mockHandleConfirmLeave,
      handleCancelLeave: vi.fn(),
      dismissWithConfirm: (cb) => cb(),
    };
  },
}));

const stubs = {
  ConfirmModal: true,
  CurrencySelect: true,
  ScannedReceiptsList: true,
  SegmentedReceiptUpload: true,
  ReceiptQualityRejectionModal: {
    name: "ReceiptQualityRejectionModal",
    props: ["isOpen", "rejectionCode", "rejectionReason"],
    emits: ["close", "retake", "upload-segmented"],
    template: `<div class="quality-modal-stub" :data-open="isOpen" />`,
  },
};

function mountModal(props = {}) {
  return mount(ReceiptUploadModal, {
    props: { modelValue: true, categories: [], ...props },
    global: { stubs },
  });
}

describe("ReceiptUploadModal — BUG 2 (OCR auto-trigger)", () => {
  it("buildUpdatePayload does NOT force status='processed' and maps subtotal & event_type", () => {
    const wrapper = mountModal();
    const fakeReceipt = {
      id: "temp-1",
      dbId: 1,
      invoiceNumber: "INV-1",
      date: "2026-06-01",
      tin: "123-456-789",
      merchantName: "Vendor",
      categoryId: 2,
      eventType: "Client Meeting",
      subtotal: 89.29,
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
    expect(payload.subtotal).toBe("89.29");
    expect(payload.event_type).toBe("Client Meeting");
    expect(payload.location).toBe("Manila");
  });
});

function makeEditableReceipt(overrides = {}) {
  return {
    id: "RCPT-2026-001",
    dbId: 1,
    status: "processed",
    fileName: "receipt.png",
    fileType: "image/png",
    invoiceNumber: "INV-1",
    date: "2026-06-01",
    tin: "123-456-789-000",
    vendorName: "Vendor",
    location: "Manila",
    categoryId: 2,
    eventType: "",
    vatClassification: "vat",
    discountType: "none",
    discountAmount: 0,
    subtotal: 89.29,
    vatAmount: 10.71,
    amount: 100,
    currency: "PHP",
    items: [{ name: "Meal", qty: 2, price: 50 }],
    ...overrides,
  };
}

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
      receiptToEdit: makeEditableReceipt({ status: "processing" }),
    });

    const events = [];
    const handler = (e) => events.push(e);
    window.addEventListener("receipt-duplicate-detected", handler);

    await wrapper.vm.saveReceipt();

    window.removeEventListener("receipt-duplicate-detected", handler);

    expect(mockStore.resubmitReceipt).toHaveBeenCalledTimes(1);
    expect(mockStore.resubmitReceipt).toHaveBeenCalledWith(
      "RCPT-2026-001",
      expect.objectContaining({
        subtotal: "89.29",
        event_type: null,
      }),
      null,
    );
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
      receiptToEdit: makeEditableReceipt({ status: "processing" }),
    });

    const events = [];
    const handler = (e) => events.push(e);
    window.addEventListener("receipt-duplicate-detected", handler);

    await wrapper.vm.saveReceipt();

    window.removeEventListener("receipt-duplicate-detected", handler);

    expect(mockStore.resubmitReceipt).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
  });
});

describe("ReceiptUploadModal — strict rejection gating and modal close", () => {
  beforeEach(() => {
    mockLocalReceipts.ref.value = [];
    mockQualityRejection.ref.value = null;
    mockClearQualityRejection.mockClear();
  });

  it("blocks Save Receipt (canSaveNew) when any receipt has isRejected=true or status='rejected'", async () => {
    const wrapper = mountModal();
    mockLocalReceipts.ref.value = [
      {
        id: 10,
        date: "2026-11-16",
        categoryId: 1,
        isUploading: false,
        isProcessing: false,
        isRejected: true,
      },
    ];
    await wrapper.vm.$nextTick();

    const saveBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Save Receipt"));
    expect(saveBtn).toBeDefined();
    expect(saveBtn.attributes("disabled")).toBeDefined();

    mockLocalReceipts.ref.value = [
      {
        id: 11,
        date: "2026-11-16",
        categoryId: 1,
        isUploading: false,
        isProcessing: false,
        isRejected: false,
        status: "rejected",
      },
    ];
    await wrapper.vm.$nextTick();
    expect(saveBtn.attributes("disabled")).toBeDefined();

    mockLocalReceipts.ref.value = [
      {
        id: 12,
        date: "2026-11-16",
        categoryId: 1,
        isUploading: false,
        isProcessing: false,
        isRejected: false,
        status: "processed",
      },
    ];
    await wrapper.vm.$nextTick();
    expect(saveBtn.attributes("disabled")).toBeUndefined();
  });

  it("wires @close on ReceiptQualityRejectionModal to clearQualityRejection and closes upload modal when no receipts remain", async () => {
    mockClearQualityRejection.mockClear();
    mockLocalReceipts.ref.value = [];
    const wrapper = mountModal();
    mockQualityRejection.ref.value = {
      receiptId: "temp-1",
      file: null,
      rejectionCode: "unreadable",
      rejectionReason: "Critical details unreadable.",
    };
    await wrapper.vm.$nextTick();

    const qualityModal = wrapper.findComponent({ name: "ReceiptQualityRejectionModal" });
    expect(qualityModal.exists()).toBe(true);
    expect(qualityModal.props("isOpen")).toBe(true);

    await qualityModal.vm.$emit("close");
    expect(mockClearQualityRejection).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("keeps ReceiptUploadModal open when @close fires on ReceiptQualityRejectionModal with existing receipts", async () => {
    mockClearQualityRejection.mockClear();
    mockLocalReceipts.ref.value = [
      { id: 1, merchantName: "Store", date: "2026-09-01", categoryId: 1, amount: 50 },
    ];
    const wrapper = mountModal();
    mockQualityRejection.ref.value = {
      receiptId: "temp-2",
      file: null,
      rejectionCode: "blurry",
      rejectionReason: "Image is blurry.",
    };
    await wrapper.vm.$nextTick();

    const qualityModal = wrapper.findComponent({ name: "ReceiptQualityRejectionModal" });
    await qualityModal.vm.$emit("close");
    expect(mockClearQualityRejection).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    mockLocalReceipts.ref.value = [];
  });

  it("enables Save Receipt and updates every expanded split receipt card on saveNewReceipt", async () => {
    mockStore.updateReceipt.mockReset();
    mockStore.updateReceipt.mockResolvedValue({ id: 1 });
    const wrapper = mountModal();

    mockLocalReceipts.ref.value = [
      {
        id: 21,
        merchantName: "Store A",
        date: "2026-11-20",
        categoryId: 1,
        amount: 120,
        tax: "12.86",
        vatClassification: "vat",
        isUploading: false,
        isProcessing: false,
        isRejected: false,
        status: "processed",
      },
      {
        id: 22,
        merchantName: "Store B",
        date: "2026-11-21",
        categoryId: 2,
        amount: 240,
        tax: "25.71",
        vatClassification: "vat",
        isUploading: false,
        isProcessing: false,
        isRejected: false,
        status: "processed",
      },
    ];
    await wrapper.vm.$nextTick();

    const saveBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Save Receipt"));
    expect(saveBtn.attributes("disabled")).toBeUndefined();

    await saveBtn.trigger("click");
    expect(mockStore.updateReceipt).toHaveBeenCalledTimes(2);
    expect(mockStore.updateReceipt).toHaveBeenNthCalledWith(1, 21, expect.objectContaining({ vendor_name: "Store A" }));
    expect(mockStore.updateReceipt).toHaveBeenNthCalledWith(2, 22, expect.objectContaining({ vendor_name: "Store B" }));
  });

  it("aborts and deletes backend draft receipts when discarding/closing without saving", async () => {
    mockAbortSessionReceipts.mockReset();
    mockClearDraftReceipts.mockReset();
    const wrapper = mountModal();

    mockLocalReceipts.ref.value = [
      {
        id: 42,
        date: "2026-11-22",
        categoryId: 1,
        isUploading: false,
        isProcessing: false,
        isRejected: false,
        status: "processed",
      },
    ];
    await wrapper.vm.$nextTick();

    const discardBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Discard All"));
    await discardBtn.trigger("click");

    expect(mockAbortSessionReceipts).toHaveBeenCalledTimes(1);
    expect(mockClearDraftReceipts).not.toHaveBeenCalled();
  });

  it("does NOT abort backend receipts when closing after saveNewReceipt succeeds", async () => {
    mockAbortSessionReceipts.mockReset();
    mockClearDraftReceipts.mockReset();
    mockStore.updateReceipt.mockReset();
    mockStore.updateReceipt.mockResolvedValue({ id: 55 });

    const wrapper = mountModal();
    mockLocalReceipts.ref.value = [
      {
        id: 55,
        merchantName: "Saved Store",
        date: "2026-11-22",
        categoryId: 1,
        amount: 100,
        tax: "10.71",
        vatClassification: "vat",
        isUploading: false,
        isProcessing: false,
        isRejected: false,
        status: "processed",
      },
    ];
    await wrapper.vm.$nextTick();

    const saveBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Save Receipt"));
    await saveBtn.trigger("click");

    expect(mockAbortSessionReceipts).not.toHaveBeenCalled();
    expect(mockClearDraftReceipts).toHaveBeenCalledTimes(1);
  });

  it("aborts backend draft receipts on ConfirmModal @confirm (route leave / discard confirm)", async () => {
    mockAbortSessionReceipts.mockReset();
    mockHandleConfirmLeave.mockReset();
    const wrapper = mountModal();

    const confirmModal = wrapper.findComponent({ name: "ConfirmModal" });
    await confirmModal.vm.$emit("confirm");

    expect(mockAbortSessionReceipts).toHaveBeenCalledTimes(1);
    expect(mockHandleConfirmLeave).toHaveBeenCalledTimes(1);
  });
});

describe("ReceiptUploadModal — Edit Mode (ScannedReceiptsList reuse)", () => {
  beforeEach(() => {
    mockStore.resubmitReceipt.mockReset();
    mockStore.retryOcr.mockReset();
    mockStore.fetchCategories.mockReset();
    mockAbortSessionReceipts.mockReset();
  });

  it("renders ScannedReceiptsList with allowRemove=false and requireEventType=false and removes legacy inclusive/exclusive text", () => {
    const wrapper = mountModal({
      categories: [{ id: 2, name: "Meals" }],
      receiptToEdit: makeEditableReceipt(),
    });

    const list = wrapper.findComponent(ScannedReceiptsList);
    expect(list.exists()).toBe(true);
    expect(list.props("allowRemove")).toBe(false);
    expect(list.props("requireEventType")).toBe(false);
    expect(list.props("receipts")).toHaveLength(1);

    const text = wrapper.text();
    expect(text).not.toContain("VAT-Inclusive");
    expect(text).not.toContain("VAT-Exclusive");
    expect(text).not.toContain("Inclusive VAT Amount");
    expect(text).not.toContain("Incl. VAT");
    expect(text).not.toContain("Expense Summary");
  });

  it("shows Cancel instead of Discard All and keeps Retry OCR in Edit Mode", async () => {
    mockStore.retryOcr.mockResolvedValue({ id: 1, status: "processing" });
    const wrapper = mountModal({
      categories: [{ id: 2, name: "Meals" }],
      receiptToEdit: makeEditableReceipt({ status: "processed" }),
    });

    const buttons = wrapper.findAll("button");
    const cancelBtn = buttons.find((b) => b.text().trim() === "Cancel");
    const discardBtn = buttons.find((b) => b.text().includes("Discard All"));
    const retryBtn = buttons.find((b) => b.text().includes("Retry OCR"));

    expect(cancelBtn).toBeDefined();
    expect(discardBtn).toBeUndefined();
    expect(retryBtn).toBeDefined();

    await retryBtn.trigger("click");
    expect(mockStore.retryOcr).toHaveBeenCalledWith(1);
  });

  it("does NOT mark form dirty (Unsaved Changes) when untouched in Edit Mode, and marks dirty when edited", async () => {
    const wrapper = mountModal({
      categories: [{ id: 2, name: "Meals" }],
      receiptToEdit: makeEditableReceipt(),
    });

    expect(wrapper.vm.isDirty).toBe(false);
    expect(mockUnsavedState.isDirtyRef.value).toBe(false);

    const cancelBtn = wrapper
      .findAll("button")
      .find((b) => b.text().trim() === "Cancel");
    await cancelBtn.trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);

    // Remount and mutate a draft field -> isDirty becomes true
    const dirtyWrapper = mountModal({
      categories: [{ id: 2, name: "Meals" }],
      receiptToEdit: makeEditableReceipt(),
    });
    dirtyWrapper.vm.editReceipts[0].merchantName = "Changed Merchant";
    await dirtyWrapper.vm.$nextTick();

    expect(dirtyWrapper.vm.isDirty).toBe(true);
    expect(mockUnsavedState.isDirtyRef.value).toBe(true);
  });

  it("validates core fields and allows saving without eventType", async () => {
    mockStore.resubmitReceipt.mockResolvedValue({
      id: "RCPT-2026-001",
      dbId: 1,
      status: "processed",
    });

    const wrapper = mountModal({
      categories: [{ id: 2, name: "Meals" }],
      receiptToEdit: makeEditableReceipt({ eventType: "", location: "" }),
    });

    const saveBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Save Receipt"));
    // Missing required core field `location` disables Save Receipt
    expect(saveBtn.attributes("disabled")).toBeDefined();

    await wrapper.vm.saveReceipt();
    expect(mockStore.resubmitReceipt).not.toHaveBeenCalled();

    // Fill `location` while keeping `eventType` empty -> valid and submittable
    wrapper.vm.editReceipts[0].location = "Makati";
    await wrapper.vm.$nextTick();
    expect(saveBtn.attributes("disabled")).toBeUndefined();

    await saveBtn.trigger("click");
    expect(mockStore.resubmitReceipt).toHaveBeenCalledTimes(1);
  });

  it("sends subtotal, currency, location, event_type, and items with quantity via resubmitReceipt", async () => {
    mockStore.resubmitReceipt.mockResolvedValue({
      id: "RCPT-2026-001",
      dbId: 1,
      status: "processed",
    });

    const wrapper = mountModal({
      categories: [{ id: 2, name: "Meals" }],
      receiptToEdit: makeEditableReceipt({
        eventType: "Client Meeting",
        currency: "USD",
        location: "BGC, Taguig",
        subtotal: 200,
        vatAmount: 24,
        amount: 224,
        items: [{ name: "Lunch", qty: 3, price: 224 }],
      }),
    });

    await wrapper.vm.saveReceipt();

    expect(mockStore.resubmitReceipt).toHaveBeenCalledWith(
      "RCPT-2026-001",
      expect.objectContaining({
        expense_category_id: 2,
        vendor_name: "Vendor",
        transaction_date: "2026-06-01",
        subtotal: "200.00",
        vat_amount: "24.00",
        total_amount: "224.00",
        currency: "USD",
        location: "BGC, Taguig",
        event_type: "Client Meeting",
        items: [{ name: "Lunch", quantity: 3, price: 224 }],
      }),
      null,
    );
  });

  it("constrains modal card height within viewport margins so header and footer do not clip", () => {
    const wrapper = mountModal({
      categories: [{ id: 2, name: "Meals" }],
      receiptToEdit: makeEditableReceipt(),
    });
    const overlay = wrapper.find(".fixed.inset-0");
    expect(overlay.exists()).toBe(true);
    expect(overlay.classes()).toContain("p-4");
    expect(overlay.classes()).toContain("sm:p-6");

    const card = overlay.find(".card");
    expect(card.exists()).toBe(true);
    expect(card.classes()).toContain("flex");
    expect(card.classes()).toContain("flex-col");
    expect(card.classes()).toContain("max-h-[calc(100vh-2rem)]");

    const scrollBody = card.find(".flex-1.min-h-0.overflow-y-auto");
    expect(scrollBody.exists()).toBe(true);
  });
});
