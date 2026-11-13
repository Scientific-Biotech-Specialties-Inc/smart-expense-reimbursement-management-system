<script setup>
import { computed, ref, watch } from "vue";
import {
  FilePieChart,
  CheckCircle,
  FileText,
  X,
  Upload,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Download,
  Eye,
} from "lucide-vue-next";
import BaseButton from "@/components/base/BaseButton.vue";
import FileUpload from "@/components/base/FileUpload.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import UnifiedRoadmapStepper from "@/components/base/UnifiedRoadmapStepper.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import ReceiptImagePreview from "@/components/base/ReceiptImagePreview.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseReceiptDetailModal from "@/components/base/BaseReceiptDetailModal.vue";
import { useLiquidationStore } from "@/stores/liquidation";
import { useReportExport } from "@/composables/useReportExport";
import { formatPeso, formatDate } from "@/utils/formatters";
import { apiFetch } from "@/utils/apiFetch";
import { getFileUrl } from "@/utils/fileUtils";

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
  existingLiquidation: {
    type: Object,
    default: null,
  },
  needsReportAttachmentReminder: {
    type: Boolean,
    default: false,
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
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "update:receipts",
  "update:shortfallExplanation",
  "reload-console",
  "upload-error",
  "file-selected",
  "file-cleared",
  "forward-overpayment",
  "delete-liquidation",
  "submit-liquidation",
]);

const reportAttachmentInput = ref(null);

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

const resolvedAuditTrail = computed(() => {
  if (props.existingLiquidation?.audit_trail?.length) {
    return props.existingLiquidation.audit_trail;
  }
  if (props.selectedAdvance?.audit_trail?.length) {
    return props.selectedAdvance.audit_trail;
  }
  if (Array.isArray(props.auditTrail) && props.auditTrail.length) {
    return props.auditTrail;
  }
  return [];
});

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

function formatTinValue(value, { padLastBlock = false } = {}) {
  let digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 12);
  if (padLastBlock && digits.length === 9) {
    digits = `${digits}000`;
  }

  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 9));
  if (digits.length > 9) parts.push(digits.slice(9, 12));
  return parts.join("-");
}

function attachmentFileName(file) {
  if (!file) return "";
  if (typeof file === "string")
    return file.split("/").pop() || "Attached Report";
  if (Array.isArray(file)) {
    const first = file[0];
    if (typeof first === "string")
      return first.split("/").pop() || "Attached Report";
  }
  return file.name || "Attached Report";
}

