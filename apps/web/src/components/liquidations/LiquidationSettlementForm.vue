<script setup>
import { computed, ref, watch, nextTick } from "vue";
import {
  FilePieChart,
  CheckCircle,
  X,
  Upload,
  AlertTriangle,
  AlertCircle,
  Download,
  Eye,
} from "lucide-vue-next";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseModalTabs from "@/components/base/BaseModalTabs.vue";
import FileUpload from "@/components/base/FileUpload.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import UnifiedRoadmapStepper from "@/components/base/UnifiedRoadmapStepper.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import ReceiptImagePreview from "@/components/base/ReceiptImagePreview.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseReceiptDetailModal from "@/components/base/BaseReceiptDetailModal.vue";
import SbsiReportDocumentEditor from "@/components/base/SbsiReportDocumentEditor.vue";
import { useLiquidationStore } from "@/stores/liquidation";
import { useReportExport } from "@/composables/useReportExport";
import {
  useCurrencyRates,
  useReceiptCurrencyWatcher,
  resolveReceiptExchangeRate,
  extractReceiptFxSnapshot,
} from "@/composables/useCurrencyRates";
import { formatPeso, formatDate, formatAmount } from "@/utils/formatters";
import {
  sumPenaltyRecords,
  resolveAdvanceBalance,
  isExpenseBelowBalance,
} from "@/utils/liquidationPenalties";
import { apiFetch } from "@/utils/apiFetch";
import { getFileUrl } from "@/utils/fileUtils";
import { validateTemplateData } from "@/utils/sbsiReportTemplateUtils";
import {
  useRevisionGuard,
  isRevisionStatus,
  isManualReportTemplate,
  serializeFileAttachment,
  serializeReceiptList,
  serializeTemplateData,
} from "@/composables/useRevisionGuard";

