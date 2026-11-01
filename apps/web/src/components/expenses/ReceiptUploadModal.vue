<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useReceiptStore } from "@/stores/receipts";
import { useToast } from "@/composables/useToast";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import CurrencySelect from "@/components/base/CurrencySelect.vue";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import {
  buildReceiptUploadFormPrefill,
  canEditReceipt,
  itemsGrossAmount,
  receiptFinancials,
} from "@/utils/receiptUtils";
import {
  X,
  UploadCloud,
  FileText,
  ChevronDown,
  Save,
  Plus,
  Trash2,
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
  qualityRejection,
  clearQualityRejection,
  showSegmentedUpload,
  continueAnyway,
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
    requiredFieldsComplete.value,
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
      vat_classification: receipt.vatClassification,
      currency: receipt.currency,
      location: receipt.location,
      items: receipt.items,
    },
  });
  prefill.location = receipt.location || null;
  // If the user deliberately overrode a quality or non-receipt warning and filled
  // the details manually, promote the receipt status from 'rejected' to 'processed'.
  if (receipt.isQualityOverridden) {
    prefill.status = "processed";
  }
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
 * EDIT MODE — existing manual form + resubmitReceipt (unchanged)
 * ────────────────────────────────────────────────────────────── */
const uploadFile = ref(null);
const uploadFilePreview = ref("");
const uploadForm = ref({
  invoice_number: "",
  transaction_date: "",
  tin: "",
  vendor_name: "",
  expense_category_id: "",
  total_amount: "",
  vat_amount: "",
  vat_classification: "vat",
  currency: "",
  items: [],
});

const itemsGrossTotal = computed(() => itemsGrossAmount(uploadForm.value.items));

const receiptAmounts = computed(() =>
  receiptFinancials(
    { amount: Number(uploadForm.value.total_amount) || 0 },
    uploadForm.value.vat_classification,
  ),
);

const vatExclusiveSubtotal = computed(() => receiptAmounts.value.subtotal);

const validationErrors = computed(() => {
  const errors = [];

  if (!uploadFile.value && !props.receiptToEdit) {
    errors.push("Please select a receipt file.");
  }
  if (!uploadForm.value.invoice_number) {
    errors.push("Invoice number is required.");
  }
  if (!uploadForm.value.transaction_date) {
    errors.push("Transaction date is required.");
  }
  if (!uploadForm.value.tin) {
    errors.push("TIN number is required.");
  } else {
    const tinDigits = uploadForm.value.tin.replace(/\D/g, "");
    if (tinDigits.length < 9) {
      errors.push("TIN must contain at least 9 digits.");
    }
  }
  if (!uploadForm.value.vendor_name) {
    errors.push("Vendor name is required.");
  }
  if (!uploadForm.value.expense_category_id) {
    errors.push("Category is required.");
  }
  if (!uploadForm.value.vat_classification) {
    errors.push("VAT classification is required.");
  }
  if (
    uploadForm.value.total_amount === "" ||
    uploadForm.value.total_amount == null
  ) {
    errors.push("Total amount is required.");
  }
  if (
    uploadForm.value.vat_classification === "vat" &&
    (uploadForm.value.vat_amount === "" || uploadForm.value.vat_amount == null)
  ) {
    errors.push("VAT amount could not be computed.");
  }

  for (const item of uploadForm.value.items) {
    if (!item.name || !item.quantity || item.price === "" || item.price == null) {
      errors.push("All expense item fields are required.");
      break;
    }
  }

  return errors;
});