function attachmentFileSize(file) {
  if (!file || typeof file === "string" || !file.size) return "";
  return `${(file.size / 1024 / 1024).toFixed(2)} MB`;
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

watch(
  () => [props.selectedAdvance?.id, props.existingLiquidation?.id],
  () => {
    handleCloseReceiptDetails();
  },
);

const normalizedViewReceipt = computed(() => {
  const r = selectedViewReceipt.value;
  if (!r) return null;
  const rawPath = r.filePath || r.file_path;
  const imageUrl = rawPath ? getFileUrl(rawPath) : (r.thumbnail || r.preview || r.file_url || null);
  const vatClass = r.vatClassification || r.vat_classification || "VAT";
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
    currency: r.currency || "PHP",
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

  <div v-else class="flex flex-col gap-6 p-4 shadow-sm card sm:p-6 w-full min-w-0 max-w-full overflow-hidden">
    <div
      class="flex flex-col gap-3 pb-4 border-b border-slate-100 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="min-w-0">
        <h3 class="text-base font-bold text-primary">
          {{ selectedAdvance.purpose }}
        </h3>
      </div>
      <div class="sm:text-right">
        <p class="text-xs font-medium text-slate-500 mb-1">
          Outstanding Balance
        </p>
        <p class="text-xl font-bold text-primary">
          {{ formatPeso(selectedAdvance.balance || 0) }}
        </p>
      </div>
    </div>

    <!-- Mini Unified Roadmap (horizontal progress snapshot) -->
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

    <div class="pt-4 border-t border-slate-100 space-y-3">
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
          empty-action-label="Upload Receipt"
          add-action-label="Upload Receipt"
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
                    {{ formatPeso(getReceiptAmount(receipt)) }}
                  </span>
                </div>

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

    <section
      class="p-5 sm:p-6 bg-white border rounded-2xl border-slate-200/90 shadow-sm space-y-3"
    >
      <input
        ref="reportAttachmentInput"
        type="file"
        accept="image/*,.pdf,.docx"
        class="hidden"
        :disabled="isFormDisabled"
        @change="(e) => $emit('file-selected', e)"
      />

      <div class="flex items-center justify-between">
        <label class="input-label !mb-0">
          Explanation
          <span v-if="variance > 0" class="text-danger ml-0.5">*</span>
        </label>
      </div>

      <div
        v-if="reportAttachment"
        class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3"
      >
        <div class="flex min-w-0 items-center gap-3">
          <FileText class="h-4 w-4 shrink-0 text-slate-400" />
          <div class="min-w-0">
            <p class="truncate text-sm text-slate-700">
              {{ attachmentFileName(reportAttachment) }}
            </p>
            <p
              v-if="attachmentFileSize(reportAttachment)"
              class="text-xs text-slate-400"
            >
              {{ attachmentFileSize(reportAttachment) }}
            </p>
          </div>
        </div>
        <button
          v-if="!isFormDisabled"
          class="rounded-full p-1.5 text-slate-400 transition-colors hover:text-danger hover:bg-red-50"
          type="button"
          aria-label="Remove report attachment"
          @click="$emit('file-cleared')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div
        class="relative rounded-xl border border-slate-200 bg-white transition overflow-hidden"
        :class="
          isFormDisabled
            ? 'bg-slate-50 cursor-not-allowed select-none'
            : 'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary'
        "
      >
        <textarea
          :value="shortfallExplanation"
          @input="
            (e) =>
              $emit('update:shortfallExplanation', e.target.value.slice(0, 255))
          "
          rows="4"
          maxlength="255"
          :tabindex="isFormDisabled ? -1 : 0"
          :readonly="isFormDisabled"
          :disabled="isFormDisabled"
          class="w-full resize-none border-0 bg-transparent p-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:text-slate-500 min-h-[130px]"
          :class="{
            'pointer-events-none select-none cursor-not-allowed':
              isFormDisabled,
          }"
          :placeholder="
            variance > 0
              ? 'Explain why the total expense is less than the advanced amount...'
              : 'Provide an explanation for this liquidation...'
          "
        />
        <div
          class="flex items-center justify-end px-4 pb-3 pt-1 text-xs font-medium text-slate-400 select-none"
        >
          <span>{{ (shortfallExplanation || "").length }} / 255</span>
        </div>
      </div>
    </section>

    <section
      v-if="existingLiquidation?.admin_note || existingLiquidation?.adminNote"
      class="p-4 bg-white border rounded-xl border-slate-200"
    >
      <p class="text-sm font-semibold text-slate-700">Admin Notes</p>
      <p class="mt-2 text-sm leading-relaxed text-slate-600">
        {{ existingLiquidation.admin_note || existingLiquidation.adminNote }}
      </p>
    </section>

    <div class="p-4 mt-2 border border-slate-200 bg-clinical/20 sm:p-5">
      <h4 class="text-sm font-semibold text-slate-700 mb-4">
        Settlement Summary
      </h4>

      <div class="flex">
        <div class="w-full space-y-4">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-slate-600">Total Balance</span>
            <span class="font-bold text-primary">{{
              formatPeso(selectedAdvance.balance ?? selectedAdvance.amount ?? 0)
            }}</span>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-slate-600">Total Expenses</span>
            <span class="font-bold text-danger"
              >-{{ formatPeso(totalExpenseAmount) }}</span
            >
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

    <!-- Audit Trail Section -->
    <BaseAuditTrail
      v-if="resolvedAuditTrail && resolvedAuditTrail.length"
      :trail="resolvedAuditTrail"
      :entity-title="
        existingLiquidation
          ? `Liquidation-#${existingLiquidation.id}`
          : `Advance-#${selectedAdvance?.id}`
      "
      class="mt-4"
    />

    <div class="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
          receipts.length === 0 ||
          hasIncompleteReceiptFields ||
          receipts.some((r) => r.ocrStatus === 'processing') ||
          totalExpenseAmount === 0 ||
          submitting ||
          (variance > 0 && !shortfallExplanation.trim())
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