const props = defineProps({
  auditTrail: {
    type: Array,
    default: () => [],
  },
  selectedAdvance: {
    type: Object,
    default: null,
  },
  submitted: {
    type: Boolean,
    default: false,
  },
  receipts: {
    type: Array,
    default: () => [],
  },
  receiptCategoryOptions: {
    type: Array,
    default: () => [],
  },
  reportAttachment: {
    type: [Object, File, String],
    default: null,
  },
  reportTemplateData: {
    type: Object,
    default: null,
  },
  isManualMode: {
    type: Boolean,
    default: false,
  },
  existingLiquidation: {
    type: Object,
    default: null,
  },
  variance: {
    type: Number,
    default: 0,
  },
  shortfallExplanation: {
    type: String,
    default: "",
  },
  totalExpenseAmount: {
    type: Number,
    default: 0,
  },
  liquidationStatus: {
    type: String,
    default: "",
  },
  liquidationOutstandingBalance: {
    type: Number,
    default: 0,
  },
  overpaymentAmount: {
    type: Number,
    default: 0,
  },
  submitting: {
    type: Boolean,
    default: false,
  },
  hasIncompleteReceiptFields: {
    type: Boolean,
    default: false,
  },
  hasChanges: {
    type: Boolean,
    default: undefined,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "update:receipts",
  "update:shortfallExplanation",
  "update:reportTemplateData",
  "update:reportAttachment",
  "update:isManualMode",
  "reload-console",
  "upload-error",
  "file-cleared",
  "forward-overpayment",
  "delete-liquidation",
  "submit-liquidation",
]);

const localTemplateData = ref(props.reportTemplateData);
const localManualMode = ref(props.isManualMode);
const localManualAttachment = ref(null);

const { isForeignCurrency, formatPhpConversionLabel } = useCurrencyRates();
useReceiptCurrencyWatcher(() => props.receipts);

watch(
  [() => props.reportAttachment, () => props.existingLiquidation?.id],
  ([nextFile]) => {
    if (!nextFile) {
      localManualAttachment.value = null;
      return;
    }
    const isFileInstance = typeof File !== "undefined" && nextFile instanceof File;
    const isManualContext =
      Boolean(props.isManualMode) ||
      !props.reportTemplateData ||
      isManualReportTemplate(props.reportTemplateData);
    localManualAttachment.value = isFileInstance || isManualContext ? nextFile : null;
  },
  { immediate: true },
);

watch(
  () => props.reportTemplateData,
  (val) => {
    localTemplateData.value = val;
  },
  { immediate: true },
);

watch(
  () => props.isManualMode,
  (val) => {
    localManualMode.value = val;
  },
  { immediate: true },
);

const effectiveTemplateData = computed(() => props.reportTemplateData ?? localTemplateData.value);
const effectiveManualMode = computed(() => localManualMode.value);
const isTemplateValid = computed(() => validateTemplateData(effectiveTemplateData.value).valid);

const disbursementDateValue = computed(() => {
  const adv = props.selectedAdvance;
  if (!adv) return "";
  const raw =
    adv.disbursement?.disbursed_at ||
    adv.disbursed_at ||
    adv.expected_disbursement_date ||
    adv.acknowledgedAt ||
    adv.date ||
    "";
  return raw ? String(raw).slice(0, 10) : "";
});

function handleEditorModeUpdate(nextMode) {
  const next = nextMode === "manual";
  const wasManual = localManualMode.value || props.isManualMode;
  localManualMode.value = next;
  emit("update:isManualMode", next);
  if (!next) {
    const hadAttachment = Boolean(localManualAttachment.value);
    localManualAttachment.value = null;
    if (wasManual && hadAttachment) {
      emit("update:reportAttachment", null);
      emit("file-cleared");
    }
  }
}

function handleTemplateModelUpdate(val) {
  localTemplateData.value = val;
  emit("update:reportTemplateData", val);
}

function handleReportFileUpdate(file) {
  localManualAttachment.value = file || null;
  emit("update:reportAttachment", file);
  if (file) {
    localManualMode.value = true;
    emit("update:isManualMode", true);
  } else {
    emit("file-cleared");
  }
}

const { isExporting, exportReport } = useReportExport();

function handleExportLiquidationReport() {
  if (props.existingLiquidation?.id) {
    exportReport("liquidation", props.existingLiquidation.id);
  } else if (props.selectedAdvance?.id) {
    exportReport("liquidation", props.selectedAdvance.id, {
      byCashAdvance: true,
    });
  }
}

const normalizeStatus = (val) =>
  String(val || "")
    .toLowerCase()
    .trim()
    .replace(/[\s/_-]+/g, "-");

const isLiquidationReviseMode = computed(() =>
  isRevisionStatus(props.existingLiquidation?.status),
);

const {
  isRevisionUnchanged: internalRevisionUnchanged,
  captureBaseline: captureInternalRevisionBaseline,
  clearBaseline: clearInternalRevisionBaseline,
} = useRevisionGuard({
  isRevise: isLiquidationReviseMode,
  getSnapshot: () => ({
    receipts: serializeReceiptList(props.receipts),
    reportAttachment: serializeFileAttachment(localManualAttachment.value),
    reportTemplateData: serializeTemplateData(
      localTemplateData.value ?? props.reportTemplateData,
    ),
    isManualMode: Boolean(effectiveManualMode.value),
    shortfallExplanation: props.shortfallExplanation || "",
  }),
});

let internalBaselineToken = 0;
watch(
  [
    () => props.existingLiquidation?.id ?? null,
    () => props.existingLiquidation?.status ?? "",
    () => props.selectedAdvance?.id ?? null,
    () => props.hasChanges,
  ],
  async () => {
    if (props.hasChanges !== undefined) return;
    const token = ++internalBaselineToken;
    clearInternalRevisionBaseline();
    await nextTick();
    await nextTick();
    if (token === internalBaselineToken) {
      captureInternalRevisionBaseline();
    }
  },
  { immediate: true },
);

const isUnchangedRevision = computed(() => {
  if (!isLiquidationReviseMode.value) return false;
  if (props.hasChanges !== undefined) {
    return !props.hasChanges;
  }
  return internalRevisionUnchanged.value;
});

const activeTab = ref("receipts");

const applicantNoteText = computed(() =>
  String(
    props.shortfallExplanation ||
      props.existingLiquidation?.shortfall_explanation ||
      props.existingLiquidation?.shortfallExplanation ||
      "",
  ).trim(),
);

const adminNoteText = computed(() =>
  String(
    props.existingLiquidation?.admin_note ||
      props.existingLiquidation?.adminNote ||
      "",
  ).trim(),
);

// Phase 2 gate: liquidation is editable only after acknowledgement (signed)
// or when the workflow has already entered Phase 2. Until then preview-only.
const hasAcknowledged = computed(() => {
  const adv = props.selectedAdvance;
  if (!adv) return false;
  if (adv.acknowledgedAt || adv.acknowledged_at) return true;
  if (adv.signature || adv.signatureImage) return true;
  return normalizeStatus(adv.status) === "signed";
});

const isPhase2 = computed(() => {
  const advanceStatus = normalizeStatus(props.selectedAdvance?.status);
  const phase2Statuses = [
    "signed",
    "under-review",
    "pending-under-review",
    "incomplete",
    "overdue",
    "liquidated",
    "settled",
  ];
  if (advanceStatus && phase2Statuses.includes(advanceStatus)) return true;
  // Any existing liquidation means we already entered Phase 2
  if (props.existingLiquidation) return true;
  return false;
});

const requiresAcknowledgement = computed(() => {
  // Revise requests are already in Phase 2 — keep them editable
  const existingStatus = normalizeStatus(props.existingLiquidation?.status);
  if (existingStatus === "revise") return false;
  if (!props.selectedAdvance) return false;
  return !hasAcknowledged.value && !isPhase2.value;
});

const isFormDisabled = computed(() => {
  if (props.disabled) return true;
  // Preview-only until acknowledged / Phase 2
  if (requiresAcknowledgement.value) return true;

  const normalize = normalizeStatus;

  const existingStatus = normalize(props.existingLiquidation?.status);
  // revise is explicitly editable — not disabled
  if (existingStatus === "revise") return false;

  const disabledStatuses = [
    "pending",
    "liquidated",
    "approved",
    "under-review",
    "pending-under-review",
  ];

  const advanceStatus = normalize(props.selectedAdvance?.status);

  if (existingStatus && disabledStatuses.includes(existingStatus)) {
    return true;
  }

  if (advanceStatus && disabledStatuses.includes(advanceStatus)) {
    return true;
  }

  return false;
});

const currentStatusLabel = computed(() => {
  const status =
    props.existingLiquidation?.status || props.selectedAdvance?.status || "";
  const key = String(status)
    .toLowerCase()
    .trim()
    .replace(/[\s/_-]+/g, "-");
  if (
    key === "under-review" ||
    key === "pending" ||
    key === "pending-under-review"
  )
    return "Under Review";
  if (key === "revise") return "Needs Revision";
  if (key === "liquidated") return "Liquidated";
  if (key === "approved") return "Approved";
  if (key === "rejected") return "Rejected";
  return status || "Read-only";
});

/* Mini roadmap bridge */
const liqStore = useLiquidationStore();
const roadmapCashAdvance = computed(() => props.selectedAdvance || null);
const roadmapLiquidation = computed(() => {
  if (props.existingLiquidation) return props.existingLiquidation;
  if (props.submitted) {
    return {
      status: "pending",
      total_expense_amount: props.totalExpenseAmount,
      revision_count: 0,
    };
  }
  return null;
});
const roadmapHistory = computed(() => {
  const sa = props.selectedAdvance;
  if (!sa) return [];
  return (
    sa.status_history || sa.statusHistory || sa.history || sa.audit_logs || []
  );
});
const roadmapPenalties = computed(() => {
  const sa = props.selectedAdvance;
  if (sa?.penalties && Array.isArray(sa.penalties)) return sa.penalties;
  return [];
});
const roadmapAging = computed(() => {
  if (!props.selectedAdvance) return null;
  try {
    return liqStore.calculateAging(props.selectedAdvance);
  } catch {
    return null;
  }
});

const requestedAdvanceAmount = computed(() =>
  Number(props.selectedAdvance?.amount ?? props.selectedAdvance?.balance ?? 0),
);

const totalPenaltyAmount = computed(() => {
  const sa = props.selectedAdvance;
  if (!sa) return 0;
  const fromRecords = sumPenaltyRecords(sa.penalties);
  if (fromRecords > 0) return fromRecords;
  if (sa.penalties_total !== undefined && sa.penalties_total !== null) {
    return Number(sa.penalties_total) || 0;
  }
  return Number(roadmapAging.value?.penalty || 0);
});

const penaltyDaysCount = computed(() => {
  const sa = props.selectedAdvance;
  if (Array.isArray(sa?.penalties) && sa.penalties.length > 0) {
    return sa.penalties.length;
  }
  return totalPenaltyAmount.value > 0
    ? Math.round(totalPenaltyAmount.value / 50)
    : 0;
});

const totalAdvanceBalance = computed(() =>
  resolveAdvanceBalance(props.selectedAdvance),
);

const isBelowBalance = computed(
  () =>
    Boolean(props.selectedAdvance) &&
    isExpenseBelowBalance(props.totalExpenseAmount, totalAdvanceBalance.value),
);

const shortfallAmount = computed(() => {
  const expenseCents = Math.round(Number(props.totalExpenseAmount || 0) * 100);
  const balanceCents = Math.round(totalAdvanceBalance.value * 100);
  return Math.max(0, (balanceCents - expenseCents) / 100);
});

async function handleRemoveReceipt(receiptToRemove) {
  const updated = props.receipts.filter(
    (r) =>
      r !== receiptToRemove &&
      (!receiptToRemove.id || r.id !== receiptToRemove.id),
  );
  emit("update:receipts", updated);

  const existingIds = new Set(
    (props.existingLiquidation?.receipts || []).map((r) => r.id),
  );
  if (
    receiptToRemove?.id &&
    !existingIds.has(receiptToRemove.id) &&
    !String(receiptToRemove.id).startsWith("temp-")
  ) {
    try {
      await apiFetch(
        `/api/serms/reimbursements/receipts/${receiptToRemove.id}`,
        {
          method: "DELETE",
        },
      );
    } catch (err) {
      console.warn("Failed to delete removed receipt draft:", err);
    }
  }
}

const selectedViewReceipt = ref(null);
const isReceiptDetailOpen = ref(false);

function getReceiptSrc(receipt) {
  if (!receipt) return null;
  const rawPath = receipt.filePath || receipt.file_path;
  if (rawPath) return getFileUrl(rawPath);
  return receipt.thumbnail || receipt.preview || receipt.file_url || receipt.src || null;
}

function getReceiptCategoryName(receipt) {
  if (!receipt) return "General";
  if (receipt.category && typeof receipt.category === "string") return receipt.category;
  if (receipt.category?.name) return receipt.category.name;
  if (receipt.categoryId && Array.isArray(props.receiptCategoryOptions)) {
    const found = props.receiptCategoryOptions.find(
      (c) => Number(c.id) === Number(receipt.categoryId)
    );
    if (found) return found.name;
  }
  return "General";
}

function getReceiptAmount(receipt) {
  if (!receipt) return 0;
  return Number(receipt.amount || receipt.total_amount || receipt.ocrData?.amount || 0);
}

function handleOpenReceiptDetails(receipt) {
  selectedViewReceipt.value = receipt;
  isReceiptDetailOpen.value = true;
}

function handleCloseReceiptDetails() {
  isReceiptDetailOpen.value = false;
  selectedViewReceipt.value = null;
}

const settlementAuditTrail = computed(() => {
  if (props.existingLiquidation?.audit_trail?.length) {
    return props.existingLiquidation.audit_trail;
  }
  if (props.selectedAdvance?.audit_trail?.length) {
    return props.selectedAdvance.audit_trail;
  }
  if (Array.isArray(props.auditTrail) && props.auditTrail.length) {
    return props.auditTrail;
  }
  if (roadmapHistory.value?.length) {
    return roadmapHistory.value;
  }
  return (
    props.existingLiquidation?.audit_trail ||
    props.selectedAdvance?.audit_trail ||
    roadmapHistory.value ||
    []
  );
});

const modalTabs = computed(() => [
  { key: "receipts", label: "Receipts", count: props.receipts.length },
  { key: "report", label: "Report Attachment" },
  {
    key: "audit",
    label: "Audit Trail",
    count: settlementAuditTrail.value.length,
  },
]);

watch(
  () => [props.selectedAdvance?.id, props.existingLiquidation?.id],
  () => {
    activeTab.value = "receipts";
    handleCloseReceiptDetails();
  },
);

const normalizedViewReceipt = computed(() => {
  const r = selectedViewReceipt.value;
  if (!r) return null;
  const rawPath = r.filePath || r.file_path;
  const imageUrl = rawPath ? getFileUrl(rawPath) : (r.thumbnail || r.preview || r.file_url || null);
  const vatClass = r.vatClassification || r.vat_classification || "VAT";
  const currency = r.currency || r.ocrData?.currency || "PHP";
  const fxSource =
    r.exchangeRate != null ||
    r.exchange_rate != null ||
    r.convertedPhpAmount != null ||
    r.converted_php_amount != null
      ? r
      : (r.ocrData || r);
  return {
    imageUrl,
    fileType: r.fileType || r.file_type || "",
    invoiceNumber: r.invoiceNumber || r.invoice_number || r.ocrData?.invoiceNumber || "--",
    date: formatDate(r.date || r.transactionDate || r.transaction_date || r.ocrData?.date),
    vendor: r.merchantName || r.vendor || r.ocrData?.vendor || r.name || "Unknown Vendor",
    category: getReceiptCategoryName(r),
    tin: r.tin || r.tinNumber || r.tin_number || r.ocrData?.tin || "—",
    location: r.location || r.ocrData?.location || "--",
    vatClassification: vatClass,
    currency,
    ...extractReceiptFxSnapshot(fxSource, currency),
    items: r.items || [],
    amount: getReceiptAmount(r),
    vat: Number(r.vat ?? r.vat_amount ?? r.ocrData?.vat ?? 0),
    discountAmount: Number(r.discountAmount ?? r.discount_amount ?? 0),
    discountType: r.discountType ?? r.discount_type ?? "none",
    status: r.decision === "accepted" ? "approved" : (r.decision || r.status || "pending"),
  };
});
</script>

<template>
  <div
    v-if="!selectedAdvance"
    class="flex min-h-64 flex-col items-center justify-center gap-4 border-2 border-dashed bg-clinical/20 p-8 text-center card sm:p-16 xl:h-full"
  >
    <FilePieChart class="w-10 h-10 text-slate-200" />
    <p class="text-sm text-slate-400">Select a cash advance to liquidate</p>
  </div>

  <div
    v-else-if="submitted"
    class="flex flex-col items-center gap-6 p-8 text-center card sm:p-12"
  >
    <CheckCircle class="w-12 h-12 text-emerald-600" />
    <h3 class="text-lg font-semibold text-primary">Submitted</h3>
    <p class="text-sm text-slate-500">
      Your liquidation has been submitted for review.
    </p>
    <BaseButton variant="secondary" @click="$emit('reload-console')">
      Back to Liquidations
    </BaseButton>
  </div>

  <div v-else class="flex flex-col gap-5 p-4 shadow-sm card sm:p-6 w-full min-w-0 max-w-full overflow-x-clip">
    <!-- Needs Revision Banner -->
    <div
      v-if="
        String(existingLiquidation?.status || '').toLowerCase() === 'revise'
      "
      class="flex flex-col gap-1 rounded-lg border border-orange-200 bg-orange-50 p-3"
    >
      <div
        class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-700"
      >
        <AlertTriangle class="h-4 w-4 shrink-0" />
        <span
          >Needs Revision — Attempt
          {{ existingLiquidation?.revision_count || 1 }}/3</span
        >
      </div>
      <p class="text-sm text-orange-800">
        {{
          existingLiquidation?.admin_note ||
          existingLiquidation?.adminNote ||
          "Please revise per admin feedback and resubmit."
        }}
      </p>
      <p class="text-xs text-orange-700/70">
        Edit the receipts below and click Update — it will return to Pending.
      </p>
    </div>

    <!-- Status Banner for Disabled / Read-Only View -->
    <div
      v-else-if="isFormDisabled && existingLiquidation"
      class="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-600"
    >
      <AlertCircle class="h-4 w-4 shrink-0 text-slate-500" />
      <span>
        This liquidation request is currently
        <strong class="text-slate-800">{{ currentStatusLabel }}</strong> and is
        in read-only mode.
      </span>
    </div>

    <!-- Unified Roadmap (horizontal progress snapshot) -->
    <UnifiedRoadmapStepper
      v-if="selectedAdvance"
      :cash-advance="roadmapCashAdvance"
      :liquidation="roadmapLiquidation"
      :status-history="roadmapHistory"
      :penalties="roadmapPenalties"
      :overpayment-amount="overpaymentAmount"
      :aging="roadmapAging"
      class="!p-2"
    />

    <!-- Tabs + Active Tab Panels (v-show preserves draft/reactive state across switches) -->
    <div class="space-y-4">
      <BaseModalTabs v-model="activeTab" :tabs="modalTabs" />

      <!-- Receipts Tab -->
      <div
        v-show="activeTab === 'receipts'"
        data-testid="modal-panel-receipts"
        class="space-y-4"
      >
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label class="input-label !mb-0">
              Receipt Attachments ({{ receipts.length }})
            </label>
            <div class="flex items-center gap-3">
              <BaseButton
                data-testid="export-liquidation-report-btn"
                variant="secondary"
                size="sm"
                type="button"
                :loading="isExporting"
                :disabled="isExporting"
                @click="handleExportLiquidationReport"
              >
                <Download class="w-3.5 h-3.5" />
                <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
              </BaseButton>
            </div>
          </div>

          <template v-if="!isFormDisabled">
            <FileUpload
              :model-value="receipts"
              @update:model-value="$emit('update:receipts', $event)"
              :max-size-mb="2"
              @upload-error="$emit('upload-error', $event)"
            />
          </template>
        </div>

        <!-- View Mode: Even, controlled receipt card grid boxes with section max-width -->
        <template v-if="isFormDisabled">
          <div
            v-if="receipts.length > 0"
            class="w-full max-w-full"
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
              <article
                v-for="(receipt, idx) in receipts"
                :key="receipt.id || idx"
                class="relative min-h-[390px] rounded-3xl bg-slate-800 flex flex-col justify-end shadow-md h-full overflow-hidden isolate transform-gpu"
              >
                <!-- Full-bleed Stretched Receipt Image Background (no top, left, or right margin/padding) -->
                <div class="absolute inset-0 overflow-hidden rounded-3xl">
                  <ReceiptImagePreview
                    class="h-full rounded-3xl"
                    :file-name="receipt.fileName || receipt.name || receipt.merchantName || `receipt_${receipt.id || idx + 1}`"
                    :src="getReceiptSrc(receipt)"
                    :file-type="receipt.fileType"
                    :alt="receipt.merchantName || receipt.name || 'Receipt'"
                    :enable-zoom="true"
                    :show-badge="false"
                    :show-delete-button="false"
                    aspect-class="h-full w-full"
                    frame-class="border-0 rounded-3xl bg-slate-100"
                    img-class="w-full h-full object-cover"
                    :receipt="receipt"
                  />
                </div>

                <!-- Transparent Frosted Blur Overlay for Lower Card Contrast -->
                <div
                  class="pointer-events-none absolute inset-x-0 bottom-0 h-56 rounded-b-3xl backdrop-blur-md bg-gradient-to-t from-slate-800/75 via-slate-800/45 to-transparent"
                  style="mask-image: linear-gradient(to bottom, transparent 0%, black 38%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 38%);"
                  aria-hidden="true"
                />

                <!-- Lower Card Content: Title, Price, Status, View Details -->
                <div class="relative z-10 px-5 pb-5 pt-4 flex flex-col gap-3.5">
                  <div class="space-y-2.5">
                    <div class="flex items-center justify-between gap-2.5">
                      <p
                        class="text-base font-bold text-white truncate min-w-0 flex-1 drop-shadow-sm"
                        :title="receipt.merchantName || receipt.vendor || receipt.name || 'Receipt'"
                      >
                        {{ receipt.merchantName || receipt.vendor || receipt.name || "Receipt" }}
                      </p>
                      <span
                        class="rounded-full bg-slate-800/45 backdrop-blur-sm border border-white/15 px-3 py-1 text-xs font-semibold text-white shrink-0"
                      >
                        {{ formatAmount(getReceiptAmount(receipt), receipt.currency || "PHP") }}
                      </span>
                    </div>
                    <p
                      v-if="isForeignCurrency(receipt.currency)"
                      data-testid="liquidation-card-php-conversion"
                      class="text-[11px] font-medium text-slate-200/95 truncate"
                    >
                      {{ formatPhpConversionLabel(getReceiptAmount(receipt), receipt.currency, resolveReceiptExchangeRate(receipt)) }}
                    </p>

                    <div class="flex items-center">
                      <StatusBadge
                        :status="receipt.decision === 'accepted' ? 'approved' : (receipt.decision || receipt.status || 'pending')"
                        tier="high"
                      />
                    </div>
                  </div>

                  <BaseButton
                    variant="primary"
                    type="button"
                    class="w-full sm:w-auto sm:self-end"
                    @click="handleOpenReceiptDetails(receipt)"
                  >
                    <Eye class="w-3.5 h-3.5" />
                    <span>View Details</span>
                  </BaseButton>
                </div>
              </article>
            </div>
          </div>

          <div
            v-else
            class="p-6 text-center text-sm text-slate-400 bg-slate-50 border border-dashed rounded-xl border-slate-200"
          >
            No receipts attached to this liquidation.
          </div>
        </template>

        <!-- Create / Edit Mode: Scanned Receipts List for Interactive Editing -->
        <template v-else>
          <ScannedReceiptsList
            v-if="receipts.length > 0"
            :receipts="receipts"
            :categories="receiptCategoryOptions"
            :allow-remove="true"
            :disabled="false"
            @remove-receipt="handleRemoveReceipt"
          />
        </template>
      </div>

      <!-- Report Attachment Tab -->
      <div
        v-show="activeTab === 'report'"
        data-testid="modal-panel-report"
      >
        <section
          class="p-5 sm:p-6 bg-white border rounded-2xl border-slate-200/90 shadow-sm space-y-4"
          data-testid="liquidation-report-attachment-card"
        >
          <div class="flex items-center justify-between">
            <label class="input-label !mb-0">
              Report Attachment
              <span class="text-danger ml-0.5">*</span>
            </label>
          </div>

          <SbsiReportDocumentEditor
            type="liquidation"
            :model-value="effectiveTemplateData"
            :report-file="localManualAttachment"
            :receipts="receipts"
            :allocated-amount="selectedAdvance?.amount ?? selectedAdvance?.balance ?? 0"
            :utilized-amount="totalExpenseAmount"
            :variance="variance"
            :purpose="selectedAdvance?.purpose || ''"
            :disbursement-date="disbursementDateValue"
            :record-id="existingLiquidation?.id || selectedAdvance?.id || null"
            :disabled="isFormDisabled"
            :readonly="isFormDisabled"
            @update:model-value="handleTemplateModelUpdate"
            @update:report-file="handleReportFileUpdate"
            @update:mode="handleEditorModeUpdate"
          />
        </section>
      </div>

      <!-- Audit Trail Tab -->
      <div
        v-show="activeTab === 'audit'"
        data-testid="modal-panel-audit"
      >
        <BaseAuditTrail
          :trail="settlementAuditTrail"
          :entity-title="
            existingLiquidation?.id
              ? `Liquidation-#${existingLiquidation.id}`
              : `Cash-Advance-#${selectedAdvance?.id}`
          "
        />
      </div>
    </div>

    <!-- Reviewer Note / Explanation Section (always visible below tab panels) -->
    <section
      data-testid="modal-notes-section"
      class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3"
    >
      <template v-if="!isFormDisabled">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="input-label !mb-0">
              Reviewer Note / Explanation
              <span class="text-xs font-normal text-slate-400 ml-1">(Optional)</span>
            </label>
          </div>

          <div
            class="relative rounded-xl border border-slate-200 bg-white transition overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
          >
            <textarea
              :value="shortfallExplanation"
              @input="
                (e) =>
                  $emit('update:shortfallExplanation', e.target.value.slice(0, 255))
              "
              rows="3"
              maxlength="255"
              class="w-full resize-none border-0 bg-transparent p-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 min-h-[96px]"
              placeholder="Provide an optional note for this liquidation..."
            />
            <div
              class="flex items-center justify-end px-4 pb-3 pt-1 text-xs font-medium text-slate-400 select-none"
            >
              <span>{{ (shortfallExplanation || "").length }} / 255</span>
            </div>
          </div>
        </div>

        <div
          v-if="adminNoteText"
          class="pt-3 border-t border-slate-100 space-y-1"
        >
          <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Admin Notes
          </p>
          <p class="text-sm leading-relaxed text-slate-700">
            {{ adminNoteText }}
          </p>
        </div>
      </template>

      <template v-else>
        <h4 class="text-sm font-semibold text-slate-800">
          Reviewer Note / Explanation
        </h4>

        <template v-if="applicantNoteText || adminNoteText">
          <div v-if="applicantNoteText" class="space-y-1">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide">
              Applicant Explanation
            </p>
            <p class="text-sm leading-relaxed text-slate-700">
              {{ applicantNoteText }}
            </p>
          </div>
          <div
            v-if="adminNoteText"
            class="space-y-1"
            :class="{ 'pt-2.5 border-t border-slate-100': applicantNoteText }"
          >
            <p class="text-[11px] text-slate-400 uppercase tracking-wide">
              Admin Notes
            </p>
            <p class="text-sm leading-relaxed text-slate-700">
              {{ adminNoteText }}
            </p>
          </div>
        </template>

        <p v-else class="text-sm italic text-slate-400">
          No notes provided
        </p>
      </template>
    </section>

    <!-- Summary Section (always visible below Notes) -->
    <section
      data-testid="modal-summary-section"
      class="space-y-4"
    >
      <div
        data-testid="liquidation-settlement-summary"
        class="rounded-2xl border border-slate-200 bg-clinical/20 p-4 sm:p-5 space-y-4"
      >
        <h4 class="text-sm font-semibold text-slate-800">
          Settlement Summary
        </h4>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pb-3 border-b border-slate-200/80">
          <div class="min-w-0">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
              Purpose
            </p>
            <p class="text-sm font-semibold text-slate-800 break-words">
              {{ selectedAdvance.purpose || "--" }}
            </p>
          </div>
          <div>
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
              Due Date
            </p>
            <p class="text-sm font-medium text-slate-700">
              {{ formatDate(selectedAdvance.dueDate || selectedAdvance.expected_liquidation_date) }}
            </p>
          </div>
        </div>

        <div class="w-full space-y-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-slate-600">Requested Amount</span>
            <span class="font-semibold text-slate-700">{{
              formatPeso(requestedAdvanceAmount)
            }}</span>
          </div>
          <div
            v-if="totalPenaltyAmount > 0"
            class="flex items-center justify-between gap-3"
          >
            <span class="text-sm text-slate-600">
              Overdue Penalty ({{ penaltyDaysCount }}
              {{ penaltyDaysCount === 1 ? "day" : "days" }} &times; ₱50.00)
            </span>
            <span class="font-semibold text-danger"
              >+{{ formatPeso(totalPenaltyAmount) }}</span
            >
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-slate-600">Total Balance</span>
            <span class="font-bold text-primary">{{
              formatPeso(totalAdvanceBalance)
            }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-slate-600">Receipts Total</span>
            <span class="font-bold text-danger"
              >-{{ formatPeso(totalExpenseAmount) }}</span
            >
          </div>
          <div
            v-if="overpaymentAmount > 0"
            class="flex items-center justify-between gap-3"
          >
            <span class="text-sm text-slate-600">Overpayment</span>
            <span class="font-semibold text-emerald-600"
              >+{{ formatPeso(overpaymentAmount) }}</span
            >
          </div>
          <div
            v-else-if="isBelowBalance && receipts.length > 0"
            class="flex items-center justify-between gap-3"
          >
            <span class="text-sm text-slate-600">Remaining Shortfall</span>
            <span class="font-semibold text-danger">{{
              formatPeso(shortfallAmount)
            }}</span>
          </div>
          <div
            class="flex items-center justify-between gap-3 pt-2 border-t border-slate-200"
          >
            <span class="text-sm text-slate-600">Outstanding Balance</span>
            <span
              :class="[
                'text-lg font-black',
                liquidationStatus === 'Liquidated'
                  ? 'text-emerald-600'
                  : 'text-primary',
              ]"
            >
              {{ formatPeso(liquidationOutstandingBalance) }}
            </span>
          </div>
        </div>
      </div>

      <section
        v-if="overpaymentAmount > 0"
        class="p-4 border rounded-xl border-accent/20 bg-accent-50"
        aria-label="Step 9 overpayment forward to reimbursement"
      >
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <p
              class="inline-flex items-center gap-2 text-base font-bold font-heading text-primary"
            >
              <span
                class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white"
                >9</span
              >
              Overpayment → Forward to Reimbursement
            </p>
            <p class="mt-1 text-sm leading-relaxed text-slate-600">
              Step <span class="font-bold text-primary">9</span> — Any excess
              amount spent beyond the cash advance can be filed as a
              reimbursement. Current excess amount:
              <span class="font-bold text-primary">{{
                formatPeso(overpaymentAmount)
              }}</span
              >.
            </p>
            <p class="mt-1 text-[11px] text-slate-400">
              Shows as optional step 9 in the roadmap above. Click below to create
              a reimbursement linked to this advance.
            </p>
          </div>
          <BaseButton
            variant="primary"
            class="min-h-[42px] w-full shrink-0 sm:w-fit"
            type="button"
            :disabled="isFormDisabled"
            @click="!isFormDisabled && $emit('forward-overpayment')"
          >
            <Upload class="w-4 h-4" />
            File Reimbursement
          </BaseButton>
        </div>
      </section>
    </section>

    <div
      v-if="!isFormDisabled && receipts.length > 0 && isBelowBalance"
      data-testid="liquidation-balance-error"
      role="alert"
      class="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
    >
      <AlertCircle class="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
      <div>
        <p class="font-semibold">
          Total expenses must be equal to or greater than the outstanding balance.
        </p>
        <p class="mt-0.5 text-xs text-red-600">
          Current receipts total {{ formatPeso(totalExpenseAmount) }}, which is {{ formatPeso(shortfallAmount) }} short of the {{ formatPeso(totalAdvanceBalance) }} balance. Please attach additional receipts covering at least {{ formatPeso(totalAdvanceBalance) }} before submitting.
        </p>
      </div>
    </div>

    <div
      class="sticky bottom-0 z-10 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 py-4 bg-white border-t border-slate-100 mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
    >
      <BaseButton
        v-if="existingLiquidation && existingLiquidation.status === 'pending'"
        id="delete-liquidation-btn"
        variant="danger"
        class="h-[42px] w-full bg-red-600 hover:bg-red-700 text-white sm:w-auto sm:min-w-[120px]"
        :disabled="submitting"
        @click="$emit('delete-liquidation')"
      >
        Delete
      </BaseButton>

      <BaseButton
        id="submit-liquidation-btn"
        variant="primary"
        class="h-[42px] w-full sm:w-auto sm:min-w-[120px]"
        :disabled="
          isFormDisabled ||
          isUnchangedRevision ||
          receipts.length === 0 ||
          hasIncompleteReceiptFields ||
          receipts.some((r) => r.ocrStatus === 'processing') ||
          totalExpenseAmount === 0 ||
          isBelowBalance ||
          submitting ||
          (effectiveManualMode ? !localManualAttachment : !isTemplateValid)
        "
        @click="$emit('submit-liquidation')"
      >
        <div v-if="submitting" class="flex items-center gap-2">
          <span
            class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
            aria-hidden="true"
          />
          <span>{{
            existingLiquidation ? "Updating..." : "Submitting..."
          }}</span>
        </div>
        <div v-else class="flex items-center gap-2">
          <Upload class="w-4 h-4" />
          <span>{{ existingLiquidation ? "Update" : "Submit" }}</span>
        </div>
      </BaseButton>
    </div>

    <!-- Receipt Detail Modal for View Mode -->
    <BaseReceiptDetailModal
      :is-open="isReceiptDetailOpen && !!selectedViewReceipt"
      :receipt="normalizedViewReceipt"
      @close="handleCloseReceiptDetails"
    />
  </div>
</template>
