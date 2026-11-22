<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useReceiptStore } from "@/stores/receipts";
import { useToast } from "@/composables/useToast";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import {
  normalizeDiscountType,
  normalizeVatClassification,
  formatDateForInput,
  buildReceiptUploadFormPrefill,
  canEditReceipt,
  receiptFinancials,
} from "@/utils/receiptUtils";
import { truncateDecimal } from "@/utils/formatters";
import {
  X,
  UploadCloud,
  Save,
  Layers,
  RefreshCw,
} from "lucide-vue-next";

// OCR-driven upload pipeline (reused from the Reimbursement feature)
import { useReceiptUploads } from "@/composables/reimbursements/useReceiptUploads";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import SegmentedReceiptUpload from "@/components/reimbursements/SegmentedReceiptUpload.vue";
import ReceiptQualityRejectionModal from "@/components/reimbursements/ReceiptQualityRejectionModal.vue";
import { isOcrOfflineFailure } from "@/utils/ocrErrors";

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
  categories: {
    type: Array,
    default: () => [],
  },
  receiptToEdit: {
    type: Object,
    default: null,
  },
  pendingUpload: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["update:modelValue", "saved"]);

const receiptsStore = useReceiptStore();
const { addToast } = useToast();

function notify(message, type = "info") {
  addToast({ message, type });
}

const isEditMode = computed(() => !!props.receiptToEdit);
const isRetryingOcr = ref(false);

// Timer handle for the post-Retry-OCR status poll. Guarded so we never stack
// duplicate intervals if Retry OCR is clicked more than once.
const ocrPollTimer = ref(null);

// How often we re-GET the receipt while it is reprocessing. The external AI
// service genuinely takes time, so we poll rather than block the click.
const OCR_POLL_INTERVAL = 2500;

function stopOcrPolling() {
  if (ocrPollTimer.value !== null) {
    clearInterval(ocrPollTimer.value);
    ocrPollTimer.value = null;
  }
}

function startOcrPolling(id) {
  if (ocrPollTimer.value !== null) return; // already polling

  ocrPollTimer.value = setInterval(async () => {
    try {
      await receiptsStore.refreshReceipt(id);
      // The store mutates the same object referenced by props.receiptToEdit,
      // so its status is reactive. Stop as soon as the AI callback has flipped
      // it out of "processing" — fields unlock and the banner hides.
      if (props.receiptToEdit?.status !== "processing") {
        if (props.receiptToEdit?.status === "failed") {
          notify(
            props.receiptToEdit?.rejectionReason ||
              "OCR processing failed. You can retry OCR.",
            "error",
          );
        } else if (props.receiptToEdit) {
          initEditMode(props.receiptToEdit);
        }
        stopOcrPolling();
      }
    } catch (e) {
      // Stop on error to avoid hammering the API; the user can retry OCR.
      stopOcrPolling();
      notify(e.message || "Failed to refresh receipt status.", "error");
    }
  }, OCR_POLL_INTERVAL);
}

// True when editing an existing receipt whose OCR is currently (re)processing.
// Reactively tracks props.receiptToEdit.status (the store mutates the same
// mapped object via Object.assign, so this stays in sync after Retry OCR).
const isOcrProcessing = computed(
  () => isEditMode.value && props.receiptToEdit?.status === "processing",
);

/* ──────────────────────────────────────────────────────────────
 * NEW UPLOAD MODE — OCR pipeline (mirrors the Reimbursement feature)
 * ────────────────────────────────────────────────────────────── */
const {
  localReceipts,
  receiptDrag,
  receiptInput,
  handleReceiptDrop,
  handleReceiptSelect,
  addReceiptFiles,
  removeReceipt,
  clearDraftReceipts,
  abortSessionReceipts,
  qualityRejection,
  clearQualityRejection,
  showSegmentedUpload,
  submitSegments,
} = useReceiptUploads({ draftKey: "serms_expense_draft_receipts" });

