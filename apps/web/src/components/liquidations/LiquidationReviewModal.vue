<script setup>
import { computed, ref } from "vue";
import { X, XCircle, ShieldCheck, Eye, FileText, Download } from "lucide-vue-next";
import { formatPeso, formatDate } from "@/utils/formatters";
import { downloadSbsiReportPdf } from "@/utils/sbsiPdfGenerator";
import BaseButton from "@/components/base/BaseButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import DaysLeftBadge from "@/components/base/DaysLeftBadge.vue";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";
import ReceiptImagePreview from "@/components/base/ReceiptImagePreview.vue";
import UnifiedRoadmapStepper from "@/components/base/UnifiedRoadmapStepper.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import SbsiReportPreviewModal from "@/components/base/SbsiReportPreviewModal.vue";
import { useLiquidationStore } from "@/stores/liquidation";
import { useReportExport } from "@/composables/useReportExport";

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  reviewingCase: {
    type: Object,
    default: null,
  },
  reviewStatus: {
    type: String,
    required: true,
  },
  reviewOutstandingBalance: {
    type: [Number, String],
    required: true,
  },
  reviewReceipts: {
    type: Array,
    default: () => [],
  },
  acceptedReviewTotal: {
    type: [Number, String],
    default: 0,
  },
  isReviewingOwnLiquidation: {
    type: Boolean,
    default: false,
  },
  getFileUrl: {
    type: Function,
    required: true,
  },
  formatDateOnly: {
    type: Function,
    default: formatDate,
  },
});

const emit = defineEmits(["close", "view-receipt", "reject", "approve", "navigate"]);

const liqStore = useLiquidationStore();
const { isExporting, exportReport } = useReportExport();

const isReportPreviewOpen = ref(false);
const resolvedTemplateData = computed(
  () =>
    props.reviewingCase?.reportTemplateData ||
    props.reviewingCase?.report_template_data ||
    null,
);
const resolvedReportUrl = computed(() => {
  if (!props.reviewingCase) return null;
  if (props.reviewingCase.reportUrl) return props.reviewingCase.reportUrl;
  if (props.reviewingCase.reportFilePath) {
    return props.getFileUrl(props.reviewingCase.reportFilePath) || props.reviewingCase.reportFilePath;
  }
  return null;
});
const hasReportAttachment = computed(() =>
  Boolean(
    props.reviewingCase?.reportFilePath ||
    props.reviewingCase?.reportUrl ||
    resolvedTemplateData.value,
  ),
);

function handleFallbackPdfDownload() {
  if (!resolvedTemplateData.value) return;
  downloadSbsiReportPdf(
    resolvedTemplateData.value,
    props.reviewingCase?.id ? `SBSI-liquidation-${props.reviewingCase.id}.pdf` : null,
  );
}

/* Bridge unified roadmap props from reviewingCase */
const roadmapCashAdvance = computed(() => {
  const rc = props.reviewingCase || {};
  // reviewingCase may have cash_advance nested from backend via liqStore raw, or mapped fields
  if (rc.cash_advance) return rc.cash_advance;
  if (rc.cashAdvance) return rc.cashAdvance;
  // fallback fabricate minimal cash-advance shape
  return {
    id: rc.cash_advance_id ?? rc.cashAdvanceId ?? rc.advanceId ?? rc.id,
    status: rc.cashAdvanceStatus || rc.advanceStatus || "signed",
    amount: rc.cashAdvanceAmount,
    balance: rc.outstandingBalance,
    expected_liquidation_date: rc.dueDate,
    dueDate: rc.dueDate,
    pending: false,
  };
});

const roadmapLiquidation = computed(() => {
  const rc = props.reviewingCase || {};
  // raw settlement if available via liqStore
  const raw = liqStore.settlements.find(
    (s) => `LIQ-${String(s.id).padStart(3, "0")}` === rc.id || String(s.id) === String(rc.databaseId)
  );
  if (raw) {
    return {
      id: raw.id,
      status: raw.status,
      revision_count: raw.revision_count,
      total_expense_amount: raw.total_expense_amount,
      penalties: raw.penalties,
    };
  }
  return {
    id: rc.databaseId ?? rc.id,
    status: props.reviewStatus,
    revision_count: rc.revision_count,
    total_expense_amount: rc.submittedReceiptTotal ?? rc.acceptedTotal,
    penalties: rc.penalties,
  };
});

const roadmapHistory = computed(() => {
  const rc = props.reviewingCase || {};
  return rc.status_history || rc.statusHistory || rc.history || rc.audit_logs || [];
});

const roadmapPenalties = computed(() => {
  const rc = props.reviewingCase || {};
  if (Array.isArray(rc.penalties)) return rc.penalties;
  if (Array.isArray(roadmapCashAdvance.value?.penalties)) return roadmapCashAdvance.value.penalties;
  return [];
});

