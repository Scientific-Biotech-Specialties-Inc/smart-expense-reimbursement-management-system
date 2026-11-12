<script setup>
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { formatAmount, formatDate } from "@/utils/formatters";
import BaseButton from "@/components/base/BaseButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import { useReportExport } from "@/composables/useReportExport";
import {
  X,
  FileText,
  Download,
  Eye,
  Wallet,
} from "lucide-vue-next";

const props = defineProps({
  viewingRecord: {
    type: Object,
    default: null,
  },
  receiptDetailsOpen: {
    type: Boolean,
    default: false,
  },
  modalLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "close",
  "view-receipt-details",
  "reject",
  "approve",
  "grant",
  "edit",
  "forward-receipts",
]);

const auth = useAuthStore();
const { isExporting, exportReport } = useReportExport();

const activeReceiptItems = computed(() => props.viewingRecord?.receipts || []);
const isOwnSubmission = computed(() => {
  const currentUserId = auth.user?.id;
  const ownerId =
    props.viewingRecord?.user?.id ??
    props.viewingRecord?.user_id ??
    props.viewingRecord?.userId ??
    props.viewingRecord?.submitted_by;

  return (
    currentUserId !== null &&
    currentUserId !== undefined &&
    ownerId !== null &&
    ownerId !== undefined &&
    String(currentUserId) === String(ownerId)
  );
});

function normalizeStatus(status) {
  const normalized = String(status || "").toLowerCase();
  const statusMap = {
    submitted: "pending",
    review: "pending",
    draft: "pending",
    reject: "rejected",
    rejected: "rejected",
    paid: "granted",
    processing: "processing",
  };
  return statusMap[normalized] || normalized;
}

