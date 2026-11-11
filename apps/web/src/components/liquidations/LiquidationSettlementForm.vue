<script setup>
import { computed, ref } from "vue";
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
} from "lucide-vue-next";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseToggleSwitch from "@/components/base/BaseToggleSwitch.vue";
import FileUpload from "@/components/base/FileUpload.vue";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import UnifiedRoadmapStepper from "@/components/base/UnifiedRoadmapStepper.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import { useLiquidationStore } from "@/stores/liquidation";
import { useOcrMode } from "@/composables/useOcrMode";
import { useReportExport } from "@/composables/useReportExport";
import { formatPeso } from "@/utils/formatters";
import { apiFetch } from "@/utils/apiFetch";

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

const { isMockOcr, setMockMode } = useOcrMode();
const { isExporting, exportReport } = useReportExport();

function handleExportLiquidationReport() {
  if (props.existingLiquidation?.id) {
    exportReport("liquidation", props.existingLiquidation.id);
  } else if (props.selectedAdvance?.id) {
    exportReport("liquidation", props.selectedAdvance.id, { byCashAdvance: true });
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
    props.existingLiquidation?.status ||
    props.selectedAdvance?.status ||
    "";
  const key = String(status).toLowerCase().trim().replace(/[\s/_-]+/g, "-");
  if (key === "under-review" || key === "pending" || key === "pending-under-review") return "Under Review";
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
  return sa.status_history || sa.statusHistory || sa.history || sa.audit_logs || [];
});
const roadmapPenalties = computed(() => {
  const sa = props.selectedAdvance;
  if (sa?.penalties && Array.isArray(sa.penalties)) return sa.penalties;
  return [];
});
const roadmapAging = computed(() => {
  if (!props.selectedAdvance) return null;
  try { return liqStore.calculateAging(props.selectedAdvance); } catch { return null; }
});

