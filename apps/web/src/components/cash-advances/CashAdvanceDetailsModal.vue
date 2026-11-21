<script setup>
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { useLiquidationStore } from "@/stores/liquidation";
import { useToast } from "@/composables/useToast";
import { useReportExport } from "@/composables/useReportExport";
import BaseModal from "@/components/base/BaseModal.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import DecisionConfirmationModal from "@/components/base/DecisionConfirmationModal.vue";
import GrantPayoutModal from "@/components/reimbursements/GrantPayoutModal.vue";
import UnifiedRoadmapStepper from "@/components/base/UnifiedRoadmapStepper.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import BaseSignaturePad from "@/components/base/BaseSignaturePad.vue";
import SbsiReportPreviewModal from "@/components/base/SbsiReportPreviewModal.vue";
import { formatPeso, formatDate } from "@/utils/formatters";
import { getFileUrl } from "@/utils/fileUtils";
import { downloadSbsiReportPdf } from "@/utils/sbsiPdfGenerator";
import {
  X,
  CheckCircle,
  Wallet,
  Download,
  ShieldCheck,
  FileText,
  Loader2,
  Eye,
} from "lucide-vue-next";

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  record: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close", "view-liquidation", "view-cash-advance"]);

const auth = useAuthStore();
const store = useCashAdvanceStore();
const liquidationStore = useLiquidationStore();
const { addToast } = useToast();
const { isExporting, exportReport } = useReportExport();

/** Unified roadmap helpers */
const linkedLiquidation = computed(() => {
  if (!props.record) return null;
  const found = liquidationStore.settlements.find(
    (s) => String(s.cash_advance_id) === String(props.record.id),
  );
  if (found) return found;
  return props.record.liquidation || props.record.settlement || null;
});

const combinedAuditTrail = computed(() => {
  const list = [...(props.record?.audit_trail || [])];
  if (linkedLiquidation.value?.audit_trail?.length) {
    for (const item of linkedLiquidation.value.audit_trail) {
      if (!list.some((existing) => existing.id === item.id)) {
        list.push(item);
      }
    }
  }
  return list;
});

const roadmapCashAdvance = computed(() => {
  if (!props.record) return null;
  const fromStore = store.items.find(
    (i) => String(i.id) === String(props.record.id),
  );
  return {
    ...(fromStore || {}),
    ...(props.record || {}),
    disbursement: props.record.disbursement || fromStore?.disbursement || null,
    approval_actions:
      props.record.approval_actions ||
      props.record.approvalActions ||
      fromStore?.approval_actions ||
      fromStore?.approvalActions ||
      [],
    approvalActions:
      props.record.approvalActions ||
      props.record.approval_actions ||
      fromStore?.approvalActions ||
      fromStore?.approval_actions ||
      [],
    status_history:
      props.record.status_history ||
      props.record.statusHistory ||
      fromStore?.status_history ||
      fromStore?.statusHistory ||
      [],
    statusHistory:
      props.record.statusHistory ||
      props.record.status_history ||
      fromStore?.statusHistory ||
      fromStore?.status_history ||
      [],
  };
});