function categoryName(record) {
  return record?.expense_category?.name || record?.category?.name || record?.category || "Uncategorized";
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="viewingRecord"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        class="relative bg-white w-full max-w-[960px] rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden max-h-[96vh]"
        @click.stop
      >
        <!-- Close Button -->
        <button
          @click="emit('close')"
          class="absolute top-2 right-2 text-slate-400 hover:bg-slate-100 transition-colors p-1.5 rounded-full flex items-center justify-center z-10"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- Header -->
        <div class="px-6 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">
                Reimbursement Ref #{{ viewingRecord.id }}
              </p>
              <h2 class="text-2xl font-bold text-slate-800">
                {{ formatAmount(viewingRecord.amount || 0, viewingRecord.currency || 'PHP') }}
              </h2>
            </div>
            <StatusBadge :status="viewingRecord.status" />
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <!-- Loading -->
          <div v-if="modalLoading" class="flex items-center justify-center py-16">
            <p class="text-sm text-slate-400">Loading...</p>
          </div>

          <template v-else>
            <!-- Timeline -->
            <section class="relative">
              <!-- Horizontal line -->
              <div class="absolute top-4 -translate-y-1/2 left-[16.66%] right-[16.66%] h-0.5 bg-slate-100"></div>

              <div class="flex justify-between gap-2">
                <!-- Step 1: Submitted -->
                <div class="relative flex flex-col items-center text-center flex-1">
                  <div class="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-4 ring-white z-10 shrink-0 mb-2">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p class="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Submitted</p>
                  <p class="text-xs text-slate-700 font-medium truncate max-w-full px-1">
                    {{ viewingRecord.user?.name || viewingRecord.submitted_by_name || "Employee" }}
                  </p>
                </div>

                <!-- Step 2: Under Review -->
                <div class="relative flex flex-col items-center text-center flex-1">
                  <div
                    :class="[
                      'h-8 w-8 rounded-full flex items-center justify-center ring-4 ring-white z-10 shrink-0 mb-2',
                      ['approved', 'granted', 'rejected'].includes(normalizeStatus(viewingRecord.status))
                        ? 'bg-emerald-500 text-white'
                        : normalizeStatus(viewingRecord.status) === 'pending'
                          ? 'bg-amber-400 text-white animate-pulse'
                          : 'bg-slate-200 text-slate-400'
                    ]"
                  >
                    <svg v-if="['approved', 'granted', 'rejected'].includes(normalizeStatus(viewingRecord.status))" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                    <svg v-else-if="normalizeStatus(viewingRecord.status) === 'pending'" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none" /></svg>
                    <span v-else class="text-[10px] font-bold">2</span>
                  </div>
                  <p class="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Review</p>
                  <p class="text-xs font-medium truncate max-w-full px-1"
                    :class="normalizeStatus(viewingRecord.status) === 'pending' ? 'text-amber-600' : 'text-slate-700'"
                  >
                    {{ normalizeStatus(viewingRecord.status) === 'pending' ? 'In Progress' : 'Reviewed' }}
                  </p>
                </div>

                <!-- Step 3: Decision -->
                <div class="relative flex flex-col items-center text-center flex-1">
                  <div
                    :class="[
                      'h-8 w-8 rounded-full flex items-center justify-center ring-4 ring-white z-10 shrink-0 mb-2',
                      normalizeStatus(viewingRecord.status) === 'approved' || normalizeStatus(viewingRecord.status) === 'granted'
                        ? 'bg-emerald-500 text-white'
                        : normalizeStatus(viewingRecord.status) === 'rejected'
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-200 text-slate-400'
                    ]"
                  >
                    <svg v-if="normalizeStatus(viewingRecord.status) === 'approved' || normalizeStatus(viewingRecord.status) === 'granted'" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                    <svg v-else-if="normalizeStatus(viewingRecord.status) === 'rejected'" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    <span v-else class="text-[10px] font-bold">3</span>
                  </div>
                  <p class="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Decision</p>
                  <p class="text-xs font-medium truncate max-w-full px-1"
                    :class="[
                      normalizeStatus(viewingRecord.status) === 'approved' || normalizeStatus(viewingRecord.status) === 'granted' ? 'text-emerald-600' : '',
                      normalizeStatus(viewingRecord.status) === 'rejected' ? 'text-red-600' : '',
                      normalizeStatus(viewingRecord.status) === 'pending' ? 'text-slate-400' : '',
                    ]"
                  >
                    {{ normalizeStatus(viewingRecord.status) === 'approved' ? 'Approved' : normalizeStatus(viewingRecord.status) === 'granted' ? 'Granted' : normalizeStatus(viewingRecord.status) === 'rejected' ? 'Rejected' : 'Awaiting' }}
                  </p>
                </div>

                <!-- Step 4: Released -->
                <div class="relative flex flex-col items-center text-center flex-1">
                  <div
                    :class="[
                      'h-8 w-8 rounded-full flex items-center justify-center ring-4 ring-white z-10 shrink-0 mb-2',
                      normalizeStatus(viewingRecord.status) === 'granted'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-400'
                    ]"
                  >
                    <svg v-if="normalizeStatus(viewingRecord.status) === 'granted'" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                    <span v-else class="text-[10px] font-bold">4</span>
                  </div>
                  <p class="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Released</p>
                  <p class="text-xs font-medium truncate max-w-full px-1"
                    :class="normalizeStatus(viewingRecord.status) === 'granted' ? 'text-emerald-600' : 'text-slate-400'"
                  >
                    {{ normalizeStatus(viewingRecord.status) === 'granted' ? 'Disbursed' : 'Pending' }}
                  </p>
                </div>
              </div>
            </section>

            <!-- Request Details -->
            <section class="grid grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-slate-100">
              <div>
                <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Submitted By</p>
                <p class="text-sm text-slate-700">{{ viewingRecord.user?.name || viewingRecord.submitted_by_name || "Employee" }}</p>
              </div>
              <div v-if="viewingRecord.event_type">
                <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Type of Event</p>
                <p class="text-sm text-slate-700">{{ viewingRecord.event_type }}</p>
              </div>
              <div v-if="['approved', 'granted'].includes(normalizeStatus(viewingRecord.status)) || viewingRecord.approved_by">
                <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Approved By</p>
                <p class="text-sm text-slate-700">
                  {{ viewingRecord.approved_by || "Approver" }}
                  <span v-if="viewingRecord.approved_at" class="text-xs text-slate-400">
                    &bull; {{ formatDate(viewingRecord.approved_at) }}
                  </span>
                </p>
              </div>
              <div v-if="viewingRecord.report_url || viewingRecord.report_file_path" class="col-span-2">
                <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Report</p>
                <a
                  :href="viewingRecord.report_url"
                  target="_blank"
                  class="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <FileText class="w-3.5 h-3.5" />
                  <span>Download Report</span>
                  <Download class="w-3 h-3" />
                </a>
              </div>
              <div class="col-span-2">
                <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">User Comment</p>
                <div
                  v-if="viewingRecord.user_comment"
                  class="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed"
                >
                  {{ viewingRecord.user_comment }}
                </div>
                <p v-else class="text-xs text-slate-400 italic">
                  No comment provided
                </p>
              </div>
            </section>

            <!-- Needs Revision Banner (employee) -->
            <div
              v-if="(!auth.isAdmin || isOwnSubmission) && normalizeStatus(viewingRecord.status) === 'revise'"
              class="p-4 rounded-lg border border-orange-200 bg-orange-50"
            >
              <p class="text-[11px] text-orange-600 uppercase tracking-wide mb-1 font-bold">Needs Revision — Attempt {{ viewingRecord.revision_count || 1 }}/3 <span v-if="(viewingRecord.revision_count || 1) >= 3" class="text-red-600">(final attempt)</span></p>
              <p class="text-sm text-orange-800">{{ viewingRecord.admin_notes || viewingRecord.rejection_comment || 'Please revise your submission per admin feedback.' }}</p>
              <p class="text-[11px] text-orange-700/70 mt-2">Edit your request and resubmit — it will return to Pending.</p>
            </div>

            <!-- Rejection Reason (terminal) -->
            <div
              v-if="!auth.isAdmin && normalizeStatus(viewingRecord.status) === 'rejected' && viewingRecord.admin_notes"
              class="p-4 rounded-lg border border-red-100 bg-red-50"
            >
              <p class="text-[11px] text-red-400 uppercase tracking-wide mb-1">Rejection Reason — Revision limit exceeded ({{ viewingRecord.revision_count || 4 }}/3)</p>
              <p class="text-sm text-red-700">{{ viewingRecord.admin_notes }}</p>
            </div>

            <!-- Receipts -->
            <div>
              <div class="flex items-center justify-between gap-3 mb-3">
                <h3 class="text-sm font-medium text-slate-700">
                  Receipts ({{ activeReceiptItems.length }})
                </h3>
                <BaseButton
                  data-testid="export-reimbursement-report-btn"
                  variant="secondary"
                  size="sm"
                  type="button"
                  :loading="isExporting"
                  :disabled="isExporting"
                  @click="exportReport('reimbursement', viewingRecord.id)"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
                </BaseButton>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <article
                  v-for="receipt in activeReceiptItems"
                  :key="receipt.id"
                  class="rounded-xl overflow-hidden border border-slate-200"
                >
                  <!-- Receipt Image -->
                  <BaseReceiptImage
                    :src="receipt.file_url"
                    :alt="receipt.vendor_name || 'Receipt'"
                    :file-type="receipt.file_type"
                    img-class="h-full w-full object-cover object-top"
                    container-class="bg-slate-50 aspect-[4/3] flex items-center justify-center border-b border-slate-100 overflow-hidden"
                  />

                  <!-- Receipt Info -->
                  <div class="p-3 space-y-2.5">
                    <div class="flex justify-between items-start gap-2">
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-slate-800 truncate">
                          {{ receipt.vendor_name || "Receipt" }}
                        </p>
                        <p class="text-xs text-slate-400 mt-0.5">
                          Invoice: {{ receipt.invoice_number || "--" }}
                        </p>
                      </div>
                      <StatusBadge :status="receipt.status" />
                    </div>

                    <div class="flex justify-between items-center gap-2">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-[10px] font-medium uppercase tracking-wide text-primary bg-primary/5 px-2 py-0.5 rounded">
                          {{ categoryName(receipt) }}
                        </span>
                        <span v-if="receipt.event_type" class="text-[10px] font-medium uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {{ receipt.event_type }}
                        </span>
                      </div>
                      <span class="text-sm font-semibold text-slate-800 shrink-0">
                        {{ formatAmount(receipt.total_amount || 0, receipt.currency || "PHP") }}
                      </span>
                    </div>

                    <button
                      class="w-full py-2 bg-slate-50 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5"
                      :class="receipt.status === 'processing' ? 'opacity-50 cursor-not-allowed' : ''"
                      :disabled="receipt.status === 'processing'"
                      @click="emit('view-receipt-details', receipt)"
                    >
                      <Eye v-if="receipt.status !== 'processing'" class="w-3.5 h-3.5" />
                      {{ receipt.status === 'processing' ? 'Processing...' : 'Details' }}
                    </button>
                  </div>
                </article>
              </div>
            </div>

            <!-- Audit Trail Section -->
            <BaseAuditTrail
              :trail="viewingRecord.audit_trail || []"
              :entity-title="`Reimbursement-#${viewingRecord.id}`"
              class="mt-5"
            />
          </template>
        </div>

        <!-- Footer Actions (Admin: Pending/Revise) -->
        <footer
          v-if="auth.isAdmin && viewingRecord && ['pending','revise'].includes(normalizeStatus(viewingRecord.status))"
          class="px-6 py-4 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end shrink-0"
        >
          <p
            v-if="isOwnSubmission"
            class="text-sm text-danger text-center sm:text-left w-full"
          >
            You cannot process your own request.
          </p>
          <template v-else>
            <div class="w-full sm:w-auto">
              <select
                @change="emit('reject', viewingRecord.id, ($event.target.value)); $event.target.value=''"
                class="w-full sm:w-auto py-2.5 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg bg-white hover:bg-slate-50 transition-colors text-center cursor-pointer"
                value=""
              >
                <option value="" disabled selected>Actions ▾</option>
                <option value="revise">Request Revision</option>
                <option value="reject">Reject</option>
              </select>
            </div>
            <button
              class="w-full sm:w-auto px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
              @click="emit('approve', viewingRecord.id)"
            >
              Approve Claim
            </button>
          </template>
        </footer>

        <!-- Footer Actions (Admin: Approved → Grant) -->
        <footer
          v-if="auth.isAdmin && viewingRecord && normalizeStatus(viewingRecord.status) === 'approved'"
          class="px-6 py-4 border-t border-slate-100 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-end"
        >
          <button
            v-if="!isOwnSubmission"
            class="w-full sm:w-auto px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
            @click="emit('grant', viewingRecord.id)"
          >
            <Wallet class="w-4 h-4" /> Grant Claim
          </button>
          <p v-else class="text-sm text-danger text-center sm:text-right">
            You cannot process your own request.
          </p>
        </footer>

        <!-- Footer Actions (Employee: Revise → Edit) -->
        <footer
          v-if="(!auth.isAdmin || isOwnSubmission) && viewingRecord && normalizeStatus(viewingRecord.status) === 'revise'"
          class="px-6 py-4 border-t border-orange-100 bg-orange-50/30 shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-orange-800 text-center sm:text-left">
            Ready to revise? Edit your submission and it will return to Pending.
          </p>
          <button
            data-testid="edit-resubmit-btn"
            class="px-5 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors shadow-sm whitespace-nowrap"
            @click="emit('edit', viewingRecord)"
          >
            Edit & Resubmit
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>
