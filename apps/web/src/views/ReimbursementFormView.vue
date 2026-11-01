<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { usePolicyStore } from "@/stores/policy";
import { useReceiptStore } from "@/stores/receipts";
import { useReimbursementStore } from "@/stores/reimbursement";
import { useToast } from "@/composables/useToast";
import { Save, Send } from "lucide-vue-next";

// Components
import ReceiptsManagementHeader from "@/components/reimbursements/ReceiptsManagementHeader.vue";
import BaseToggleSwitch from "@/components/base/BaseToggleSwitch.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import MetaAndAttachments from "@/components/reimbursements/MetaAndAttachments.vue";
import ReimbursementSummaryPanel from "@/components/reimbursements/ReimbursementSummaryPanel.vue";
import ReimbursementFormHeader from "@/components/reimbursements/ReimbursementFormHeader.vue";
import ReceiptQualityRejectionModal from "@/components/reimbursements/ReceiptQualityRejectionModal.vue";
import SegmentedReceiptUpload from "@/components/reimbursements/SegmentedReceiptUpload.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";

// Composables
import { useReceiptUploads } from "@/composables/reimbursements/useReceiptUploads";
import { useOcrMode } from "@/composables/useOcrMode";
import { useReimbursementSubmit } from "@/composables/reimbursements/useReimbursementSubmit";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { isOcrOfflineFailure } from "@/utils/ocrErrors";

import {
  tinFor,
  cleanName,
  normalizeVatClassification,
  receiptFinancials,
  getItems,
  formatDateForInput,
} from "@/utils/receiptUtils";
import { getFileUrl } from "@/utils/fileUtils";

const props = defineProps({
  forwardedReceipts: {
    type: Array,
    default: () => [],
  },
  id: {
    type: [String, Number],
    default: null,
  },
});
const emit = defineEmits(["submitted", "close"]);

const policyStore = usePolicyStore();
const receiptsStore = useReceiptStore();
const reimbursementStore = useReimbursementStore();
const { addToast } = useToast();
const router = useRouter();

// State
const reportFile = ref(null);
const userComment = ref("");
const fetching = ref(false);
const existingStatus = ref("");
const adminNotes = ref("");
const revisionCount = ref(0);
const isReviseMode = computed(() => existingStatus.value === "revise");
const storedForwardedReceipts = ref([]);
const forwardedSource = ref("My Expense");
const FORWARDED_RECEIPTS_KEY = "serms_forwarded_reimbursement_receipts";
const LEGACY_LIQUIDATION_RECEIPTS_KEY = "serms_forwarded_liquidation_receipts";
const summaryCurrency = ref("PHP");

// OCR mode toggle — Real pipeline (default OFF) vs offline Mock OCR (ON).
const { isMockOcr, setMockMode } = useOcrMode();

// Form uploads and file management
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
  continueAnyway,
  submitWithForce,
  submitSegments,
} = useReceiptUploads();

const uploadMode = ref('single');

// Never open the quality modal for OCR-offline failures (e.g. OCR could not
// be started). Toast is enough — user stays on the reimbursement page.
const showQualityModal = computed(
  () =>
    !!qualityRejection.value &&
    !isOcrOfflineFailure({
      rejectionCode: qualityRejection.value?.rejectionCode,
      rejectionReason: qualityRejection.value?.rejectionReason,
    }),
);

function handleRetake() {
  if (qualityRejection.value?.receiptId) {
    removeReceipt({ id: qualityRejection.value.receiptId });
  }
  clearQualityRejection();
  setTimeout(() => {
    if (receiptInput.value) receiptInput.value.value = "";
    receiptInput.value?.click();
  }, 100);
}

function triggerUpload(mode = 'single') {
  uploadMode.value = mode;
  if (receiptInput.value) receiptInput.value.value = "";
  receiptInput.value?.click();
}

function onReceiptInputCancel() {
  // User dismissed the native file chooser without picking a file (e.g. after
  // DuplicateReceiptModal "Upload New One"). Reset so the same file can be
  // re-picked next time. When no receipts remain in create mode, return to the
  // Reimbursements list instead of stranding the user on an empty
  // /reimbursements/new page.
  if (receiptInput.value) receiptInput.value.value = "";
  if (!isEditMode.value && receipts.value.length === 0) {
    router.push("/reimbursements");
  }
}

function onReceiptSelect(e) {
  if (uploadMode.value === 'multi') {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      submitSegments(files);
    }
    if (e.target) e.target.value = '';
  } else {
    handleReceiptSelect(e);
  }
}

const receipts = computed(() => [
  ...props.forwardedReceipts,
  ...localReceipts.value,
]);

// Auto-sync summary currency if any receipt has a detected/selected currency
watch(
  receipts,
  (newReceipts) => {
    const foundCurrency = (newReceipts || []).find((r) => r && r.currency)?.currency;
    if (foundCurrency) {
      summaryCurrency.value = foundCurrency;
    }
  },
  { immediate: true, deep: true },
);