function handleRetake() {
  if (qualityRejection.value?.receiptId) {
    removeReceipt({ id: qualityRejection.value.receiptId });
  }
  clearQualityRejection();
  setTimeout(() => receiptInput.value?.click(), 100);
}

// Never open the quality modal for OCR-offline failures. Toast is enough.
const showQualityModal = computed(
  () =>
    !!qualityRejection.value &&
    !isOcrOfflineFailure({
      rejectionCode: qualityRejection.value?.rejectionCode,
      rejectionReason: qualityRejection.value?.rejectionReason,
    }),
);

const allOcrComplete = computed(
  () =>
    localReceipts.value.length > 0 &&
    localReceipts.value.every((r) => !r.isUploading && !r.isProcessing),
);

const requiredFieldsComplete = computed(
  () =>
    localReceipts.value.length > 0 &&
    localReceipts.value.every((r) => r.date && r.categoryId),
);

const canSaveNew = computed(
  () =>
    localReceipts.value.length > 0 &&
    allOcrComplete.value &&
    requiredFieldsComplete.value &&
    localReceipts.value.every((r) => !r.isRejected && r.status !== "rejected"),
);

// Map the camelCase OCR draft into the snake_case shape the util expects,
// then reuse buildReceiptUploadFormPrefill to build the PATCH payload.
function buildUpdatePayload(receipt) {
  const prefill = buildReceiptUploadFormPrefill({
    id: receipt.id,
    receiptData: {
      invoice_number: receipt.invoiceNumber,
      transaction_date: receipt.date,
      tin: receipt.tin,
      vendor_name: receipt.merchantName,
      expense_category_id: receipt.categoryId,
      total_amount: receipt.amount,
      vat_amount: receipt.tax,
      discount_amount: receipt.discountAmount,
      discount_type: receipt.discountType,
      vat_classification: receipt.vatClassification,
      currency: receipt.currency,
      location: receipt.location,
      items: receipt.items,
    },
  });
  prefill.location = receipt.location || null;
  prefill.subtotal =
    receipt.subtotal != null && receipt.subtotal !== ""
      ? Number(receipt.subtotal).toFixed(2)
      : null;
  prefill.event_type = receipt.eventType || null;
  // NOTE: We deliberately do NOT force `status = "processed"` by default here. The receipt
  // was created by ReceiptService::storeReceipt() with status `processing` and OCR
  // was already dispatched. Forcing `processed` would make the async AI OCR callback
  // hit OcrCallbackService's replay guard (which skips already-`processed` receipts)
  // and silently discard the extracted data, forcing a manual Retry OCR. Leaving the
  // status untouched lets updateReceipt keep it `processing` until the callback lands
  // and flips it to `processed`/applies the OCR data (BUG 2 fix).
  return prefill;
}

async function saveNewReceipt() {
  if (!canSaveNew.value) return;
  try {
    for (const receipt of localReceipts.value) {
      // Skip receipts that never got a real backend id (e.g. failed uploads).
      if (String(receipt.id).startsWith("temp-")) continue;
      const payload = buildUpdatePayload(receipt);
      // Commit My Expense draft so it becomes visible in the My Expenses grid.
      payload.is_draft = false;
      await receiptsStore.updateReceipt(receipt.dbId ?? receipt.id, payload);
    }
    notify("Receipt saved.", "success");
    isSubmitted.value = true;
    emit("saved");
    close();
  } catch (e) {
    notify(e.message || "Failed to save receipt.", "error");
  }
}

/* ──────────────────────────────────────────────────────────────
 * EDIT MODE — ScannedReceiptsList + resubmitReceipt
 * ────────────────────────────────────────────────────────────── */
const editReceipts = ref([]);
const editBaseline = ref("");