async function handleRemoveReceipt(receiptToRemove) {
  const updated = props.receipts.filter(
    (r) => r !== receiptToRemove && (!receiptToRemove.id || r.id !== receiptToRemove.id)
  );
  emit("update:receipts", updated);

  const existingIds = new Set(
    (props.existingLiquidation?.receipts || []).map((r) => r.id)
  );
  if (
    receiptToRemove?.id &&
    !existingIds.has(receiptToRemove.id) &&
    !String(receiptToRemove.id).startsWith("temp-")
  ) {
    try {
      await apiFetch(`/api/serms/reimbursements/receipts/${receiptToRemove.id}`, {
        method: "DELETE",
      });
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
</script>

<template>
  <div
    v-if="!selectedAdvance"
    class="flex min-h-64 flex-col items-center justify-center gap-4 border-2 border-dashed bg-clinical/20 p-8 text-center card sm:p-16 xl:h-full"
  >
    <FilePieChart class="w-10 h-10 text-slate-200" />
    <p class="text-sm text-slate-400">
      Select a cash advance to liquidate
    </p>
  </div>

  <div
    v-else-if="submitted"
    class="flex flex-col items-center gap-6 p-8 text-center card sm:p-12"
  >
    <CheckCircle class="w-12 h-12 text-emerald-600" />
    <h3 class="text-lg font-semibold text-primary">
      Submitted
    </h3>
    <p class="text-sm text-slate-500">
      Your liquidation has been submitted for review.
    </p>
    <BaseButton variant="secondary" @click="$emit('reload-console')">
      Back to Liquidations
    </BaseButton>
  </div>

  <div
    v-else
    class="flex flex-col gap-6 p-4 shadow-sm card sm:p-6"
  >
    <div
      class="flex flex-col gap-3 pb-4 border-b border-slate-100 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="min-w-0">
        <h3 class="text-base font-bold text-primary">
          {{ selectedAdvance.purpose }}
        </h3>
        <p class="mt-1 text-sm font-medium text-slate-500">
          Ref: {{ selectedAdvance.id }}
        </p>
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
      v-if="String(existingLiquidation?.status || '').toLowerCase() === 'revise'"
      class="flex flex-col gap-1 rounded-lg border border-orange-200 bg-orange-50 p-3"
    >
      <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-700">
        <AlertTriangle class="h-4 w-4 shrink-0" />
        <span>Needs Revision — Attempt {{ existingLiquidation?.revision_count || 1 }}/3</span>
      </div>
      <p class="text-sm text-orange-800">
        {{ existingLiquidation?.admin_note || existingLiquidation?.adminNote || 'Please revise per admin feedback and resubmit.' }}
      </p>
      <p class="text-xs text-orange-700/70">Edit the receipts below and click Update — it will return to Pending.</p>
    </div>

    <!-- Awaiting Acknowledgement — Preview Only (Phase 1) -->
    <div
      v-else-if="requiresAcknowledgement"
      class="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800"
    >
      <AlertCircle class="h-4 w-4 shrink-0 text-amber-600" />
      <span>
        This cash advance must be <strong class="text-amber-900">acknowledged (signed)</strong> before liquidation. You are in <strong>Phase 1</strong> — preview only until acknowledgement is complete.
      </span>
    </div>

    <!-- Status Banner for Disabled / Read-Only View -->
    <div
      v-else-if="isFormDisabled"
      class="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-600"
    >
      <AlertCircle class="h-4 w-4 shrink-0 text-slate-500" />
      <span>
        This liquidation request is currently <strong class="text-slate-800">{{ currentStatusLabel }}</strong> and is in read-only mode.
      </span>
    </div>

    <div class="pt-4 border-t border-slate-100 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="input-label !mb-0">
          Receipt Attachments ({{ receipts.length }})
        </label>
        <div class="flex items-center gap-3">
          <BaseToggleSwitch
            v-if="!isFormDisabled"
            :model-value="isMockOcr"
            @update:model-value="setMockMode"
            hint="Mock uploads file, fills instantly, skips OCR wait"
          />
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
        <p class="text-[11px] text-slate-400">
          {{ isMockOcr ? "Fast — real file upload, instant mock data." : "Online — uses ocr-pipeline with polling." }}
        </p>
        <FileUpload
          :model-value="receipts"
          @update:model-value="$emit('update:receipts', $event)"
          :max-size-mb="2"
          :mock-mode="isMockOcr"
          empty-action-label="Upload Receipt"
          add-action-label="Upload Receipt"
          @upload-error="$emit('upload-error', $event)"
        />
      </template>
    </div>

    <ScannedReceiptsList
      v-if="receipts.length > 0"
      :receipts="receipts"
      :categories="receiptCategoryOptions"
      :allow-remove="!isFormDisabled"
      :disabled="isFormDisabled"
      @remove-receipt="handleRemoveReceipt"
    />

    <section class="p-4 space-y-3 bg-white border rounded-xl border-slate-200">
      <input
        ref="reportAttachmentInput"
        type="file"
        accept="image/*,.pdf,.docx"
        class="hidden"
        :disabled="isFormDisabled"
        @change="(e) => $emit('file-selected', e)"
      />

      <div class="flex items-center justify-between">
        <label class="input-label !mb-0">Report Letter</label>
        <BaseButton
          v-if="!reportAttachment && !isFormDisabled"
          variant="primary"
          size="sm"
          type="button"
          @click="reportAttachmentInput?.click()"
        >
          Browse
        </BaseButton>
      </div>

      <div v-if="reportAttachment" class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
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

      <p
        v-if="!reportAttachment && !needsReportAttachmentReminder"
        class="text-xs text-slate-400"
      >
        Images, PDF, or DOCX accepted.
      </p>

      <!-- Shortfall Explanation -->
      <div v-if="variance > 0" class="pt-2 border-t border-slate-100">
        <label class="block space-y-1">
          <span class="input-label"
            >Shortfall Explanation <span class="text-danger">*</span></span
          >
          <textarea
            :value="shortfallExplanation"
            @input="(e) => $emit('update:shortfallExplanation', e.target.value)"
            rows="2"
            class="bg-white resize-none input"
            :disabled="isFormDisabled"
            :class="{ 'cursor-not-allowed bg-slate-100 text-slate-500': isFormDisabled }"
            placeholder="Explain why the total expense is less than the advanced amount..."
          />
        </label>
      </div>

      <p
        v-if="needsReportAttachmentReminder"
        class="flex items-center gap-2 text-xs text-amber-600"
      >
        <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
        Please attach a report letter for overpayment.
      </p>
    </section>

    <section
      v-if="existingLiquidation?.admin_note || existingLiquidation?.adminNote"
      class="p-4 bg-white border rounded-xl border-slate-200"
    >
      <p class="text-sm font-semibold text-slate-700">
        Admin Notes
      </p>
      <p class="mt-2 text-sm leading-relaxed text-slate-600">
        {{ existingLiquidation.admin_note || existingLiquidation.adminNote }}
      </p>
    </section>

    <div class="p-4 mt-2 border border-slate-200 bg-clinical/20 sm:p-5">
      <h4 class="text-sm font-semibold text-slate-700 mb-4">Settlement Summary</h4>

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
          <p class="inline-flex items-center gap-2 text-base font-bold font-heading text-primary">
            <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">9</span>
            Overpayment → Forward to Reimbursement
          </p>
          <p class="mt-1 text-sm leading-relaxed text-slate-600">
            Step <span class="font-bold text-primary">9</span> — Any excess amount spent beyond the cash advance can be filed as a
            reimbursement. Current excess amount:
            <span class="font-bold text-primary">{{
              formatPeso(overpaymentAmount)
            }}</span
            >.
          </p>
          <p class="mt-1 text-[11px] text-slate-400">Shows as optional step 9 in the roadmap above. Click below to create a reimbursement linked to this advance.</p>
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
      :entity-title="existingLiquidation ? `Liquidation-#${existingLiquidation.id}` : `Advance-#${selectedAdvance?.id}`"
      class="mt-4"
    />

    <div class="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <BaseButton
        v-if="existingLiquidation && existingLiquidation.status === 'pending'"
        id="delete-liquidation-btn"
        variant="danger"
        class="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white sm:w-fit"
        :disabled="submitting"
        @click="$emit('delete-liquidation')"
      >
        Delete
      </BaseButton>

      <BaseButton
        id="submit-liquidation-btn"
        variant="primary"
        class="min-h-[42px] w-full sm:w-fit"
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
            existingLiquidation
              ? "Updating..."
              : "Submitting..."
          }}</span>
        </div>
        <div v-else class="flex items-center gap-2">
          <Upload class="w-4 h-4" />
          <span>{{
            existingLiquidation ? "Update" : "Submit"
          }}</span>
        </div>
      </BaseButton>
    </div>
  </div>
</template>