// Financials
const totalAmount = computed(() =>
  receipts.value.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
);
const totalVat = computed(() =>
  receipts.value.reduce((sum, r) => sum + (Number(r.tax) || 0), 0),
);
const totalSubtotal = computed(() => totalAmount.value - totalVat.value);

const canProceed = computed(
  () =>
    receipts.value.length >= 1 &&
    (isEditMode.value || reportFile.value) &&
    receipts.value.every(
      (r) =>
        !r.isUploading &&
        !r.isProcessing &&
        !r.isRejected &&
        !String(r.id || "").startsWith("temp-") &&
        r.date &&
        (isEditMode.value || r.categoryId) &&
        (isEditMode.value || r.eventType),
    ),
);

const isDirty = computed(() => {
  return receipts.value.length > 0 || reportFile.value !== null || userComment.value !== "";
});

const isSubmitted = ref(false);

const {
  showConfirmModal,
  handleConfirmLeave,
  handleCancelLeave,
  dismissWithConfirm
} = useUnsavedChanges(isDirty, isSubmitted);

function onConfirmLeave() {
  if (!isEditMode.value) {
    abortSessionReceipts();
  }
  handleConfirmLeave();
}

const isEditMode = computed(() => !!props.id);
const forwardedReceiptCount = computed(
  () => props.forwardedReceipts.length || storedForwardedReceipts.value.length,
);
const isForwardedMode = computed(() => forwardedReceiptCount.value > 0);
const isEmbeddedForwardedMode = computed(() => props.forwardedReceipts.length > 0);

// Form submission
const { submitting, submitReimbursement, updateReimbursement } = useReimbursementSubmit(
  emit,
  router,
);

const showSubmitConfirmModal = ref(false);

function promptSubmit() {
  showSubmitConfirmModal.value = true;
}

function handleConfirmSubmit() {
  showSubmitConfirmModal.value = false;
  handleSubmit();
}

function handleCancelSubmit() {
  showSubmitConfirmModal.value = false;
}

async function handleSubmit() {
  isSubmitted.value = true;
  try {
    let success = false;
    if (isEditMode.value) {
      success = await updateReimbursement(props.id, {
        receipts: receipts.value,
        reportFile: reportFile.value,
        totalAmount: totalAmount.value,
        userComment: userComment.value,
      });
    } else {
      success = await submitReimbursement({
        receipts: receipts.value,
        reportFile: reportFile.value,
        totalAmount: totalAmount.value,
        userComment: userComment.value,
      });
    }
    if (!success) {
      isSubmitted.value = false;
    } else {
      clearDraftReceipts();
    }
  } catch (error) {
    isSubmitted.value = false;
    throw error;
  }
}

// Lifecycle
const handleOpenReceiptUpload = () => {
  if (receiptInput.value) receiptInput.value.value = "";
  receiptInput.value?.click();
};

