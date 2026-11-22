<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from "vue";
import * as vueRouter from "vue-router";
import { usePolicyStore } from "@/stores/policy";
import { useReceiptStore } from "@/stores/receipts";
import { useReimbursementStore } from "@/stores/reimbursement";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import { createDefaultTemplateData, validateTemplateData } from "@/utils/sbsiReportTemplateUtils";
import { Layers, Save, Send, Ticket, UploadCloud } from "lucide-vue-next";

// Components
import ReceiptsManagementHeader from "@/components/reimbursements/ReceiptsManagementHeader.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import MetaAndAttachments from "@/components/reimbursements/MetaAndAttachments.vue";
import ReimbursementSummaryPanel from "@/components/reimbursements/ReimbursementSummaryPanel.vue";
import ReimbursementFormHeader from "@/components/reimbursements/ReimbursementFormHeader.vue";
import ReceiptQualityRejectionModal from "@/components/reimbursements/ReceiptQualityRejectionModal.vue";
import SegmentedReceiptUpload from "@/components/reimbursements/SegmentedReceiptUpload.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";

// Composables
import { useReceiptUploads } from "@/composables/reimbursements/useReceiptUploads";
import { useReimbursementSubmit } from "@/composables/reimbursements/useReimbursementSubmit";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import {
  useCurrencyRates,
  useReceiptCurrencyWatcher,
  extractReceiptFxSnapshot,
} from "@/composables/useCurrencyRates";
import {
  useRevisionGuard,
  isManualReportTemplate,
  isRevisionStatus,
  serializeFileAttachment,
  serializeReceiptList,
  serializeTemplateData,
} from "@/composables/useRevisionGuard";
import { isOcrOfflineFailure } from "@/utils/ocrErrors";

import {
  tinFor,
  cleanName,
  normalizeVatClassification,
  receiptFinancials,
  getItems,
  formatDateForInput,
} from "@/utils/receiptUtils";
import { truncateDecimal } from "@/utils/formatters";
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
let auth = null;
try {
  auth = useAuthStore();
} catch {
  auth = null;
}
const { addToast } = useToast();
const router = typeof vueRouter.useRouter === "function" ? vueRouter.useRouter() : null;
let route = null;
try {
  route = typeof vueRouter.useRoute === "function" ? vueRouter.useRoute() : null;
} catch {
  route = null;
}

// State
const reportFile = ref(null);
const reportTemplateData = ref(
  props.id ? null : createDefaultTemplateData("reimbursement", { user: auth?.user }),
);
const isManualMode = ref(false);
const userComment = ref("");
const contractId = ref(null);
const clientName = ref("");
const ticketId = ref(null);
const ticketNumber = ref("");
const fetching = ref(false);
const existingStatus = ref("");
const adminNotes = ref("");
const revisionCount = ref(0);
const isReviseMode = computed(() => isRevisionStatus(existingStatus.value));
const storedForwardedReceipts = ref([]);
const forwardedSource = ref("My Expense");
const FORWARDED_RECEIPTS_KEY = "serms_forwarded_reimbursement_receipts";
const LEGACY_LIQUIDATION_RECEIPTS_KEY = "serms_forwarded_liquidation_receipts";
const summaryCurrency = ref("PHP");
const { fetchRates, sumReceiptsPhpAmount } = useCurrencyRates();

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

function handleCloseQualityRejection() {
  clearQualityRejection();
  if (!isEditMode.value && receipts.value.length === 0 && !ticketId.value) {
    router?.push("/reimbursements");
  }
}

function triggerUpload(mode = 'single') {
  uploadMode.value = mode;
  if (receiptInput.value) receiptInput.value.value = "";
  receiptInput.value?.click();
}

function onReceiptInputCancel() {
  uploadMode.value = "single";
  // User dismissed the native file chooser without picking a file (e.g. after
  // DuplicateReceiptModal "Upload New One"). Reset so the same file can be
  // re-picked next time. When no receipts remain in create mode, return to the
  // Reimbursements list instead of stranding the user on an empty
  // /reimbursements/new page.
  if (receiptInput.value) receiptInput.value.value = "";
  if (!isEditMode.value && receipts.value.length === 0 && !ticketId.value) {
    router?.push("/reimbursements");
  }
}

function onReceiptSelect(e) {
  if (uploadMode.value === "multi") {
    const files = Array.from(e.target.files || []);
    if (files.length >= 2) {
      submitSegments(files.slice(0, 6));
    } else if (files.length === 1) {
      addReceiptFiles(files);
    }
    uploadMode.value = "single";
    if (e.target) e.target.value = "";
  } else {
    handleReceiptSelect(e);
  }
}