function mapReceiptToEditDraft(r) {
  const vatClassification = normalizeVatClassification(
    r.vatClassification ?? r.vat_classification,
  );
  const rawDiscount = Number(r.discountAmount ?? r.discount_amount ?? 0) || 0;
  const discountType = normalizeDiscountType(
    r.discountType ?? r.discount_type,
    rawDiscount,
  );
  const amountNum = Number(r.amount ?? r.total_amount ?? 0) || 0;
  const items = Array.isArray(r.items)
    ? r.items.map((item) => ({
        name: item.name || "",
        qty: Number(item.qty ?? item.quantity) || 1,
        price: Number(item.price) || 0,
      }))
    : [];
  const financials = receiptFinancials(
    {
      amount: amountNum,
      items,
      discount_amount: rawDiscount,
      discount_type: discountType,
    },
    vatClassification,
  );

  const rawSubtotal = r.subtotal;
  const resolvedSubtotal =
    rawSubtotal != null && rawSubtotal !== ""
      ? Number(rawSubtotal).toFixed(2)
      : amountNum > 0
        ? financials.subtotal.toFixed(2)
        : "";

  const rawVat = r.vatAmount ?? r.vat_amount;
  const resolvedTax =
    rawVat != null && rawVat !== ""
      ? Number(rawVat).toFixed(2)
      : vatClassification === "non-vat"
        ? "0.00"
        : amountNum > 0
          ? financials.vat.toFixed(2)
          : "";

  const rawImages =
    Array.isArray(r.images) && r.images.length > 1
      ? r.images
      : Array.isArray(r.file_url) && r.file_url.length > 1
        ? r.file_url
        : Array.isArray(r.file_path) && r.file_path.length > 1
          ? r.file_path
          : null;

  return {
    id: r.id,
    dbId: r.dbId ?? null,
    fileName: r.fileName || r.vendorName || `Receipt-${r.dbId ?? r.id}`,
    fileType: r.fileType || r.file_type || "",
    thumbnail: r.thumbnail || null,
    images: rawImages,
    isMultiReceipt: Boolean(r.isMultiReceipt || (rawImages && rawImages.length > 1)),
    invoiceNumber: r.invoiceNumber ?? r.invoice_number ?? "",
    date: formatDateForInput(r.date ?? r.transaction_date),
    tin: r.tin || "",
    merchantName: r.vendorName ?? r.merchantName ?? r.vendor_name ?? "",
    location: r.location || "",
    categoryId: r.categoryId ?? r.expense_category_id ?? "",
    category: r.category || "",
    eventType: r.eventType ?? r.event_type ?? "",
    items,
    currency: r.currency || "",
    vatClassification,
    discountType,
    discountAmount: rawDiscount > 0 ? rawDiscount.toFixed(2) : "0.00",
    subtotal: resolvedSubtotal,
    tax: resolvedTax,
    amount: amountNum > 0 ? Number(truncateDecimal(amountNum, 2)).toFixed(2) : "",
    validated: true,
  };
}

function serializeEditDraft(draft) {
  if (!draft) return "";
  return JSON.stringify({
    invoiceNumber: draft.invoiceNumber ?? "",
    date: draft.date ?? "",
    tin: draft.tin ?? "",
    merchantName: draft.merchantName ?? "",
    location: draft.location ?? "",
    categoryId: draft.categoryId ?? "",
    eventType: draft.eventType ?? "",
    currency: draft.currency ?? "",
    vatClassification: draft.vatClassification ?? "vat",
    discountType: draft.discountType ?? "none",
    discountAmount: String(draft.discountAmount ?? "0.00"),
    subtotal: String(draft.subtotal ?? ""),
    tax: String(draft.tax ?? ""),
    amount: String(draft.amount ?? ""),
    items: (draft.items || []).map((item) => ({
      name: item.name ?? "",
      qty: Number(item.qty) || 1,
      price: Number(item.price) || 0,
    })),
  });
}

function initEditMode(receipt) {
  const mapped = mapReceiptToEditDraft(receipt);
  editReceipts.value = [mapped];
  editBaseline.value = serializeEditDraft(mapped);
}