onMounted(async () => {
  policyStore.fetchAll();
  receiptsStore.fetchCategories();
  
  window.addEventListener('open-receipt-upload', handleOpenReceiptUpload);

  // Pick up files passed from the Reimbursements page via global
  const pendingUpload = window.__serms_pending_upload;
  const pendingFiles = window.__serms_pending_files;
  delete window.__serms_pending_upload;
  delete window.__serms_pending_files;

  if (!props.id && !props.forwardedReceipts.length) {
    if (pendingUpload?.mode === "multi" && pendingUpload.files?.length >= 2) {
      nextTick(() => {
        submitSegments(pendingUpload.files);
      });
    } else if (pendingUpload?.files?.length) {
      nextTick(() => {
        addReceiptFiles(pendingUpload.files);
      });
    } else if (pendingFiles?.length) {
      nextTick(() => {
        addReceiptFiles(pendingFiles);
      });
    }
  }

  if (isEditMode.value) {
    fetching.value = true;
    try {
      const data = await reimbursementStore.fetchOne(props.id);
      reportFile.value = data.report_file_path;
      userComment.value = data.user_comment || "";
      existingStatus.value = data.status || "";
      adminNotes.value = data.admin_notes || data.rejection_comment || "";
      revisionCount.value = data.revision_count || 1;
      
      if (data.receipts && Array.isArray(data.receipts)) {
        localReceipts.value = data.receipts.map((r) => {
          const amount = Number(r.total_amount) || 0;
          const vatClassification = normalizeVatClassification(
            r.vat_classification,
          );
          const items = (r.items || []).map((item) => ({
            name: item.name,
            qty: item.quantity,
            price: Number(item.price),
          }));
          const amounts = receiptFinancials(
            { amount, items },
            vatClassification,
          );

          let resolvedSubtotal = "";
          if (r.subtotal != null && r.subtotal !== "") {
            resolvedSubtotal = Number(r.subtotal).toFixed(2);
          } else if (amount > 0) {
            resolvedSubtotal = amounts.subtotal.toFixed(2);
          }

          const resolvedTax =
            r.vat_amount != null && r.vat_amount !== ""
              ? Number(r.vat_amount).toFixed(2)
              : (vatClassification === "non-vat" ? "0.00" : amounts.vat.toFixed(2));

          return {
            id: r.id,
            fileName: r.vendor_name || `Receipt-${r.id}`,
            fileType: r.file_type,
            merchantName: r.vendor_name,
            date: formatDateForInput(r.transaction_date),
            amount: amounts.gross,
            subtotal: resolvedSubtotal,
            tax: resolvedTax,
            vatClassification: amounts.vatClassification,
            tin: r.tin,
            invoiceNumber: r.invoice_number,
            location: r.location || "",
            category: r.category?.name || data.expense_category?.name || "",
            categoryId: r.expense_category_id || data.expense_category_id || null,
            eventType: r.event_type || data.event_type || "",
            thumbnail: getFileUrl(r.file_url || r.file_path) || null,
            items,
            isUploading: false,
          };
        });
      }
    } catch (error) {
      addToast({
        message: "Failed to load reimbursement details.",
        type: "error",
      });
      router.push("/reimbursements");
    } finally {
      fetching.value = false;
    }
  }

  const forwarded =
    sessionStorage.getItem(FORWARDED_RECEIPTS_KEY) ||
    sessionStorage.getItem(LEGACY_LIQUIDATION_RECEIPTS_KEY);

  if (!isEditMode.value && forwarded) {
    try {
      const parsed = JSON.parse(forwarded);
      storedForwardedReceipts.value = parsed;
      forwardedSource.value = sessionStorage.getItem(FORWARDED_RECEIPTS_KEY)
        ? "My Expense"
        : "Liquidation";
      localReceipts.value = parsed.map((r) => ({
        ...r,
        ...(() => {
          const amounts = receiptFinancials(r, r.vatClassification);
          let sub = "";
          if (r.subtotal != null && r.subtotal !== "") {
            sub = Number(r.subtotal).toFixed(2);
          } else if (amounts.gross > 0) {
            sub = amounts.subtotal.toFixed(2);
          }

          return {
            amount: amounts.gross,
            subtotal: sub,
            tax: r.tax != null && r.tax !== "" ? Number(r.tax).toFixed(2) : (amounts.vatClassification === "non-vat" ? "0.00" : amounts.vat.toFixed(2)),
            vatClassification: amounts.vatClassification,
          };
        })(),
        invoiceNumber: r.invoiceNumber || r.id,
        tin: r.tin || tinFor(r),
        merchantName: r.merchantName || cleanName(r.fileName),
        location: r.location || "",
        items:
          r.items ||
          getItems(r.category || "Expense").map((name) => ({
            name,
            qty: 1,
            price: 0,
          })),
      }));
    } catch {
      localReceipts.value = [];
    } finally {
      sessionStorage.removeItem(FORWARDED_RECEIPTS_KEY);
      sessionStorage.removeItem(LEGACY_LIQUIDATION_RECEIPTS_KEY);
    }
  }
});

onBeforeUnmount(() => {
  localReceipts.value.forEach((receipt) => {
    if (receipt.thumbnail?.startsWith("blob:")) {
      URL.revokeObjectURL(receipt.thumbnail);
    }
  });
  
  if (!isEditMode.value) {
    clearDraftReceipts();
  }
  
  window.removeEventListener('open-receipt-upload', handleOpenReceiptUpload);
});

//  Dismiss ─
function dismiss() {
  dismissWithConfirm(
    () => {
      emit("close");
      // If opened standalone (via route), go back
      router.back();
    },
    { navigates: true },
  );
}
</script>