const receipts = computed(() => [
  ...props.forwardedReceipts,
  ...localReceipts.value,
]);

useReceiptCurrencyWatcher(receipts);

// Financials (reimbursement totals are always consolidated in PHP)
const totalAmount = computed(() => sumReceiptsPhpAmount(receipts.value));
const totalVat = computed(() =>
  receipts.value.reduce((sum, r) => sum + (Number(r.tax) || 0), 0),
);

const effectiveManualMode = computed(
  () =>
    isManualMode.value ||
    isManualReportTemplate(reportTemplateData.value) ||
    (Boolean(reportFile.value) && !reportTemplateData.value),
);

const hasValidReport = computed(() => {
  if (effectiveManualMode.value) {
    return Boolean(reportFile.value);
  }
  if (reportTemplateData.value) {
    return validateTemplateData(reportTemplateData.value).valid || Boolean(reportFile.value);
  }
  return Boolean(reportFile.value);
});

const canProceed = computed(
  () =>
    receipts.value.length >= 1 &&
    hasValidReport.value &&
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

const {
  isRevisionUnchanged,
  captureBaseline: captureRevisionBaseline,
} = useRevisionGuard({
  isRevise: isReviseMode,
  getSnapshot: () => ({
    receipts: serializeReceiptList(receipts.value),
    reportFile: serializeFileAttachment(reportFile.value),
    reportTemplateData: serializeTemplateData(reportTemplateData.value),
    userComment: userComment.value,
    isManualMode: effectiveManualMode.value,
    contractId: contractId.value,
    clientName: clientName.value,
    ticketId: ticketId.value,
    ticketNumber: ticketNumber.value,
  }),
});

const isDirty = computed(() => {
  const hasTemplatePurpose = Boolean(reportTemplateData.value?.purpose?.trim());
  return receipts.value.length > 0 || reportFile.value !== null || userComment.value !== "" || hasTemplatePurpose;
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
  if (!canProceed.value || submitting.value || isRevisionUnchanged.value) return;
  showSubmitConfirmModal.value = true;
}

function handleConfirmSubmit() {
  if (!canProceed.value || submitting.value || isRevisionUnchanged.value) {
    showSubmitConfirmModal.value = false;
    return;
  }
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
        reportTemplateData: reportTemplateData.value,
        totalAmount: totalAmount.value,
        userComment: userComment.value,
        contractId: contractId.value,
        clientName: clientName.value,
        ticketId: ticketId.value,
        ticketNumber: ticketNumber.value,
      });
    } else {
      success = await submitReimbursement({
        receipts: receipts.value,
        reportFile: reportFile.value,
        reportTemplateData: reportTemplateData.value,
        totalAmount: totalAmount.value,
        userComment: userComment.value,
        contractId: contractId.value,
        clientName: clientName.value,
        ticketId: ticketId.value,
        ticketNumber: ticketNumber.value,
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
  fetchRates();
  
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

  if (!isEditMode.value) {
    const rawTicketId = route?.query?.ticket_id;
    const rawTicketNumber = route?.query?.ticket_number;
    const resolvedTicketId = Array.isArray(rawTicketId) ? rawTicketId[0] : rawTicketId;
    const resolvedTicketNumber = Array.isArray(rawTicketNumber)
      ? rawTicketNumber[0]
      : rawTicketNumber;
    if (
      resolvedTicketId !== undefined &&
      resolvedTicketId !== null &&
      String(resolvedTicketId).trim() !== ""
    ) {
      const parsedTicketId = Number(resolvedTicketId);
      ticketId.value =
        Number.isFinite(parsedTicketId) && parsedTicketId > 0
          ? parsedTicketId
          : String(resolvedTicketId).trim();
    }
    if (
      resolvedTicketNumber !== undefined &&
      resolvedTicketNumber !== null &&
      String(resolvedTicketNumber).trim() !== ""
    ) {
      ticketNumber.value = String(resolvedTicketNumber).trim();
    }
  }

  if (isEditMode.value) {
    fetching.value = true;
    let hydrated = false;
    try {
      const data = await reimbursementStore.fetchOne(props.id);
      if (
        data.report_template_data &&
        !isManualReportTemplate(data.report_template_data)
      ) {
        reportTemplateData.value = {
          ...data.report_template_data,
          mode: data.report_template_data.mode || "template",
        };
        reportFile.value = null;
        isManualMode.value = false;
      } else {
        reportFile.value = data.report_file_path || null;
        reportTemplateData.value = null;
        isManualMode.value = Boolean(
          data.report_file_path || isManualReportTemplate(data.report_template_data),
        );
      }
      userComment.value = data.user_comment || "";
      contractId.value = data.contract_id ?? null;
      clientName.value = data.client_name || "";
      ticketId.value = data.ticket_id ?? null;
      ticketNumber.value = data.ticket_number || "";
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

          const rawFiles = Array.isArray(r.file_url)
            ? r.file_url
            : Array.isArray(r.file_path)
              ? r.file_path
              : null;
          const multiImages =
            rawFiles && rawFiles.length > 1
              ? rawFiles.map((f, i) => ({
                  id: `seg-${r.id}-${i}`,
                  url: getFileUrl(f),
                  name: `Segment ${i + 1}`,
                }))
              : null;

          return {
            id: r.id,
            fileName: r.vendor_name || `Receipt-${r.id}`,
            fileType: r.file_type,
            merchantName: r.vendor_name,
            date: formatDateForInput(r.transaction_date),
            amount: amounts.gross > 0 ? Number(truncateDecimal(amounts.gross, 2)) : "",
            subtotal: resolvedSubtotal,
            tax: resolvedTax,
            vatClassification: amounts.vatClassification,
            currency: r.currency || "",
            ...extractReceiptFxSnapshot(r, r.currency || ""),
            tin: r.tin,
            invoiceNumber: r.invoice_number,
            location: r.location || "",
            category: r.category?.name || data.expense_category?.name || "",
            categoryId: r.expense_category_id || data.expense_category_id || null,
            eventType: r.event_type || data.event_type || "",
            thumbnail: getFileUrl(r.file_url || r.file_path) || null,
            images: multiImages,
            isMultiReceipt: Boolean(multiImages),
            items,
            isUploading: false,
          };
        });
      }
      hydrated = true;
    } catch (error) {
      addToast({
        message: "Failed to load reimbursement details.",
        type: "error",
      });
      router.push("/reimbursements");
    } finally {
      fetching.value = false;
    }
    if (hydrated) {
      await nextTick();
      await nextTick();
      captureRevisionBaseline();
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
        ...extractReceiptFxSnapshot(r, r.currency || ""),
        ...(() => {
          const amounts = receiptFinancials(r, r.vatClassification);
          let sub = "";
          if (r.subtotal != null && r.subtotal !== "") {
            sub = Number(r.subtotal).toFixed(2);
          } else if (amounts.gross > 0) {
            sub = amounts.subtotal.toFixed(2);
          }

          return {
            amount: amounts.gross > 0 ? Number(truncateDecimal(amounts.gross, 2)) : "",
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

      <section
        v-if="!isEditMode && receipts.length === 0 && ticketId"
        class="card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-indigo-200 bg-indigo-50/40"
      >
        <div class="flex items-start gap-3">
          <div class="p-2.5 rounded-xl bg-indigo-100 text-indigo-700 shrink-0">
            <Ticket class="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p class="text-sm font-bold text-slate-800">
              Linked to Support Ticket {{ ticketNumber || `#${ticketId}` }}
            </p>
            <p class="text-xs text-slate-500 mt-0.5">
              Attach at least one receipt (JPEG, PNG, or PDF, max 2MB) to continue creating this reimbursement request.
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <BaseButton
            variant="primary"
            size="sm"
            type="button"
            @click="triggerUpload('single')"
          >
            <UploadCloud class="w-4 h-4" aria-hidden="true" />
            <span>Attach Single Receipt</span>
          </BaseButton>
          <BaseButton
            variant="outline"
            size="sm"
            type="button"
            @click="triggerUpload('multi')"
          >
            <Layers class="w-4 h-4" aria-hidden="true" />
            <span>Attach Multi Receipt</span>
          </BaseButton>
        </div>
      </section>

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
          v-model:report-template-data="reportTemplateData"
          v-model:user-comment="userComment"
          v-model:contract-id="contractId"
          v-model:client-name="clientName"
          v-model:ticket-id="ticketId"
          v-model:ticket-number="ticketNumber"
          :receipts="receipts"
          :total-amount="totalAmount"
          :record-id="props.id"
          @update:is-manual-mode="isManualMode = $event"
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
            :disabled="!canProceed || submitting || isRevisionUnchanged"
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
      @close="handleCloseQualityRejection"
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