const roadmapHistory = computed(() => {
  if (!props.record) return [];
  const fromStore = store.items.find(
    (i) => String(i.id) === String(props.record.id),
  );
  const target = props.record;

  const entries = [];
  const append = (list) => {
    if (Array.isArray(list)) {
      entries.push(...list);
    } else if (list && typeof list === "object") {
      entries.push(list);
    }
  };

  append(target.status_history);
  append(target.statusHistory);
  append(target.approval_actions);
  append(target.approvalActions);
  append(target.history);
  append(target.audit_logs);

  if (fromStore) {
    append(fromStore.status_history);
    append(fromStore.statusHistory);
    append(fromStore.approval_actions);
    append(fromStore.approvalActions);
  }

  const seen = new Set();
  const deduped = [];
  for (const h of entries) {
    if (!h) continue;
    const key = `${h.id || ""}-${h.status || h.action || h.to_status || ""}-${h.changed_at || h.actioned_at || h.created_at || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(h);
    }
  }
  return deduped;
});

const roadmapPenalties = computed(() => {
  if (!props.record) return [];
  const fromStore = store.items.find(
    (i) => String(i.id) === String(props.record.id),
  );
  const p =
    props.record.penalties ||
    props.record.penalty_logs ||
    fromStore?.penalties ||
    [];
  return Array.isArray(p) ? p : [];
});

const roadmapAging = computed(() => {
  if (!props.record) return null;
  try {
    return liquidationStore.calculateAging(props.record);
  } catch {
    return null;
  }
});

const roadmapOverpayment = computed(() => {
  const liq = linkedLiquidation.value;
  if (!liq) {
    return Number(
      props.record?.overpayment_amount ??
        props.record?.overpaymentAmount ??
        0,
    );
  }
  const total = Number(
    liq.total_expense_amount ?? liq.totalExpenseAmount ?? liq.total_amount ?? 0,
  );
  const bal = Number(props.record?.balance ?? props.record?.amount ?? 0);
  return Math.max(0, total - bal);
});

const roadmapLayout = computed(() => "horizontal");

function handleRoadmapNavigate(payload) {
  const step = payload?.step;
  if (!step) return;
  if (step.domain === "liquidation") {
    if (!linkedLiquidation.value) {
      addToast({
        message: "No liquidation submitted yet for this advance.",
        type: "info",
      });
      return;
    }
    emit("view-liquidation", {
      cashAdvanceId: props.record?.id,
      liquidation: linkedLiquidation.value,
      step,
    });
    // also close details so parent can open liquidation review
    // keep open for now — parent decides
  } else {
    emit("view-cash-advance", { step, record: props.record });
  }
}

const acknowledgementSignature = ref(auth?.user?.signature || "");
const adminReviewNotes = ref("");
const confirmationAction = ref("");
const isDisbursePayoutModalOpen = ref(false);
const isAdminDecisionSubmitting = ref(false);
const showAcknowledgeModal = ref(false);
const isAcknowledging = ref(false);
const adminPassword = ref("");

const documentData = ref(null);
const isLoadingDocument = ref(false);
const isReportPreviewOpen = ref(false);

const resolvedTemplateData = computed(
  () => props.record?.report_template_data || props.record?.reportTemplateData || null,
);

const resolvedDocUrl = computed(() => {
  const rawPath =
    documentData.value?.file_path ||
    props.record?.document?.file_path ||
    documentData.value?.file_url ||
    props.record?.documentUrl ||
    props.record?.document_url ||
    props.record?.document_path ||
    props.record?.file_path;

  return (
    getFileUrl(rawPath, "cash_advances") ||
    documentData.value?.file_url ||
    props.record?.documentUrl ||
    props.record?.document_url ||
    null
  );
});

const hasDocument = computed(() => {
  return Boolean(
    documentData.value?.file_name ||
    documentData.value?.file_path ||
    documentData.value?.file_url ||
    props.record?.documentFileName ||
    props.record?.document_file_name ||
    props.record?.document ||
    props.record?.documentUrl ||
    props.record?.document_url ||
    props.record?.document_path ||
    props.record?.file_path ||
    resolvedTemplateData.value,
  );
});

const documentDisplayName = computed(() => {
  return (
    documentData.value?.file_name ||
    documentData.value?.fileName ||
    documentData.value?.data?.file_name ||
    props.record?.documentFileName ||
    props.record?.document_file_name ||
    props.record?.document?.file_name ||
    props.record?.document?.fileName ||
    (hasDocument.value ? "Document Attached" : "")
  );
});
const isOwnSubmission = computed(() => {
  const currentUserId = auth?.user?.id;
  const ownerId =
    props.record?.userId ??
    props.record?.user_id ??
    props.record?.requester?.id ??
    props.record?.user?.id;

  return (
    currentUserId !== null &&
    currentUserId !== undefined &&
    ownerId !== null &&
    ownerId !== undefined &&
    String(currentUserId) === String(ownerId)
  );
});

const payoutMeta = computed(() => props.record?.payout || null);
const disbursementMeta = computed(() => props.record?.disbursement || null);

const resolvedPayoutMethod = computed(() => {
  const method =
    payoutMeta.value?.payout_method ||
    disbursementMeta.value?.payout_method ||
    props.record?.payoutMethod ||
    disbursementMeta.value?.channel ||
    null;
  const other =
    payoutMeta.value?.payout_method_other ||
    disbursementMeta.value?.payout_method_other ||
    null;
  if (method && String(method).toLowerCase() === "other" && other) {
    return other;
  }
  return method;
});

const resolvedGrantedBy = computed(
  () =>
    payoutMeta.value?.granted_by ||
    disbursementMeta.value?.granted_by ||
    disbursementMeta.value?.disbursed_by?.name ||
    props.record?.granted_by ||
    null,
);

const resolvedGrantedAt = computed(
  () =>
    payoutMeta.value?.granted_at ||
    disbursementMeta.value?.created_at ||
    disbursementMeta.value?.disbursement_date ||
    null,
);

const resolvedGranterSignature = computed(
  () =>
    payoutMeta.value?.granter_signature ||
    disbursementMeta.value?.granter_signature ||
    props.record?.granterSignature ||
    null,
);

const resolvedEmployeeSignature = computed(
  () =>
    payoutMeta.value?.employee_signature ||
    props.record?.signatureImage ||
    props.record?.signature ||
    null,
);

const resolvedAcknowledgedAt = computed(
  () =>
    payoutMeta.value?.acknowledged_at ||
    props.record?.acknowledgedAt ||
    props.record?.acknowledged_at ||
    null,
);

const hasPayoutMetadata = computed(() =>
  Boolean(
    resolvedPayoutMethod.value ||
    resolvedGrantedBy.value ||
    resolvedGranterSignature.value,
  ),
);

const showSignatureSection = computed(
  () =>
    Boolean(
      resolvedEmployeeSignature.value ||
      resolvedAcknowledgedAt.value ||
      hasPayoutMetadata.value ||
      props.record?.status === "disbursed" ||
      props.record?.status === "signed",
    ) && (isOwnSubmission.value || auth?.isAdmin),
);

const canAcknowledgeFromCurrentView = computed(
  () =>
    isOwnSubmission.value &&
    props.record?.status === "disbursed" &&
    !resolvedAcknowledgedAt.value &&
    !resolvedEmployeeSignature.value,
);

watch(
  () => props.isOpen,
  async (newVal) => {
    if (newVal) {
      adminReviewNotes.value = "";
      confirmationAction.value = "";
      isDisbursePayoutModalOpen.value = false;
      showAcknowledgeModal.value = false;
      documentData.value = props.record?.document || null;
      adminPassword.value = "";
      acknowledgementSignature.value = auth?.user?.signature || "";
      if (liquidationStore.settlements.length === 0) {
        try {
          await liquidationStore.fetchSettlements();
        } catch {}
      }
    }
  },
);

watch(
  () => props.record,
  (newRec) => {
    documentData.value = newRec?.document || null;
    acknowledgementSignature.value = auth?.user?.signature || "";
  },
);

function closeDetails() {
  isDisbursePayoutModalOpen.value = false;
  confirmationAction.value = "";
  emit("close");
}

function outstandingBalance(record) {
  if (!record) return 0;
  return Number(record.balance ?? record.amount ?? 0);
}

function formatDateOnly(value) {
  if (!value) return "--";
  const formatted = formatDate(value);
  return formatted === "—" ? "--" : formatted;
}

function normalizeStatus(status) {
  const normalized = String(status || "").toLowerCase();
  const statusMap = {
    pending: "pending",
    revise: "revise",
    approved: "approved",
    disbursed: "disbursed",
    signed: "disbursed",
    liquidated: "liquidated",
    rejected: "rejected",
  };
  return statusMap[normalized] || normalized;
}

async function downloadDocument() {
  if (!props.record) return;
  if (!documentData.value && props.record.id) {
    isLoadingDocument.value = true;
    try {
      const fetched = await store.fetchDocument(props.record.id);
      if (fetched) {
        documentData.value = fetched;
      }
    } catch (error) {
      console.error("Failed to load document", error);
    } finally {
      isLoadingDocument.value = false;
    }
  }

  const fileName = documentDisplayName.value || "document.pdf";
  const rawPath =
    documentData.value?.file_path ||
    props.record?.document?.file_path ||
    documentData.value?.file_url ||
    props.record?.documentUrl ||
    props.record?.document_path ||
    props.record?.file_path;

  const resolvedUrl =
    getFileUrl(rawPath, "cash_advances") ||
    documentData.value?.file_url ||
    props.record?.documentUrl;

  if (!resolvedUrl && resolvedTemplateData.value) {
    try {
      downloadSbsiReportPdf(
        resolvedTemplateData.value,
        props.record?.id ? `SBSI-cash-advance-${props.record.id}.pdf` : null,
      );
      return;
    } catch (error) {
      console.error("PDF generation failed", error);
      addToast({
        message: "Failed to download document.",
        type: "error",
      });
      return;
    }
  }

  const fileUrl = resolvedUrl || "/mock_receipt.png";

  try {
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = fileName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    console.error("Download failed", error);
    addToast({
      message: "Failed to download document.",
      type: "error",
    });
  }
}

function requestConfirmation(action) {
  if (
    isOwnSubmission.value &&
    ["approve", "revise", "reject", "disburse"].includes(action)
  ) {
    addToast({
      message: "You cannot process your own request.",
      type: "error",
    });
    return;
  }

  if (action === "disburse") {
    isDisbursePayoutModalOpen.value = true;
    return;
  }

  confirmationAction.value = action;
}

function cancelConfirmation() {
  confirmationAction.value = "";
}

function cancelDisbursePayout() {
  isDisbursePayoutModalOpen.value = false;
}

async function handleConfirmDisbursePayout(payoutPayload) {
  if (!props.record || isAdminDecisionSubmitting.value) return;

  try {
    isAdminDecisionSubmitting.value = true;
    await store.disburseRequest(props.record.id, payoutPayload);
    addToast({
      message: "Request successfully disbursed",
      type: "success",
    });
    isDisbursePayoutModalOpen.value = false;
    closeDetails();
  } catch (error) {
    // Keep modal open so user can correct password or payout details.
    addToast({ message: error.message || "Action failed", type: "error" });
  } finally {
    isAdminDecisionSubmitting.value = false;
  }
}

async function confirmAdminDecision() {
  if (!props.record) return;

  const id = props.record.id;

  if (!adminPassword.value?.trim()) {
    addToast({ message: "Password is required to confirm this action.", type: "error" });
    return;
  }

  try {
    isAdminDecisionSubmitting.value = true;
    if (confirmationAction.value === "approve") {
      await store.approveRequest(id, adminReviewNotes.value, adminPassword.value);
    } else if (confirmationAction.value === "revise" || confirmationAction.value === "reject") {
      const reason = adminReviewNotes.value || (confirmationAction.value === "revise" ? "Revision requested by admin" : "Rejected by admin");
      await store.rejectRequest(id, reason, confirmationAction.value, adminPassword.value);
    }

    addToast({
      message: `Request successfully ${confirmationAction.value}d`,
      type: "success",
    });
    adminPassword.value = "";
    confirmationAction.value = "";
    closeDetails();
  } catch (error) {
    // Keep modal open so user can correct password; surface 422 password error via toast.
    // Store already extracts errorData.errors?.password[0] into error.message.
    addToast({ message: error.message || "Action failed", type: "error" });
  } finally {
    isAdminDecisionSubmitting.value = false;
  }
}

async function confirmAcknowledge() {
  if (!props.record || isAcknowledging.value) return;
  const signatureData = acknowledgementSignature.value;
  if (!signatureData) return;

  try {
    isAcknowledging.value = true;
    await store.acknowledgeRequest(props.record.id, signatureData);
    addToast({
      message: "Cash advance acknowledged successfully.",
      type: "success",
    });
    showAcknowledgeModal.value = false;
    closeDetails();
  } catch (error) {
    addToast({ message: error.message || "Action failed", type: "error" });
  } finally {
    isAcknowledging.value = false;
  }
}
</script>

<template>
  <div v-if="isOpen && record">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <!-- ═══════════════ ADMIN VIEW ═══════════════ -->
      <div
        v-if="auth.isAdmin"
        class="relative bg-white w-full max-w-[960px] rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden max-h-[96vh]"
        @click.stop
      >
        <!-- Close Button -->
        <button
          @click="closeDetails"
          class="absolute top-2 right-2 text-slate-400 hover:bg-slate-100 transition-colors p-1.5 rounded-full flex items-center justify-center z-10"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- Header -->
        <div class="px-6 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">
                Cash Advance Ref #{{ record.id }}
              </p>
              <h2 class="text-2xl font-bold text-slate-800">
                {{ formatPeso(record.amount) }}
              </h2>
            </div>
            <StatusBadge :status="record.status" />
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div v-if="normalizeStatus(record.status) === 'revise'" class="p-3 rounded-lg border border-orange-200 bg-orange-50">
            <p class="text-[11px] text-orange-600 uppercase tracking-wide font-bold">Needs Revision — Attempt {{ record.revision_count || 1 }}/3</p>
            <p class="text-sm text-orange-800 mt-1">{{ record.adminNotes || 'Awaiting employee revision.' }}</p>
          </div>
          <div v-else-if="normalizeStatus(record.status) === 'rejected'" class="p-3 rounded-lg border border-red-100 bg-red-50">
            <p class="text-[11px] text-red-600 uppercase tracking-wide font-bold">Rejected — Revision limit exceeded ({{ record.revision_count || 4 }}/3)</p>
            <p class="text-sm text-red-700 mt-1">{{ record.adminNotes || 'Terminal rejection.' }}</p>
          </div>
          <!-- UNIFIED 8-step Roadmap -->
          <UnifiedRoadmapStepper
            :cash-advance="roadmapCashAdvance"
            :liquidation="linkedLiquidation"
            :status-history="roadmapHistory"
            :penalties="roadmapPenalties"
            :overpayment-amount="roadmapOverpayment"
            :aging="roadmapAging"
            :layout="roadmapLayout"
            @navigate="handleRoadmapNavigate"
          />

          <!-- Details Grid -->
          <section class="grid grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-slate-100">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Requestor</p>
              <p class="text-sm text-slate-700">{{ record.requestedBy || "--" }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Date Requested</p>
              <p class="text-sm text-slate-700">{{ formatDateOnly(record.date) }}</p>
            </div>
            <div class="col-span-2">
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Purpose</p>
              <p class="text-sm text-slate-700">{{ record.purpose }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Due Date</p>
              <p class="text-sm text-slate-700">{{ formatDateOnly(record.dueDate) }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Outstanding Balance</p>
              <p class="text-sm font-semibold text-primary">{{ formatPeso(outstandingBalance(record)) }}</p>
            </div>
          </section>

          <!-- Document Attachment -->
          <section v-if="hasDocument" class="pt-2 border-t border-slate-100">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Document</p>
            <div class="flex flex-wrap items-center gap-3">
              <BaseButton
                data-testid="preview-cash-advance-report-btn"
                variant="outline"
                size="sm"
                type="button"
                @click="isReportPreviewOpen = true"
              >
                <Eye class="w-3.5 h-3.5" />
                <span>Preview Report</span>
              </BaseButton>
              <a
                role="button"
                tabindex="0"
                data-testid="download-cash-advance-report-btn"
                class="inline-flex max-w-full items-center gap-2 text-sm text-primary hover:underline cursor-pointer group"
                :class="{ 'opacity-70 pointer-events-none': isLoadingDocument }"
                :title="documentDisplayName"
                @click.stop.prevent="downloadDocument"
                @keydown.enter.stop.prevent="downloadDocument"
                @keydown.space.stop.prevent="downloadDocument"
              >
                <FileText class="w-3.5 h-3.5 shrink-0" />
                <span class="truncate max-w-[260px] sm:max-w-[420px]">{{ documentDisplayName || "Download PDF" }}</span>
                <Loader2 v-if="isLoadingDocument" class="w-3 h-3 shrink-0 animate-spin" />
                <Download v-else class="w-3 h-3 shrink-0" />
              </a>
            </div>
          </section>

          <!-- Loading Document Skeleton -->
          <section v-else-if="isLoadingDocument" class="pt-2 border-t border-slate-100">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Document</p>
            <div class="h-4 w-40 animate-pulse rounded bg-slate-200"></div>
          </section>

          <!-- Signature & Payout Section -->
          <section v-if="showSignatureSection" class="space-y-3 pt-3 border-t border-slate-100">
            <div
              v-if="hasPayoutMetadata"
              class="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3"
            >
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div v-if="resolvedPayoutMethod">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payout Method</p>
                  <p class="text-xs font-semibold text-slate-700 mt-0.5">{{ resolvedPayoutMethod }}</p>
                </div>
                <div v-if="resolvedGrantedBy">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Granted By</p>
                  <p class="text-xs font-semibold text-slate-700 mt-0.5">{{ resolvedGrantedBy }}</p>
                </div>
                <div v-if="resolvedGrantedAt">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Granted Date</p>
                  <p class="text-xs font-semibold text-slate-700 mt-0.5">{{ formatDate(resolvedGrantedAt) }}</p>
                </div>
              </div>
              <div v-if="resolvedGranterSignature" class="pt-2 border-t border-slate-200/60">
                <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Granter's Signature</p>
                <div class="flex h-24 w-full max-w-sm items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <img
                    :src="resolvedGranterSignature"
                    class="max-h-full max-w-full object-contain"
                    alt="Granter Signature"
                  />
                </div>
              </div>
            </div>

            <div v-if="record.status === 'disbursed' && !resolvedAcknowledgedAt && !resolvedEmployeeSignature">
              <p class="text-sm text-slate-600 mb-3">
                Employee certifies receipt of
                <span class="font-semibold text-primary">{{ formatPeso(record.amount) }}</span>.
              </p>
            </div>
            <div v-else-if="resolvedAcknowledgedAt || resolvedEmployeeSignature">
              <p class="text-sm text-slate-600 mb-3">
                Employee certified receipt of
                <span class="font-semibold text-primary">{{ formatPeso(record.amount) }}</span>
                <span v-if="resolvedAcknowledgedAt" class="text-slate-400 text-xs">
                  on {{ formatDate(resolvedAcknowledgedAt) }}
                </span>.
              </p>
            </div>

            <div v-if="resolvedAcknowledgedAt || resolvedEmployeeSignature || canAcknowledgeFromCurrentView">
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Signature</p>
              <div
                v-if="resolvedAcknowledgedAt || resolvedEmployeeSignature"
                class="relative flex h-32 w-full max-w-lg mx-auto items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <img
                  v-if="resolvedEmployeeSignature"
                  :src="resolvedEmployeeSignature"
                  class="max-h-full max-w-full object-contain"
                  alt="Signature"
                />
                <span class="absolute bottom-2 right-3 text-[10px] font-medium text-emerald-600">
                  Verified
                </span>
              </div>
              <div
                v-else-if="canAcknowledgeFromCurrentView"
                class="space-y-2 flex flex-col items-center"
              >
                <BaseSignaturePad
                  v-model="acknowledgementSignature"
                  label=""
                  placeholder="Draw your signature here to acknowledge receipt"
                />

                <div class="mt-2 flex w-full max-w-lg justify-end gap-2">
                  <button
                    class="px-4 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    type="button"
                    :disabled="!acknowledgementSignature"
                    @click="showAcknowledgeModal = true"
                  >
                    I acknowledge
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Audit Trail Section -->
          <BaseAuditTrail
            :trail="combinedAuditTrail"
            :entity-title="`Cash-Advance-#${record.id}`"
            class="mt-4"
          />
        </div>

        <!-- Footer (Admin) -->
        <footer
          class="px-6 py-4 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0"
        >
          <BaseButton
            data-testid="export-cash-advance-report-btn"
            variant="secondary"
            type="button"
            class="sm:w-auto"
            :loading="isExporting"
            :disabled="isExporting"
            @click="exportReport('cash-advance', record.id)"
          >
            <Download class="w-4 h-4" />
            <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
          </BaseButton>

          <template v-if="['pending', 'revise', 'approved'].includes(record.status)">
            <p
              v-if="isOwnSubmission"
              class="text-sm text-danger text-center sm:text-right"
            >
              You cannot process your own request.
            </p>
            <div v-else class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <template v-if="['pending','revise'].includes(record.status)">
                <div class="w-full sm:w-auto">
                  <select
                    @change="requestConfirmation($event.target.value); $event.target.value=''"
                    class="w-full sm:w-auto py-2.5 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg bg-white hover:bg-slate-50 transition-colors text-center cursor-pointer"
                    value=""
                  >
                    <option value="" disabled selected>Actions ▾</option>
                    <option value="revise">Request Revision</option>
                    <option value="reject">Reject</option>
                  </select>
                </div>
                <button
                  class="w-full sm:w-auto py-2.5 px-5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                  type="button"
                  @click="requestConfirmation('approve')"
                >
                  <CheckCircle class="w-4 h-4" />
                  Approve
                </button>
              </template>
              <template v-if="record.status === 'approved'">
                <button
                  class="w-full sm:w-auto py-2.5 px-5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                  type="button"
                  @click="requestConfirmation('disburse')"
                >
                  <Wallet class="w-4 h-4" />
                  Disburse
                </button>
              </template>
            </div>
          </template>
        </footer>
      </div>

      <!-- ═══════════════ EMPLOYEE VIEW ═══════════════ -->
      <div
        v-else
        class="relative bg-white w-full max-w-[960px] rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden max-h-[96vh]"
        @click.stop
      >
        <!-- Close Button -->
        <button
          @click="closeDetails"
          class="absolute top-2 right-2 text-slate-400 hover:bg-slate-100 transition-colors p-1.5 rounded-full flex items-center justify-center z-10"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- Header -->
        <div class="px-6 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">
                Cash Advance Ref #{{ record.id }}
              </p>
              <h2 class="text-2xl font-bold text-slate-800">
                {{ formatPeso(record.amount) }}
              </h2>
            </div>
            <StatusBadge :status="record.status" />
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <!-- Needs Revision Banner (employee + admin) -->
          <div v-if="normalizeStatus(record.status) === 'revise'" class="p-3 rounded-lg border border-orange-200 bg-orange-50">
            <p class="text-[11px] text-orange-600 uppercase tracking-wide font-bold">Needs Revision — Attempt {{ record.revision_count || 1 }}/3</p>
            <p class="text-sm text-orange-800 mt-1">{{ record.adminNotes || 'Please revise per admin feedback and resubmit.' }}</p>
            <p v-if="!auth.isAdmin" class="text-[11px] text-orange-700/70 mt-1">Edit your request via the pencil icon — it will return to Pending.</p>
          </div>
          <div v-else-if="normalizeStatus(record.status) === 'rejected'" class="p-3 rounded-lg border border-red-100 bg-red-50">
            <p class="text-[11px] text-red-600 uppercase tracking-wide font-bold">Rejected — Revision limit exceeded ({{ record.revision_count || 4 }}/3)</p>
            <p class="text-sm text-red-700 mt-1">{{ record.adminNotes || 'This request can no longer be edited.' }}</p>
          </div>
          <!-- UNIFIED 8-step Roadmap -->
          <UnifiedRoadmapStepper
            :cash-advance="roadmapCashAdvance"
            :liquidation="linkedLiquidation"
            :status-history="roadmapHistory"
            :penalties="roadmapPenalties"
            :overpayment-amount="roadmapOverpayment"
            :aging="roadmapAging"
            :layout="roadmapLayout"
            @navigate="handleRoadmapNavigate"
          />

          <!-- Details Grid -->
          <section class="grid grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-slate-100">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Request ID</p>
              <p class="text-sm font-semibold text-primary">{{ record.id }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Date Requested</p>
              <p class="text-sm text-slate-700">{{ formatDateOnly(record.date) }}</p>
            </div>
            <div class="col-span-2">
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Purpose</p>
              <p class="text-sm text-slate-700">{{ record.purpose }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Outstanding Balance</p>
              <p class="text-sm font-semibold text-primary">{{ formatPeso(outstandingBalance(record)) }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Settlement Due Date</p>
              <p class="text-sm text-slate-700">{{ formatDateOnly(record.dueDate) }}</p>
            </div>
          </section>

          <!-- Document -->
          <section v-if="hasDocument" class="pt-2 border-t border-slate-100">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Document</p>
            <div class="flex flex-wrap items-center gap-3">
              <BaseButton
                data-testid="preview-cash-advance-report-btn"
                variant="outline"
                size="sm"
                type="button"
                @click="isReportPreviewOpen = true"
              >
                <Eye class="w-3.5 h-3.5" />
                <span>Preview Report</span>
              </BaseButton>
              <a
                role="button"
                tabindex="0"
                data-testid="download-cash-advance-report-btn"
                class="inline-flex max-w-full items-center gap-2 text-sm text-primary hover:underline cursor-pointer group"
                :class="{ 'opacity-70 pointer-events-none': isLoadingDocument }"
                :title="documentDisplayName"
                @click.stop.prevent="downloadDocument"
                @keydown.enter.stop.prevent="downloadDocument"
                @keydown.space.stop.prevent="downloadDocument"
              >
                <FileText class="w-3.5 h-3.5 shrink-0" />
                <span class="truncate max-w-[260px] sm:max-w-[420px]">{{ documentDisplayName || "Download PDF" }}</span>
                <Loader2 v-if="isLoadingDocument" class="w-3 h-3 shrink-0 animate-spin" />
                <Download v-else class="w-3 h-3 shrink-0" />
              </a>
            </div>
          </section>

          <!-- Loading Document Skeleton -->
          <section v-else-if="isLoadingDocument" class="pt-2 border-t border-slate-100">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Document</p>
            <div class="h-4 w-40 animate-pulse rounded bg-slate-200"></div>
          </section>

          <!-- Admin Notes / Rejection -->
          <div
            v-if="record.adminNotes"
            class="pt-2 border-t border-slate-100"
          >
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">
              {{ normalizeStatus(record.status) === 'rejected' ? 'Rejection Reason' : 'Admin Notes' }}
            </p>
            <p class="text-sm text-slate-700">{{ record.adminNotes }}</p>
          </div>

          <!-- Signature & Payout Section -->
          <section
            v-if="record.status === 'disbursed' || record.status === 'signed' || resolvedAcknowledgedAt || resolvedEmployeeSignature || hasPayoutMetadata"
            class="space-y-3 pt-3 border-t border-slate-100"
          >
            <div
              v-if="hasPayoutMetadata"
              class="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3"
            >
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div v-if="resolvedPayoutMethod">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payout Method</p>
                  <p class="text-xs font-semibold text-slate-700 mt-0.5">{{ resolvedPayoutMethod }}</p>
                </div>
                <div v-if="resolvedGrantedBy">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Granted By</p>
                  <p class="text-xs font-semibold text-slate-700 mt-0.5">{{ resolvedGrantedBy }}</p>
                </div>
                <div v-if="resolvedGrantedAt">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Granted Date</p>
                  <p class="text-xs font-semibold text-slate-700 mt-0.5">{{ formatDate(resolvedGrantedAt) }}</p>
                </div>
              </div>
              <div v-if="resolvedGranterSignature" class="pt-2 border-t border-slate-200/60">
                <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Granter's Signature</p>
                <div class="flex h-24 w-full max-w-sm items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <img
                    :src="resolvedGranterSignature"
                    class="max-h-full max-w-full object-contain"
                    alt="Granter Signature"
                  />
                </div>
              </div>
            </div>

            <p v-if="record.status === 'disbursed' && !resolvedAcknowledgedAt && !resolvedEmployeeSignature" class="text-sm text-slate-600">
              I certify that I received the cash advance of
              <span class="font-semibold text-primary">{{ formatPeso(record.amount) }}</span>.
            </p>
            <p v-else-if="resolvedAcknowledgedAt || resolvedEmployeeSignature" class="text-sm text-slate-600">
              Acknowledged and certified receipt of
              <span class="font-semibold text-primary">{{ formatPeso(record.amount) }}</span>
              <span v-if="resolvedAcknowledgedAt" class="text-slate-400 text-xs">
                on {{ formatDate(resolvedAcknowledgedAt) }}
              </span>.
            </p>

            <div v-if="resolvedAcknowledgedAt || resolvedEmployeeSignature || record.status === 'disbursed'">
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Signature</p>
              <div
                v-if="resolvedAcknowledgedAt || resolvedEmployeeSignature"
                class="relative flex h-32 w-full max-w-lg mx-auto items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <img
                  v-if="resolvedEmployeeSignature"
                  :src="resolvedEmployeeSignature"
                  class="max-h-full max-w-full object-contain"
                  alt="Signature"
                />
                <span class="absolute bottom-2 right-3 text-[10px] font-medium text-emerald-600">
                  Verified
                </span>
              </div>
              <div
                v-else-if="record.status === 'disbursed'"
                class="space-y-2 flex flex-col items-center"
              >
                <BaseSignaturePad
                  v-model="acknowledgementSignature"
                  label=""
                  placeholder="Draw your signature here to acknowledge receipt"
                />
                <div v-if="!resolvedAcknowledgedAt" class="mt-2 flex w-full max-w-lg justify-end gap-2">
                  <button
                    class="px-4 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    type="button"
                    :disabled="!acknowledgementSignature"
                    @click="showAcknowledgeModal = true"
                  >
                    I acknowledge
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Audit Trail Section -->
          <BaseAuditTrail
            :trail="combinedAuditTrail"
            :entity-title="`Cash-Advance-#${record.id}`"
            class="mt-4"
          />
        </div>

        <!-- Footer (Employee) -->
        <footer class="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 shrink-0">
          <div class="flex items-center gap-4">
            <p>
              <span class="font-bold uppercase tracking-widest">Requested</span>
              <span class="ml-2 font-semibold text-slate-800">{{ formatDateOnly(record.date) }}</span>
            </p>
            <p>
              <span class="font-bold uppercase tracking-widest">Updated</span>
              <span class="ml-2 font-semibold text-slate-800">{{ formatDateOnly(record.updatedAt) }}</span>
            </p>
          </div>
          <BaseButton
            data-testid="export-cash-advance-report-btn"
            variant="secondary"
            size="sm"
            type="button"
            :loading="isExporting"
            :disabled="isExporting"
            @click="exportReport('cash-advance', record.id)"
          >
            <Download class="w-3.5 h-3.5" />
            <span>{{ isExporting ? "Exporting..." : "Export Report" }}</span>
          </BaseButton>
        </footer>
      </div>
    </div>

    <!-- Acknowledge Modal -->
    <BaseModal
      :isOpen="showAcknowledgeModal"
      @close="showAcknowledgeModal = false"
      zIndexClass="z-[60]"
      contentClass="p-8 text-center"
    >
      <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck class="h-10 w-10" />
      </div>

      <h3 class="mt-6 font-heading text-xl font-bold text-slate-900">
        Acknowledge Cash Advance
      </h3>
      <p class="mt-2 text-sm leading-relaxed text-slate-500">
        Are you sure you want to acknowledge the receipt of this cash advance?
        This action will finalize your receipt of the funds.
      </p>

      <div class="mt-6 flex items-center justify-end gap-3">
        <BaseButton
          variant="secondary"
          class="px-5 min-h-10"
          type="button"
          @click="showAcknowledgeModal = false"
        >
          Cancel
        </BaseButton>
        <BaseButton
          variant="primary"
          class="px-5 min-h-10"
          type="button"
          :loading="isAcknowledging"
          :disabled="isAcknowledging"
          @click="confirmAcknowledge"
        >
          Yes, I Acknowledge
        </BaseButton>
      </div>
    </BaseModal>

    <!-- Admin Decision Confirmation -->
    <DecisionConfirmationModal
      :is-open="!!confirmationAction"
      :mode="confirmationAction || 'approve'"
      :is-submitting="isAdminDecisionSubmitting"
      v-model:password="adminPassword"
      v-model:comment="adminReviewNotes"
      @close="cancelConfirmation"
      @confirm="confirmAdminDecision"
    />

    <!-- Cash Advance Disbursement Payout Modal -->
    <GrantPayoutModal
      :is-open="isDisbursePayoutModalOpen"
      :record="record"
      :default-granted-by="auth?.user?.name || ''"
      :is-submitting="isAdminDecisionSubmitting"
      title="Disburse Cash Advance"
      confirm-title="Confirm Cash Advance Handover"
      submit-label="Submit Disbursement"
      confirm-label="Confirm & Disburse"
      @close="cancelDisbursePayout"
      @confirm="handleConfirmDisbursePayout"
    />

    <!-- SBSI Report Preview Modal -->
    <SbsiReportPreviewModal
      :is-open="isReportPreviewOpen"
      :template-data="resolvedTemplateData"
      fallback-type="cash-advance"
      :record="record"
      :file-url="resolvedDocUrl"
      @close="isReportPreviewOpen = false"
    />
  </div>
</template>