const roadmapAging = computed(() => {
  try {
    return liqStore.calculateAging(roadmapCashAdvance.value || {});
  } catch {
    return null;
  }
});

const roadmapOverpayment = computed(() => {
  const total = Number(roadmapLiquidation.value?.total_expense_amount ?? 0);
  const bal = Number(roadmapCashAdvance.value?.amount ?? roadmapCashAdvance.value?.balance ?? props.reviewingCase?.cashAdvanceAmount ?? 0);
  return Math.max(0, total - bal);
});

const isCaseOverdue = computed(() => {
  if (String(props.reviewStatus).toLowerCase().trim() === "overdue") return true;
  if (roadmapAging.value?.isOverdue) return true;
  const due = props.reviewingCase?.dueDate || props.reviewingCase?.expected_liquidation_date || roadmapCashAdvance.value?.expected_liquidation_date;
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return d < today;
});

function handleRoadmapNavigate(payload) {
  emit("navigate", payload);
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="isOpen && reviewingCase"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        class="relative bg-white w-full max-w-[960px] rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden max-h-[96vh]"
        @click.stop
      >
        <!-- Close Button -->
        <button
          @click="$emit('close')"
          class="absolute top-2 right-2 text-slate-400 hover:bg-slate-100 transition-colors p-1.5 rounded-full flex items-center justify-center z-10"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- Header -->
        <div class="px-6 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">
                Liquidation {{ reviewingCase.id }}
              </p>
              <h2 class="text-2xl font-bold text-slate-800">
                {{ formatPeso(reviewingCase.cashAdvanceAmount) }}
              </h2>
            </div>
            <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <DaysLeftBadge
                v-if="reviewingCase.dueDate || roadmapCashAdvance?.expected_liquidation_date"
                :due-date="reviewingCase.dueDate || roadmapCashAdvance?.expected_liquidation_date"
                :start-date="reviewingCase.dateOfAdvances || reviewingCase.createdAt || roadmapCashAdvance?.date"
                :status="reviewStatus"
                :is-overdue="isCaseOverdue"
              />
              <StatusBadge :status="reviewStatus" />
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div v-if="String(reviewStatus).toLowerCase() === 'revise'" class="p-3 rounded-lg border border-orange-200 bg-orange-50">
            <p class="text-[11px] text-orange-600 uppercase tracking-wide font-bold">Needs Revision — Attempt {{ reviewingCase.revision_count || 1 }}/3</p>
            <p class="text-sm text-orange-800 mt-1">{{ reviewingCase.adminNote || 'Please revise per admin feedback.' }}</p>
          </div>
          <!-- UNIFIED 8-step Roadmap -->
          <UnifiedRoadmapStepper
            :cash-advance="roadmapCashAdvance"
            :liquidation="roadmapLiquidation"
            :status-history="roadmapHistory"
            :penalties="roadmapPenalties"
            :overpayment-amount="roadmapOverpayment"
            :aging="roadmapAging"
            @navigate="handleRoadmapNavigate"
          />

          <!-- Details Grid -->
          <section class="grid grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-slate-100">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Employee Name</p>
              <p class="text-sm text-slate-700">{{ reviewingCase.requestorName || "--" }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Due Date</p>
              <p class="text-sm text-slate-700">{{ formatDateOnly(reviewingCase.dueDate) }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Outstanding Balance</p>
              <p class="text-sm font-semibold text-primary">{{ formatPeso(reviewOutstandingBalance) }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Advance Date</p>
              <p class="text-sm text-slate-700">{{ formatDateOnly(reviewingCase.dateOfAdvances) }}</p>
            </div>
          </section>

          <!-- Receipts -->
          <div>
            <div class="flex items-center justify-between gap-3 mb-3">
              <h3 class="text-sm font-medium text-slate-700">
                Receipts ({{ reviewReceipts.length }})
              </h3>
              <BaseButton
                data-testid="export-admin-liquidation-report-btn"
                variant="secondary"
                size="sm"
                type="button"
                :loading="isExporting"
                :disabled="isExporting"
                @click="exportReport('liquidation', reviewingCase.databaseId ?? reviewingCase.id)"
              >
                <Download class="w-3.5 h-3.5" />
                <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
              </BaseButton>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <article
                v-for="(receipt, idx) in reviewReceipts"
                :key="receipt.id"
                class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between gap-3 shadow-sm"
              >
                <!-- Reusable Receipt Image Preview (with zoom & clean title) -->
                <ReceiptImagePreview
                  :index="idx + 1"
                  :file-name="receipt.fileName || receipt.name || receipt.merchantName || `receipt_${receipt.id}`"
                  :src="receipt.filePath ? getFileUrl(receipt.filePath) : (receipt.thumbnail || receipt.preview || receipt.file_url)"
                  :file-type="receipt.fileType"
                  :alt="receipt.merchantName || 'Receipt'"
                  :enable-zoom="true"
                  :show-badge="true"
                  :show-delete-button="false"
                  :receipt="receipt"
                />

                <!-- Receipt Info & Details Action -->
                <div class="space-y-2.5 pt-2 border-t border-slate-100">
                  <div class="flex justify-between items-start gap-2">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-slate-800 truncate">
                        {{ receipt.merchantName || "Receipt" }}
                      </p>
                      <p class="text-xs text-slate-400 mt-0.5">
                        {{ receipt.location || "--" }}
                      </p>
                    </div>
                    <StatusBadge :status="receipt.decision === 'accepted' ? 'approved' : receipt.decision" />
                  </div>

                  <div class="flex justify-between items-center">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-primary bg-primary/5 px-2 py-0.5 rounded">
                      {{ receipt.category || "General" }}
                    </span>
                    <span class="text-sm font-semibold text-slate-800">
                      {{ formatPeso(receipt.amount || 0) }}
                    </span>
                  </div>

                  <button
                    class="w-full py-2 bg-slate-50 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5"
                    type="button"
                    @click="$emit('view-receipt', receipt)"
                  >
                    <Eye class="w-3.5 h-3.5" />
                    Details
                  </button>
                </div>
              </article>
            </div>
          </div>

          <!-- Admin Notes -->
          <div
            v-if="reviewingCase.adminNote"
            class="pt-2 border-t border-slate-100"
          >
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Admin Notes</p>
            <p class="text-sm text-slate-700">{{ reviewingCase.adminNote }}</p>
          </div>

          <!-- Report Attachment -->
          <div v-if="hasReportAttachment" class="pt-2">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Report Attachment</p>
            <div class="flex flex-wrap items-center gap-3">
              <BaseButton
                data-testid="preview-liquidation-report-btn"
                variant="outline"
                size="sm"
                type="button"
                @click="isReportPreviewOpen = true"
              >
                <Eye class="w-3.5 h-3.5" />
                <span>Preview Report</span>
              </BaseButton>
              <a
                v-if="reviewingCase.reportUrl || reviewingCase.reportFilePath"
                :href="reviewingCase.reportUrl || getFileUrl(reviewingCase.reportFilePath)"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="download-liquidation-report-link"
                class="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <FileText class="w-3.5 h-3.5" />
                <span>View / Download Report</span>
                <Download class="w-3 h-3" />
              </a>
              <BaseButton
                v-else-if="resolvedTemplateData"
                data-testid="download-liquidation-report-pdf-btn"
                variant="ghost"
                size="sm"
                type="button"
                @click="handleFallbackPdfDownload"
              >
                <Download class="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </BaseButton>
            </div>
          </div>

          <!-- Audit Trail Section -->
          <BaseAuditTrail
            :trail="reviewingCase.audit_trail || []"
            :entity-title="`Liquidation-#${reviewingCase.id}`"
            class="mt-4"
          />
        </div>

        <!-- Footer -->
        <footer class="px-6 py-4 border-t border-slate-100 shrink-0">
          <div
            v-if="reviewingCase.status !== 'Liquidated' && reviewingCase.status !== 'Rejected'"
            class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="text-sm font-semibold text-slate-500">
              Accepted receipts total:
              <span class="font-bold text-primary">{{ formatPeso(acceptedReviewTotal) }}</span>
            </div>
            <p
              v-if="isReviewingOwnLiquidation"
              class="text-sm font-semibold text-danger"
            >
              You cannot process your own liquidation settlement.
            </p>
            <div class="flex gap-2">
              <select
                @change="$emit('reject', $event.target.value); $event.target.value=''"
                class="flex-1 sm:flex-none py-2.5 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg bg-white hover:bg-slate-50 transition-colors text-center"
                :disabled="isReviewingOwnLiquidation"
                value=""
              >
                <option value="" disabled selected>Actions ▾</option>
                <option value="revise">Request Revision</option>
                <option value="reject">Reject</option>
              </select>
              <button
                class="flex-1 sm:flex-none py-2.5 px-5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                :disabled="isReviewingOwnLiquidation"
                @click="$emit('approve')"
              >
                <ShieldCheck class="w-4 h-4 inline-block mr-1" />
                Approve
              </button>
            </div>
          </div>
          <div
            v-else
            class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="text-sm font-semibold text-slate-500">
              Liquidation status:
              <StatusBadge :status="reviewingCase.status" />
            </div>
          </div>
        </footer>
      </div>
    </div>
  </Transition>

  <SbsiReportPreviewModal
    :is-open="isReportPreviewOpen"
    :template-data="resolvedTemplateData"
    fallback-type="liquidation"
    :record="reviewingCase"
    :file-url="resolvedReportUrl"
    @close="isReportPreviewOpen = false"
  />
</template>