function resetEditState() {
  editReceipts.value = [];
  editBaseline.value = "";
}

const validationErrors = computed(() => {
  const errors = [];
  const draft = editReceipts.value[0];

  if (!draft) {
    errors.push("Receipt data is missing.");
    return errors;
  }
  if (!draft.invoiceNumber || !String(draft.invoiceNumber).trim()) {
    errors.push("Invoice number is required.");
  }
  if (!draft.date || !String(draft.date).trim()) {
    errors.push("Transaction date is required.");
  }
  if (!draft.tin || !String(draft.tin).trim()) {
    errors.push("TIN number is required.");
  } else {
    const tinDigits = String(draft.tin).replace(/\D/g, "");
    if (tinDigits.length < 9) {
      errors.push("TIN must contain at least 9 digits.");
    } else if (!/^\d{3}-\d{3}-\d{3}(?:-\d{3})?$/.test(String(draft.tin).trim())) {
      errors.push("TIN must be in the format 000-000-000 or 000-000-000-000.");
    }
  }
  if (!draft.merchantName || !String(draft.merchantName).trim()) {
    errors.push("Merchant name is required.");
  }
  if (!draft.location || !String(draft.location).trim()) {
    errors.push("Location is required.");
  }
  if (!draft.categoryId) {
    errors.push("Category is required.");
  }
  if (!draft.vatClassification) {
    errors.push("VAT classification is required.");
  }
  if (
    draft.subtotal === "" ||
    draft.subtotal == null ||
    Number(draft.subtotal) <= 0
  ) {
    errors.push("Subtotal must be greater than 0.");
  }
  if (
    draft.vatClassification === "vat" &&
    (draft.tax === "" || draft.tax == null)
  ) {
    errors.push("VAT amount is required.");
  }
  if (
    draft.amount === "" ||
    draft.amount == null ||
    Number(draft.amount) <= 0
  ) {
    errors.push("Total amount must be greater than 0.");
  }

  for (const item of draft.items || []) {
    if (
      !item.name ||
      !String(item.name).trim() ||
      !item.qty ||
      Number(item.qty) < 1 ||
      item.price === "" ||
      item.price == null ||
      Number(item.price) <= 0
    ) {
      errors.push("All expense items must have a name, quantity >= 1, and price > 0.");
      break;
    }
  }

  return errors;
});

const isDirty = computed(() => {
  if (isEditMode.value) {
    if (!editReceipts.value.length || !editBaseline.value) return false;
    return serializeEditDraft(editReceipts.value[0]) !== editBaseline.value;
  }
  return localReceipts.value.length > 0;
});

const isSubmitted = ref(false);

const {
  showConfirmModal,
  handleConfirmLeave,
  handleCancelLeave,
  dismissWithConfirm,
} = useUnsavedChanges(isDirty, isSubmitted);

watch(
  () => [props.modelValue, props.receiptToEdit],
  async ([open, receipt]) => {
    if (!open || !receipt) return;
    isSubmitted.value = false;
    initEditMode(receipt);
    if (!props.categories.length) {
      await receiptsStore.fetchCategories();
    }
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      // Modal is closing — stop any in-flight OCR poll to avoid leaks.
      stopOcrPolling();
      return;
    }

    isSubmitted.value = false;

    if (!props.categories.length) {
      await receiptsStore.fetchCategories();
    }

    if (!isEditMode.value) {
      // Start each NEW upload session with a clean OCR draft list.
      clearDraftReceipts();

      if (props.pendingUpload) {
        const { mode, files } = props.pendingUpload;
        if (mode === "multi" && files?.length >= 2) {
          submitSegments(files);
        } else if (files?.length) {
          addReceiptFiles([files[0]]);
        }
      }
    }
  },
);

const isFormValid = computed(() => validationErrors.value.length === 0);

