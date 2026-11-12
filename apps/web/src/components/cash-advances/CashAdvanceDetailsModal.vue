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
import UnifiedRoadmapStepper from "@/components/base/UnifiedRoadmapStepper.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import { formatPeso, formatDate } from "@/utils/formatters";
import {
  X,
  CheckCircle,
  Wallet,
  FileDown,
  Download,
  ShieldCheck,
  RotateCcw,
  FileText,
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

const roadmapLayout = computed(() => {
  if (roadmapOverpayment.value > 0) return "serpentine";
  return "horizontal";
});

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

const signatureCanvas = ref(null);
const isSigning = ref(false);
const signatureStarted = ref(false);
const adminReviewNotes = ref("");
const confirmationAction = ref("");
const isAdminDecisionSubmitting = ref(false);
const showAcknowledgeModal = ref(false);
const isAcknowledging = ref(false);
const adminPassword = ref("");

const documentData = ref(null);
const isLoadingDocument = ref(false);
const isOwnSubmission = computed(() => {
  const currentUserId = auth.user?.id;
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

const showSignatureSection = computed(
  () => Boolean(props.record?.signatureImage) || isOwnSubmission.value,
);

const canAcknowledgeFromCurrentView = computed(
  () =>
    isOwnSubmission.value &&
    props.record?.status === "disbursed" &&
    !props.record?.acknowledgedAt,
);

watch(
  () => props.isOpen,
  async (newVal) => {
    if (newVal) {
      adminReviewNotes.value = "";
      confirmationAction.value = "";
      showAcknowledgeModal.value = false;
      documentData.value = props.record?.document || null;
      adminPassword.value = "";
      clearSignature();
      if (liquidationStore.settlements.length === 0) {
        try {
          await liquidationStore.fetchSettlements();
        } catch {}
      }
    }
  },
);

function closeDetails() {
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

function isTimelineStepCompleted(stepIndex) {
  const status = normalizeStatus(props.record?.status);
  const order = ["pending", "approved", "disbursed", "liquidated"];
  const currentIndex = order.indexOf(status);
  if (status === "rejected") {
    // If rejected, steps up to 1 (approved) are complete but with rejection at decision
    return stepIndex <= 0;
  }
  return stepIndex < currentIndex;
}

function isTimelineStepCurrent(stepIndex) {
  const status = normalizeStatus(props.record?.status);
  const order = ["pending", "approved", "disbursed", "liquidated"];
  const currentIndex = order.indexOf(status);
  if (status === "rejected") return stepIndex === 1;
  return stepIndex === currentIndex;
}

async function downloadDocument() {
  if (!props.record) return;
  if (!documentData.value && props.record.id) {
    isLoadingDocument.value = true;
    try {
      documentData.value = await store.fetchDocument(props.record.id);
    } catch (error) {
      console.error("Failed to load document", error);
    } finally {
      isLoadingDocument.value = false;
    }
  }

  const fileName =
    documentData.value?.file_name ||
    props.record.documentFileName ||
    "document.pdf";
  const fileUrl =
    documentData.value?.file_url ||
    props.record.documentUrl ||
    "/mock_receipt.png";

  const a = document.createElement("a");
  a.href = fileUrl;
  a.download = fileName;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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

  confirmationAction.value = action;
}

function cancelConfirmation() {
  confirmationAction.value = "";
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
    } else if (confirmationAction.value === "disburse") {
      await store.disburseRequest(
        id,
        {
          channel: "System Disbursement",
          reference: `REF-${id}-${Date.now()}`,
        },
        adminPassword.value,
      );
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

function prepareSignatureCanvas() {
  const canvas = signatureCanvas.value;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;

  if (
    canvas.width !== Math.floor(rect.width * scale) ||
    canvas.height !== Math.floor(rect.height * scale)
  ) {
    canvas.width = Math.floor(rect.width * scale);
    canvas.height = Math.floor(rect.height * scale);
    const resizedContext = canvas.getContext("2d");
    resizedContext.scale(scale, scale);
    resizedContext.lineWidth = 2;
    resizedContext.lineCap = "round";
    resizedContext.lineJoin = "round";
    resizedContext.strokeStyle = "#14532D";
  }

  return canvas.getContext("2d");
}

function signaturePoint(event) {
  const rect = signatureCanvas.value.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function startSignature(event) {
  const context = prepareSignatureCanvas();
  if (!context) return;

  isSigning.value = true;
  signatureStarted.value = true;
  signatureCanvas.value.setPointerCapture?.(event.pointerId);

  const point = signaturePoint(event);
  context.beginPath();
  context.moveTo(point.x, point.y);
}

function drawSignature(event) {
  if (!isSigning.value) return;
  const context = prepareSignatureCanvas();
  if (!context) return;

  const point = signaturePoint(event);
  context.lineTo(point.x, point.y);
  context.stroke();
}

function stopSignature() {
  isSigning.value = false;
}

function clearSignature() {
  const canvas = signatureCanvas.value;
  if (!canvas) {
    signatureStarted.value = false;
    return;
  }

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  signatureStarted.value = false;
}

async function confirmAcknowledge() {
  if (!props.record || isAcknowledging.value) return;
  const canvas = signatureCanvas.value;
  if (!canvas) return;
  const signatureData = canvas.toDataURL("image/png");

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
          <section v-if="documentData || record.documentFileName" class="pt-2 border-t border-slate-100">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Document</p>
            <a
              class="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer"
              @click="downloadDocument"
            >
              <FileText class="w-3.5 h-3.5" />
              <span>{{ documentData ? documentData.file_name : record.documentFileName }}</span>
              <Download class="w-3 h-3" />
            </a>
          </section>

          <!-- Loading Document Skeleton -->
          <section v-else-if="isLoadingDocument" class="pt-2 border-t border-slate-100">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Document</p>
            <div class="h-4 w-40 animate-pulse rounded bg-slate-200"></div>
          </section>

          <!-- Signature Section -->
          <section v-if="showSignatureSection" class="space-y-3 pt-3 border-t border-slate-100">
            <div v-if="record.status === 'disbursed'">
              <p class="text-sm text-slate-600 mb-3">
                Employee certifies receipt of
                <span class="font-semibold text-primary">{{ formatPeso(record.amount) }}</span>.
              </p>
            </div>

            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Signature</p>
              <div
                v-if="record.acknowledgedAt || record.signatureImage"
                class="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <img
                  :src="record.signatureImage"
                  class="max-h-full max-w-full"
                  alt="Signature"
                />
                <span class="absolute bottom-2 right-3 text-[10px] font-medium text-emerald-600">
                  Verified
                </span>
              </div>
              <div
                v-else-if="canAcknowledgeFromCurrentView"
                class="relative h-32 overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <canvas
                  ref="signatureCanvas"
                  class="h-full w-full touch-none"
                  @pointerdown="startSignature"
                  @pointermove="drawSignature"
                  @pointerup="stopSignature"
                  @pointerleave="stopSignature"
                  @pointercancel="stopSignature"
                />
                <span
                  v-if="!signatureStarted"
                  class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400"
                >
                  Draw your signature here
                </span>
              </div>

              <div v-if="canAcknowledgeFromCurrentView" class="mt-2 flex justify-end gap-2">
                <button
                  class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  type="button"
                  @click="clearSignature"
                >
                  Clear
                </button>
                <button
                  class="px-4 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  type="button"
                  :disabled="!signatureStarted"
                  @click="showAcknowledgeModal = true"
                >
                  I acknowledge
                </button>
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
          <section v-if="documentData || record.documentFileName" class="pt-2 border-t border-slate-100">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Document</p>
            <a
              class="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer"
              @click="downloadDocument"
            >
              <FileText class="w-3.5 h-3.5" />
              <span>{{ documentData ? documentData.file_name : record.documentFileName }}</span>
              <Download class="w-3 h-3" />
            </a>
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

          <!-- Signature Section (Employee Acknowledgment for Disbursed) -->
          <section v-if="record.status === 'disbursed'" class="space-y-3 pt-3 border-t border-slate-100">
            <p class="text-sm text-slate-600">
              I certify that I received the cash advance of
              <span class="font-semibold text-primary">{{ formatPeso(record.amount) }}</span>.
            </p>

            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Signature</p>
              <div
                v-if="record.acknowledgedAt"
                class="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <img
                  :src="record.signatureImage"
                  class="max-h-full max-w-full"
                  alt="Signature"
                />
                <span class="absolute bottom-2 right-3 text-[10px] font-medium text-emerald-600">
                  Verified
                </span>
              </div>
              <div
                v-else
                class="relative h-32 overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <canvas
                  ref="signatureCanvas"
                  class="h-full w-full touch-none"
                  @pointerdown="startSignature"
                  @pointermove="drawSignature"
                  @pointerup="stopSignature"
                  @pointerleave="stopSignature"
                  @pointercancel="stopSignature"
                />
                <span
                  v-if="!signatureStarted"
                  class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400"
                >
                  Draw your signature here
                </span>
              </div>
              <div v-if="!record.acknowledgedAt" class="mt-2 flex justify-end gap-2">
                <button
                  class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  type="button"
                  @click="clearSignature"
                >
                  Clear
                </button>
                <button
                  class="px-4 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  type="button"
                  :disabled="!signatureStarted"
                  @click="showAcknowledgeModal = true"
                >
                  I acknowledge
                </button>
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
  </div>
</template>