<template>
  <div class="max-w-5xl mx-auto flex flex-col gap-6 pb-12 animate-fade-up">
    <input
      ref="receiptInput"
      type="file"
      class="hidden"
      accept=".jpg,.jpeg,.png,.pdf"
      multiple
      @change="onReceiptSelect"
      @cancel="onReceiptInputCancel"
    />

    <!--  Page Header (standalone route mode only)  -->
    <ReimbursementFormHeader
      v-if="!isEmbeddedForwardedMode"
      :is-edit="isEditMode"
      :is-revise="isReviseMode"
      @dismiss="dismiss"
    />

    <!--  Loading State  -->
    <div
      v-if="fetching"
      class="border border-slate-200 bg-white rounded-xl flex min-h-[400px] flex-col items-center justify-center gap-4 p-16 text-center"
    >
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
        Loading request details...
      </p>
    </div>

    <template v-else>
      <!-- Revision Feedback Banner (when revising per admin request) -->
      <div
        v-if="isReviseMode && adminNotes"
        class="p-4 rounded-xl border border-orange-200 bg-orange-50 text-orange-800 flex flex-col gap-1 shadow-sm"
      >
        <p class="text-[11px] text-orange-600 uppercase tracking-wide font-bold">
          Needs Revision — Attempt {{ revisionCount || 1 }}/3 <span v-if="(revisionCount || 1) >= 3" class="text-red-600">(final attempt)</span>
        </p>
        <p class="text-sm text-orange-900 font-medium">
          Admin Feedback: "{{ adminNotes }}"
        </p>
        <p class="text-xs text-orange-700/80 mt-1">
          Please make the requested adjustments below and update your reimbursement to resubmit.
        </p>
      </div>

      <!--  Success State  -->
      <!--  Alert Banner (forwarded mode)  -->
      <div
        v-if="isForwardedMode"
        class="flex items-center gap-3 px-4 py-3 bg-accent-50 border border-accent/15 rounded-xl"
      >
        <Send class="w-4 h-4 text-accent flex-shrink-0" />
        <p class="text-sm font-semibold text-accent">
          {{ forwardedReceiptCount }} receipt{{
            forwardedReceiptCount !== 1 ? "s" : ""
          }}
          forwarded from {{ forwardedSource }} and pre-filled below.
        </p>
      </div>

      <!-- OCR mode toggle: Real pipeline vs fast mock (real file, instant data, skip OCR wait) -->
      <div
        v-if="!isForwardedMode && !isEditMode"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
      >
        <BaseToggleSwitch
          :model-value="isMockOcr"
          @update:model-value="setMockMode"
          on-label="Mock OCR"
          off-label="Real OCR"
          hint="Mock uploads file, fills instantly, skips OCR wait"
        />
        <p class="text-[11px] text-slate-400">
          {{ isMockOcr ? "Fast — real file upload, instant mock data." : "Online — uses ocr-pipeline with polling." }}
        </p>
      </div>

      <template v-if="receipts.length > 0 || isEditMode">
        <!--  CARD 1: Upload Receipt Management  -->
        <ReceiptsManagementHeader
          v-if="!isForwardedMode"
          :receipt-count="receipts.length"
          @add-receipts="triggerUpload('single')"
          @open-segmented-upload="triggerUpload('multi')"
        />

        <!-- Segmented Upload Panel -->
        <SegmentedReceiptUpload
          v-if="showSegmentedUpload"
          @submit-segments="
            (files) => {
              submitSegments(files);
              showSegmentedUpload = false;
            }
          "
          @cancel="showSegmentedUpload = false"
        />

        <!--  CARD 2: One Scanned Receipt Block Per Receipt  -->
        <ScannedReceiptsList
          :receipts="receipts"
          :categories="receiptsStore.categories"
          :allow-remove="!isForwardedMode"
          @remove-receipt="removeReceipt"
        />

        <!--  CARD 3: Meta & Attachments  -->
        <MetaAndAttachments
          v-model:report-file="reportFile"
          v-model:user-comment="userComment"
        />

        <ReimbursementSummaryPanel
          :receipt-count="receipts.length"
          :report-file="reportFile"
          :total-amount="totalAmount"
          :currency="summaryCurrency"
        />

        <!--  Footer Actions  -->
        <div class="flex justify-end gap-4 pb-4">
          <button
            class="btn btn-primary btn-cta min-h-[42px] w-full sm:w-fit disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!canProceed || submitting"
            @click="promptSubmit"
          >
            <span
              v-if="submitting"
              class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <Save v-else class="w-4 h-4" />
            {{ submitting ? (isEditMode ? (isReviseMode ? "Resubmitting..." : "Updating...") : "Submitting...") : (isEditMode ? (isReviseMode ? "Update & Resubmit" : "Update Reimbursement") : "Submit Reimbursement") }}
          </button>
        </div>
      </template>
    </template>

    <ConfirmModal
      :is-open="showSubmitConfirmModal"
      title="Submit Request"
      message="Are you sure do you want to submit this request?"
      confirm-text="Done"
      cancel-text="Cancel"
      :danger="false"
      :loading="submitting"
      @confirm="handleConfirmSubmit"
      @close="handleCancelSubmit"
    />

    <ConfirmModal
      :is-open="showConfirmModal"
      title="Unsaved Changes"
      message="You have unsaved changes. Are you sure you want to leave? All progress will be lost."
      confirm-text="Leave Page"
      cancel-text="Stay"
      :danger="true"
      @confirm="onConfirmLeave"
      @close="handleCancelLeave"
    />

    <ReceiptQualityRejectionModal
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
      @continue-anyway="
        continueAnyway(qualityRejection?.file);
      "
      @close="clearQualityRejection"
    />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s linear;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