function onConfirmLeave() {
  if (!isEditMode.value && !isSubmitted.value) {
    abortSessionReceipts();
  }
  handleConfirmLeave();
}

function close() {
  dismissWithConfirm(() => {
    if (isEditMode.value) {
      resetEditState();
    } else {
      if (!isSubmitted.value) {
        abortSessionReceipts();
      } else {
        clearDraftReceipts();
      }
      clearQualityRejection();
    }
    emit("update:modelValue", false);
  });
}

async function handleRetryOcr() {
  if (!props.receiptToEdit) return;
  const id = props.receiptToEdit.dbId;
  if (!id) return;

  isRetryingOcr.value = true;
  try {
    await receiptsStore.retryOcr(id);
    notify(
      "OCR reprocessing started and will continue in the background. You may close this dialog.",
      "success",
    );
    // Poll the receipt status so the modal reflects completion (fields unlock,
    // banner hides) as soon as the external AI callback lands.
    startOcrPolling(id);
  } catch (e) {
    notify(e.message || "Failed to retry OCR.", "error");
  } finally {
    isRetryingOcr.value = false;
  }
}

async function saveReceipt() {
  if (!props.receiptToEdit) return;

  if (!canEditReceipt(props.receiptToEdit)) {
    notify("This receipt's current status does not allow editing.", "error");
    return;
  }

  if (!isFormValid.value) {
    notify(validationErrors.value[0] || "Please fill in all required fields.", "error");
    return;
  }

  const draft = editReceipts.value[0];
  try {
    const discType = draft.discountType || "none";
    const discAmt = discType === "none" ? 0 : (Number(draft.discountAmount) || 0);
    const items = (draft.items || []).map((item) => ({
      name: String(item.name || "").trim(),
      quantity: Number(item.qty) || 1,
      price: Number(item.price) || 0,
    }));

    const payload = {
      expense_category_id: draft.categoryId,
      vendor_name: draft.merchantName || null,
      transaction_date: draft.date || null,
      total_amount:
        draft.amount !== "" && draft.amount != null
          ? Number(draft.amount).toFixed(2)
          : null,
      subtotal:
        draft.subtotal !== "" && draft.subtotal != null
          ? Number(draft.subtotal).toFixed(2)
          : null,
      vat_amount:
        draft.tax !== "" && draft.tax != null
          ? Number(draft.tax).toFixed(2)
          : null,
      discount_amount: discAmt.toFixed(2),
      discount_type: discType,
      tin: draft.tin || null,
      invoice_number: draft.invoiceNumber || null,
      location: draft.location || null,
      event_type: draft.eventType || null,
      vat_classification: draft.vatClassification || null,
      currency: draft.currency || null,
      items: items.length > 0 ? items : undefined,
    };

    notify("Saving...");
    const updated = await receiptsStore.resubmitReceipt(
      props.receiptToEdit.id,
      payload,
      null,
    );

    if (updated?.status === "processing") {
      notify(
        "OCR reprocessing started and will continue in the background.",
        "success",
      );
      startOcrPolling(props.receiptToEdit.dbId);
      return;
    }

    if (updated?.status === "failed") {
      notify(
        updated?.rejectionReason ||
          "OCR processing failed. You can retry OCR.",
        "error",
      );
      return;
    }

    if (updated?.status === "rejected") {
      const isDuplicate =
        updated?.rejectionCode === "duplicate" || updated?.ocrFlagged === true;

      if (isDuplicate) {
        window.dispatchEvent(
          new CustomEvent("receipt-duplicate-detected", {
            detail: {
              similarityScore: updated?.duplicateSimilarity || 1.0,
              receiptId: props.receiptToEdit?.dbId ?? props.receiptToEdit?.id,
              message:
                updated?.rejectionReason ||
                "This receipt was flagged as a duplicate and was not sent for OCR.",
            },
          }),
        );
        notify(
          "This receipt was flagged as a duplicate and was not sent for OCR.",
          "warning",
        );
        return;
      }

      notify(
        "This receipt was flagged and was not sent for OCR.",
        "warning",
      );
    } else {
      notify("Receipt updated.", "success");
    }

    isSubmitted.value = true;
    emit("saved");
    close();
  } catch (e) {
    notify(e.message || "Failed to update receipt.", "error");
  }
}