const isDirty = computed(() => {
  if (isEditMode.value) {
    return (
      uploadFile.value !== null ||
      uploadForm.value.invoice_number !== "" ||
      uploadForm.value.transaction_date !== "" ||
      uploadForm.value.tin !== "" ||
      uploadForm.value.vendor_name !== "" ||
      uploadForm.value.expense_category_id !== "" ||
      uploadForm.value.total_amount !== "" ||
      uploadForm.value.items.length > 0
    );
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

function recalculateUploadTotalFromItems() {
  if (uploadForm.value.items.length > 0) {
    const newGross = itemsGrossTotal.value;
    uploadForm.value.total_amount =
      newGross > 0 ? Number(newGross.toFixed(2)) : "";
  }
}

watch(
  [() => uploadForm.value.total_amount, () => uploadForm.value.vat_classification],
  () => {
    const amounts = receiptFinancials(
      { amount: Number(uploadForm.value.total_amount) || 0 },
      uploadForm.value.vat_classification,
    );

    uploadForm.value.vat_amount = amounts.vat.toFixed(2);
  },
  { immediate: true },
);

function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  } catch (e) {
    return "";
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      // Modal is closing — stop any in-flight OCR poll to avoid leaks.
      stopOcrPolling();
      return;
    }

    if (!props.categories.length) {
      await receiptsStore.fetchCategories();
    }

    if (isEditMode.value) {
      uploadFile.value = null;
      uploadFilePreview.value = props.receiptToEdit.thumbnail || "";
      uploadForm.value = {
        invoice_number: props.receiptToEdit.invoiceNumber || "",
        transaction_date: formatDateForInput(props.receiptToEdit.date),
        tin: props.receiptToEdit.tin || "",
        vendor_name: props.receiptToEdit.vendorName || "",
        expense_category_id: props.receiptToEdit.categoryId || "",
        total_amount: props.receiptToEdit.amount || "",
        vat_classification: props.receiptToEdit.vatClassification || "vat",
        currency: props.receiptToEdit.currency || "",
        vat_amount: receiptFinancials(
          { amount: Number(props.receiptToEdit.amount) || 0 },
          props.receiptToEdit.vatClassification || "vat",
        ).vat.toFixed(2),
        items: props.receiptToEdit.items?.length
          ? props.receiptToEdit.items.map((item) => ({ ...item }))
          : [],
      };
    } else {
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

function addItem() {
  uploadForm.value.items.push({
    name: "",
    quantity: 1,
    price: "",
  });
}

function removeItem(index) {
  uploadForm.value.items.splice(index, 1);
  recalculateUploadTotalFromItems();
}

function formatTIN(event) {
  let value = event.target.value.replace(/\D/g, "");
  let formatted = "";
  if (value.length > 0) formatted += value.substring(0, 3);
  if (value.length > 3) formatted += "-" + value.substring(3, 6);
  if (value.length > 6) formatted += "-" + value.substring(6, 9);
  if (value.length > 9) formatted += "-" + value.substring(9, 12);
  uploadForm.value.tin = formatted;
  event.target.value = formatted;
}

function resetUploadForm() {
  uploadFile.value = null;
  uploadFilePreview.value = "";

  uploadForm.value = {
    invoice_number: "",
    transaction_date: "",
    tin: "",
    vendor_name: "",
    expense_category_id: "",
    total_amount: "",
    vat_amount: "",
    vat_classification: "vat",
    currency: "",
    items: [],
  };
}

function close() {
  dismissWithConfirm(() => {
    if (isEditMode.value) {
      resetUploadForm();
    } else {
      clearDraftReceipts();
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
  if (props.receiptToEdit && !canEditReceipt(props.receiptToEdit)) {
    notify("This receipt's current status does not allow editing.", "error");
    return;
  }

  if (!isFormValid.value) {
    notify(validationErrors.value[0] || "Please fill in all required fields.", "error");
    return;
  }
  if (uploadForm.value.tin) {
    const tinRegex = /^\d{3}-\d{3}-\d{3}(?:-\d{3})?$/;
    if (!tinRegex.test(uploadForm.value.tin)) {
      notify("TIN must be in the format 000-000-000 or 000-000-000-000", "error");
      return;
    }
  }
  try {
    const payload = {
      expense_category_id: uploadForm.value.expense_category_id,
      vendor_name: uploadForm.value.vendor_name || null,
      transaction_date: uploadForm.value.transaction_date || null,
      total_amount: uploadForm.value.total_amount || null,
      vat_amount: uploadForm.value.vat_amount || null,
      tin: uploadForm.value.tin || null,
      invoice_number: uploadForm.value.invoice_number || null,
      vat_classification: uploadForm.value.vat_classification || null,
      currency: uploadForm.value.currency || null,
      items:
        uploadForm.value.items.length > 0 ? uploadForm.value.items : undefined,
    };

    if (props.receiptToEdit) {
      notify("Saving...");
      const updated = await receiptsStore.resubmitReceipt(
        props.receiptToEdit.id,
        payload,
        uploadFile.value,
      );

      // New-file resubmit that re-ran OCR → keep the modal open (mirrors the
      // Retry OCR flow) so isOcrProcessing locks the fields and the existing
      // poll + global toast reflect completion. Metadata-only edits and the
      // duplicate-flagged case fall through and close normally.
      if (uploadFile.value !== null && updated?.status === "processing") {
        notify(
          "OCR reprocessing started and will continue in the background.",
          "success",
        );
        startOcrPolling(props.receiptToEdit.dbId);
        return;
      }

      if (uploadFile.value !== null && updated?.status === "failed") {
        // OCR pipeline errored after the resubmit dispatch (AI service
        // unreachable, etc.). Surface it clearly and keep the modal open so the
        // user can click Retry OCR — rather than silently swallowing it.
        notify(
          updated?.rejectionReason ||
            "OCR processing failed. You can retry OCR.",
          "error",
        );
        return;
      }

      if (uploadFile.value !== null && updated?.status === "rejected") {
        // A resubmit that returns `rejected` is, by ReceiptService::resubmitReceipt,
        // always a duplicate (the only other rejection path is the async OCR callback,
        // which happens after this response). Surface it through the SAME unmistakable
        // DuplicateReceiptModal the new-upload flow uses, instead of only a silent
        // toast (BUG 1 fix). Keep the modal open so the user sees the flagged state.
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
    } else {
      notify("Uploading receipt...");
      await receiptsStore.uploadReceipt(uploadFile.value, payload);
      notify("Receipt uploaded and stored successfully.", "success");
    }
    isSubmitted.value = true;
    close();
  } catch (e) {
    notify(e.message || "Failed to upload receipt.", "error");
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

  // Safety net: clear the poll timer if the component is destroyed while open.
  onBeforeUnmount(stopOcrPolling);

  // Exposed for unit testing (buildUpdatePayload / saveReceipt) without
  // changing runtime behavior.
  defineExpose({ buildUpdatePayload, saveReceipt });
</script>

<template>
  <Transition name="modal">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      @click="close"
    >
      <div
        class="card w-full max-w-5xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300"
        @click.stop
      >
        <!-- Modal Header -->
        <div
          class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10"
        >
          <div class="flex items-center gap-3">
            <h2
              class="text-xl font-bold text-primary"
            >
              {{ isEditMode ? "Edit Receipt" : "Upload Receipt" }}
            </h2>
          </div>
          <button
            @click="close"
            class="p-2 text-slate-400 hover:text-primary transition-colors"
            :disabled="receiptsStore.isSaving"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- ───────── NEW UPLOAD MODE (OCR pipeline) ───────── -->
        <template v-if="!isEditMode">
          <div
            class="flex flex-col overflow-y-auto max-h-[75vh] md:max-h-[80vh]"
          >
            <!-- Upload actions -->
            <div
              class="px-6 py-4 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50"
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
              class="m-6"
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
              class="m-6"
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

        <!-- ───────── EDIT MODE (manual form, unchanged) ───────── -->
        <template v-else>
          <!-- OCR reprocessing lock banner -->
          <div
            v-if="isOcrProcessing"
            class="px-6 py-3 flex items-center gap-2 border-b border-accent/20 bg-accent-50 text-xs font-bold uppercase tracking-widest text-accent"
          >
            <span
              class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden="true"
            />
            OCR is reprocessing this receipt. Fields are locked until it finishes.
          </div>
          <!-- Modal Content (Two Columns) -->
          <div
            class="flex flex-col md:flex-row flex-1 overflow-y-auto max-h-[75vh] md:max-h-[80vh]"
          >
            <!-- Left Column: File Upload Area -->
            <div
              class="w-full md:w-[340px] p-6 bg-slate-50 border-r border-slate-100 flex flex-col items-center"
            >
              <div
                class="w-full aspect-[3/4] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative"
              >
                <!-- Preview of the existing on-file receipt image (read-only) with error fallback -->
                <BaseReceiptImage
                  :src="uploadFilePreview"
                  alt="Receipt preview"
                  :file-type="receiptToEdit?.fileType"
                  img-class="w-full h-full object-cover"
                  icon-size-class="w-7 h-7 text-primary/40"
                  badge-size-class="w-16 h-16 rounded-2xl"
                  :no-preview-text="receiptToEdit ? 'Receipt on file' : 'No file'"
                />
                <div
                  v-if="receiptsStore.isSaving"
                  class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/85 text-accent backdrop-blur-[1px]"
                >
                  <span
                    class="h-9 w-9 rounded-full border-2 border-current border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                  <span class="text-[10px] font-bold uppercase tracking-widest">
                    {{ receiptToEdit ? "Updating receipt..." : "Uploading receipt..." }}
                  </span>
                </div>
              </div>
              <p class="mt-4 text-[11px] text-slate-400">
                Receipt image is read-only and cannot be replaced.
              </p>
            </div>

            <!-- Right Column: Form Data -->
            <fieldset
              class="flex-1 p-6 space-y-6 border-0 min-w-0"
              :disabled="isOcrProcessing"
            >
              <!-- Form Grid -->
              <div class="grid grid-cols-2 gap-4">
                <div class="input-wrapper">
                  <label class="input-label"
                    >Invoice Number <span class="text-danger">*</span></label
                  >
                  <input
                    class="input"
                    type="text"
                    v-model="uploadForm.invoice_number"
                    placeholder="INV-2026-00001"
                  />
                </div>
                <div class="input-wrapper">
                  <label class="input-label"
                    >Date <span class="text-danger">*</span></label
                  >
                  <div class="relative">
                    <input
                      class="input"
                      type="date"
                      v-model="uploadForm.transaction_date"
                    />
                  </div>
                </div>
              </div>

              <div class="input-wrapper">
                <label class="input-label"
                  >TIN Number <span class="text-danger">*</span></label
                >
                <input
                  class="input"
                  type="text"
                  v-model="uploadForm.tin"
                  @input="formatTIN"
                  placeholder="000-000-000-000"
                  maxlength="15"
                />
              </div>

              <div class="input-wrapper">
                <label class="input-label"
                  >Vendor Name <span class="text-danger">*</span></label
                >
                <input
                  class="input"
                  type="text"
                  v-model="uploadForm.vendor_name"
                  placeholder="Enter vendor name"
                />
              </div>

              <div class="input-wrapper">
                <label class="input-label"
                  >Category <span class="text-danger">*</span></label
                >
                <div class="flex gap-3">
                  <div class="relative flex-1">
                    <select
                      class="input appearance-none cursor-pointer"
                      v-model="uploadForm.expense_category_id"
                    >
                      <option value="" disabled>Select category</option>
                      <option
                        v-for="cat in categories"
                        :key="cat.id"
                        :value="cat.id"
                      >
                        {{ cat.name }}
                      </option>
                    </select>
                    <ChevronDown
                      class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                  </div>
                </div>
              </div>

              <div class="input-wrapper">
                <label class="input-label"
                  >VAT Classification <span class="text-danger">*</span></label
                >
                <div class="relative">
                  <select
                    class="input appearance-none cursor-pointer"
                    v-model="uploadForm.vat_classification"
                  >
                    <option value="vat">VAT</option>
                    <option value="non-vat">Non-VAT</option>
                  </select>
                  <ChevronDown
                    class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
              </div>

              <!-- Currency -->
              <div class="input-wrapper">
                <label class="input-label">Currency</label>
                <div class="flex gap-3 items-center">
                  <div class="flex-1">
                  <CurrencySelect
                    v-model="uploadForm.currency"
                    :disabled="receiptsStore.isSaving || isOcrProcessing"
                  />
                  </div>
                </div>
              </div>

              <!-- Totals Inputs Section -->
              <div class="grid grid-cols-2 gap-4">
                <div class="input-wrapper">
                  <label class="input-label"
                    >Total Amount (VAT-Inclusive)
                    <span class="text-danger">*</span></label
                  >
                  <input
                    class="input"
                    type="number"
                    step="0.01"
                    min="0"
                    v-model="uploadForm.total_amount"
                    placeholder="0.00"
                  />
                </div>
                <div class="input-wrapper">
                  <label
                    class="input-label"
                    :class="{
                      'opacity-50': uploadForm.vat_classification === 'non-vat',
                    }"
                    >VAT Amount (Inclusive)
                    <span
                      v-if="uploadForm.vat_classification === 'vat'"
                      class="text-danger"
                      >*</span
                    ></label
                  >
                  <input
                    class="input disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-slate-50"
                    type="number"
                    step="0.01"
                    min="0"
                    v-model="uploadForm.vat_amount"
                    placeholder="0.00"
                    disabled
                  />
                </div>
              </div>

              <!-- Items Section -->
              <div class="pt-4 border-t border-slate-100">
                <div class="flex items-center justify-between mb-4">
                  <label class="input-label !mb-0">Expense Items</label>
                  <button
                    type="button"
                    @click="addItem"
                    class="btn btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                  >
                    <Plus class="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>

                <div class="space-y-3">
                  <div
                    v-for="(item, index) in uploadForm.items"
                    :key="index"
                    class="flex gap-3 items-end bg-slate-50 p-3 rounded-lg border border-slate-100"
                  >
                    <div class="flex-1 input-wrapper !mb-0">
                      <label class="input-label !text-[10px]"
                        >Item Name <span class="text-danger">*</span></label
                      >
                      <input
                        class="input !py-1.5 !text-sm"
                        type="text"
                        v-model="item.name"
                        placeholder="e.g. Office Supplies"
                      />
                    </div>
                    <div class="w-20 input-wrapper !mb-0">
                      <label class="input-label !text-[10px]"
                        >Qty <span class="text-danger">*</span></label
                      >
                      <input
                        class="input !py-1.5 !text-sm"
                        type="number"
                        min="1"
                        v-model="item.quantity"
                      />
                    </div>
                    <div class="w-28 input-wrapper !mb-0">
                      <label class="input-label !text-[10px]"
                        >Price (Incl. VAT)
                        <span class="text-danger">*</span></label
                      >
                      <input
                        class="input !py-1.5 !text-sm"
                        type="number"
                        step="0.01"
                        min="0"
                        v-model="item.price"
                        placeholder="0.00"
                        @input="recalculateUploadTotalFromItems"
                      />
                    </div>
                    <button
                      type="button"
                      @click="removeItem(index)"
                      class="p-2 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors mb-[2px]"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                  <div
                    v-if="uploadForm.items.length === 0"
                    class="text-center py-6 border border-dashed border-slate-200 rounded-lg text-slate-400 text-sm"
                  >
                    No items added yet.
                  </div>
                </div>
              </div>

              <!-- Expense Breakdown / Summary -->
              <div class="pt-4 border-t border-slate-100">
                <label class="input-label mb-4">Expense Summary</label>
                <div
                  class="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-3"
                >
                  <div class="flex justify-between text-sm">
                    <span class="text-slate-500">VAT-Exclusive Subtotal</span>
                    <span class="font-medium text-slate-700">{{
                      formatCurrency(vatExclusiveSubtotal)
                    }}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-slate-500">Inclusive VAT Amount</span>
                    <span class="font-medium text-slate-700">{{
                      formatCurrency(Number(uploadForm.vat_amount) || 0)
                    }}</span>
                  </div>
                  <div
                    class="pt-3 border-t border-slate-200 flex justify-between items-center"
                  >
                    <span class="font-bold text-slate-700">Total Amount</span>
                    <span class="text-2xl font-black text-primary">{{
                      formatCurrency(Number(uploadForm.total_amount) || 0)
                    }}</span>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>
        </template>

        <!-- Modal Footer -->
        <div
          class="px-6 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 sticky bottom-0"
        >
          <BaseButton
            v-if="isEditMode"
            variant="secondary"
            class="min-h-[42px] mr-auto"
            :loading="isRetryingOcr"
            :disabled="isRetryingOcr || receiptsStore.isSaving || props.receiptToEdit?.status === 'processing'"
            @click="handleRetryOcr"
          >
            <RefreshCw v-if="!isRetryingOcr" class="w-4 h-4" />
            {{ isRetryingOcr ? "Retrying..." : "Retry OCR" }}
          </BaseButton>

          <BaseButton
            variant="secondary"
            class="!px-8"
            :disabled="receiptsStore.isSaving"
            @click="close"
          >
            Discard All
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
    @confirm="handleConfirmLeave"
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
    @continue-anyway="continueAnyway()"
    @close="clearQualityRejection"
  />
</template>