// Safety net: clear the poll timer if the component is destroyed while open.
onBeforeUnmount(() => {
  stopOcrPolling();
  if (!isEditMode.value && !isSubmitted.value) {
    abortSessionReceipts();
  }
});

// Exposed for unit testing (buildUpdatePayload / saveReceipt / editReceipts / isDirty)
// without changing runtime behavior.
defineExpose({ buildUpdatePayload, saveReceipt, editReceipts, isDirty });
</script>

<template>
  <Transition name="modal">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4 sm:p-6 md:p-8"
      @click="close"
    >
      <div
        class="card w-full max-w-5xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] md:max-h-[calc(100vh-4rem)] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300"
        @click.stop
      >
        <!-- Modal Header -->
        <div
          class="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10"
        >
          <div class="flex items-center gap-3 min-w-0">
            <h2
              class="text-lg sm:text-xl font-bold text-primary truncate"
            >
              {{ isEditMode ? "Edit Receipt" : "Upload Receipt" }}
            </h2>
          </div>
          <button
            @click="close"
            class="p-2 text-slate-400 hover:text-primary transition-colors shrink-0"
            :disabled="receiptsStore.isSaving"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- ───────── NEW UPLOAD MODE (OCR pipeline) ───────── -->
        <template v-if="!isEditMode">
          <div
            class="flex-1 min-h-0 flex flex-col overflow-y-auto"
          >
            <!-- Upload actions -->
            <div
              class="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50"
            >
              <input
                ref="receiptInput"
                type="file"
                class="hidden"
                accept=".jpeg,.jpg,.png,.pdf"
                @change="handleReceiptSelect"
              />
              <button
                type="button"
                class="btn btn-primary min-h-[42px]"
                :disabled="receiptsStore.isSaving"
                @click="receiptInput?.click()"
              >
                <UploadCloud class="w-4 h-4" />
                Single Receipt
              </button>
              <button
                type="button"
                class="btn btn-secondary min-h-[42px]"
                :disabled="receiptsStore.isSaving"
                @click="showSegmentedUpload = true"
              >
                <Layers class="w-4 h-4" />
                Multi Receipt
              </button>
              <p class="text-xs text-slate-400">
                JPEG, PNG, or PDF (max 2MB). Receipt data is extracted
                automatically.
              </p>
            </div>

            <!-- Segmented Upload Panel -->
            <SegmentedReceiptUpload
              v-if="showSegmentedUpload"
              class="m-3 sm:m-6"
              @submit-segments="
                (files) => {
                  submitSegments(files);
                  showSegmentedUpload = false;
                }
              "
              @cancel="showSegmentedUpload = false"
            />

            <!-- Scanned Receipts review surface -->
            <ScannedReceiptsList
              v-if="localReceipts.length"
              :receipts="localReceipts"
              :categories="categories"
              :allow-remove="true"
              class="m-3 sm:m-6"
              @remove-receipt="removeReceipt"
            />

            <!-- Empty state -->
            <div
              v-else
              class="px-6 py-16 flex flex-col items-center text-center text-slate-400"
            >
              <UploadCloud class="w-10 h-10 mx-auto opacity-30 mb-3" />
              <p class="text-sm font-semibold text-slate-500">
                No receipt selected yet
              </p>
              <p class="text-xs mt-1">
                Select a file above to start automatic OCR extraction.
              </p>
            </div>
          </div>
        </template>

        <!-- ───────── EDIT MODE (ScannedReceiptsList reuse) ───────── -->
        <template v-else>
          <!-- OCR reprocessing lock banner -->
          <div
            v-if="isOcrProcessing"
            class="shrink-0 px-4 sm:px-6 py-3 flex items-center gap-2 border-b border-accent/20 bg-accent-50 text-xs font-bold uppercase tracking-widest text-accent"
          >
            <span
              class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0"
              aria-hidden="true"
            />
            <span>OCR is reprocessing this receipt. Fields are locked until it finishes.</span>
          </div>
          <!-- Modal Content -->
          <div
            class="flex-1 min-h-0 flex flex-col overflow-y-auto"
          >
            <ScannedReceiptsList
              v-if="editReceipts.length"
              :receipts="editReceipts"
              :categories="categories"
              :allow-remove="false"
              :require-event-type="false"
              :disabled="isOcrProcessing || receiptsStore.isSaving"
              class="m-3 sm:m-6"
            />
          </div>
        </template>

        <!-- Modal Footer -->
        <div
          class="shrink-0 px-4 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3"
        >
          <BaseButton
            v-if="isEditMode"
            variant="secondary"
            class="min-h-[42px] w-full sm:w-auto sm:mr-auto"
            :loading="isRetryingOcr"
            :disabled="isRetryingOcr || receiptsStore.isSaving || props.receiptToEdit?.status === 'processing'"
            @click="handleRetryOcr"
          >
            <RefreshCw v-if="!isRetryingOcr" class="w-4 h-4" />
            {{ isRetryingOcr ? "Retrying..." : "Retry OCR" }}
          </BaseButton>

          <BaseButton
            variant="secondary"
            class="!px-8 w-full sm:w-auto"
            :disabled="receiptsStore.isSaving"
            @click="close"
          >
            {{ isEditMode ? "Cancel" : "Discard All" }}
          </BaseButton>

          <BaseButton
            v-if="!isEditMode"
            variant="primary"
            class="min-h-[42px] w-full sm:w-fit"
            :loading="receiptsStore.isSaving"
            :disabled="receiptsStore.isSaving || !canSaveNew"
            @click="saveNewReceipt"
          >
            <Save v-if="!receiptsStore.isSaving" class="w-4 h-4" />
            {{ receiptsStore.isSaving ? "Saving..." : "Save Receipt" }}
          </BaseButton>

          <BaseButton
            v-else
            variant="primary"
            class="min-h-[42px] w-full sm:w-fit"
            :loading="receiptsStore.isSaving"
            :disabled="receiptsStore.isSaving || !isFormValid || isOcrProcessing"
            @click="saveReceipt"
          >
            <Save v-if="!receiptsStore.isSaving" class="w-4 h-4" />
            {{
              receiptsStore.isSaving
                ? receiptToEdit
                  ? "Updating..."
                  : "Uploading..."
                : "Save Receipt"
            }}
          </BaseButton>
        </div>
      </div>
    </div>
  </Transition>

  <ConfirmModal
    :is-open="showConfirmModal"
    title="Unsaved Changes"
    message="You have unsaved changes in your receipt upload. Are you sure you want to discard them?"
    confirm-text="Discard"
    cancel-text="Keep Editing"
    :danger="true"
    @confirm="onConfirmLeave"
    @close="handleCancelLeave"
  />

  <!-- Quality rejection handling (NEW upload mode only) -->
  <ReceiptQualityRejectionModal
    v-if="!isEditMode"
    :is-open="showQualityModal"
    :rejected-file="qualityRejection?.file ?? null"
    :rejection-code="qualityRejection?.rejectionCode ?? ''"
    :rejection-reason="qualityRejection?.rejectionReason ?? ''"
    :show-segmented-option="qualityRejection?.rejectionCode === 'too_small'"
    @retake="handleRetake"
    @upload-segmented="
      showSegmentedUpload = true;
      clearQualityRejection();
    "
    @close="clearQualityRejection"
  />
</template>
