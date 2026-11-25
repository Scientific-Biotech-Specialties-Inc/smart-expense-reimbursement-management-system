<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import { usePenaltyStore } from "@/stores/penalty";
import { useToast } from "@/composables/useToast";
import BaseKpiGrid from "@/components/base/BaseKpiGrid.vue";
import BaseFilterTabs from "@/components/base/BaseFilterTabs.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseModal from "@/components/base/BaseModal.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import SkeletonLoader from "@/components/base/SkeletonLoader.vue";
import {
  formatPhpAmount,
  formatMediumDate,
  formatSourceModule,
  formatTriggerType,
} from "@/utils/penaltyFormatters";
import {
  Plus,
  Search,
  Eye,
  ShieldOff,
  RotateCcw,
  ExternalLink,
  AlertCircle,
  X,
} from "lucide-vue-next";

const auth = useAuthStore();
const penaltyStore = usePenaltyStore();
const { addToast } = useToast();

const TABS = ["Pending Appeals", "Employee Standings", "Strike History"];
const activeTab = ref("Pending Appeals");

const overviewSearch = ref("");
const standingFilter = ref("all");

const strikeStatusFilter = ref("all");
const strikeModuleFilter = ref("all");
const strikeSearch = ref("");

// Review Appeal Modal
const reviewModalOpen = ref(false);
const selectedAppeal = ref(null);
const reviewComment = ref("");
const reviewCommentError = ref("");

// Manual Strike Modal
const manualModalOpen = ref(false);
const manualForm = ref({
  user_id: "",
  source_module: "cash_advance",
  source_id: "",
  reason: "",
});
const manualErrors = ref({
  user_id: "",
  source_id: "",
  reason: "",
});
const userRecords = ref({
  cash_advances: [],
  liquidations: [],
  reimbursements: [],
});
const isLoadingRecords = ref(false);

// Waive / Reset Modal
const actionModalOpen = ref(false);
const actionMode = ref("waive"); // 'waive' | 'reset'
const actionTarget = ref(null);
const actionReason = ref("");
const actionReasonError = ref("");

onMounted(() => {
  loadAdminData();
});

async function loadAdminData() {
  await Promise.all([
    penaltyStore
      .fetchAdminOverview({
        search: overviewSearch.value,
        standing: standingFilter.value,
      })
      .catch(() => {}),
    penaltyStore
      .fetchAdminStrikes({
        status: strikeStatusFilter.value,
        module: strikeModuleFilter.value,
        search: strikeSearch.value,
      })
      .catch(() => {}),
  ]);
}

async function applyOverviewFilters() {
  await penaltyStore
    .fetchAdminOverview({
      search: overviewSearch.value,
      standing: standingFilter.value,
    })
    .catch((err) => {
      addToast({ type: "error", message: err?.message || "Failed to filter standings." });
    });
}

async function applyStrikeFilters() {
  await penaltyStore
    .fetchAdminStrikes({
      status: strikeStatusFilter.value,
      module: strikeModuleFilter.value,
      search: strikeSearch.value,
    })
    .catch((err) => {
      addToast({ type: "error", message: err?.message || "Failed to filter strikes." });
    });
}

const kpis = computed(() => {
  const k = penaltyStore.adminOverview?.kpis || {};
  return [
    {
      label: "Penalized Employees",
      value: k.penalized_count ?? 0,
      sub: "Submission hold active",
    },
    {
      label: "Pending Appeals",
      value: k.pending_appeals_count ?? 0,
      sub: "Awaiting admin review",
    },
    {
      label: "Employees in Warning",
      value: k.warning_count ?? 0,
      sub: "1 to 2 active strikes",
    },
    {
      label: "Resolved Cycles",
      value: k.resolved_cycles_count ?? 0,
      sub: "Approved or reset",
    },
  ];
});

const employeeOptions = computed(() => {
  const map = new Map();
  for (const emp of penaltyStore.adminOverview?.employees || []) {
    const id = emp.id ?? emp.user_id;
    if (id && !map.has(id)) {
      map.set(id, {
        id,
        name: emp.name || emp.user_name || `User #${id}`,
        email: emp.email || "",
      });
    }
  }
  for (const row of penaltyStore.adminOverview?.standings || []) {
    const id = row.user_id ?? row.id;
    if (id && !map.has(id)) {
      map.set(id, {
        id,
        name: row.name || row.user_name || `User #${id}`,
        email: row.email || "",
      });
    }
  }
  for (const appeal of penaltyStore.adminOverview?.pending_appeals || []) {
    const id = appeal.user_id ?? appeal.user?.id;
    if (id && !map.has(id)) {
      map.set(id, {
        id,
        name: appeal.user?.name || appeal.user_name || `User #${id}`,
        email: appeal.user?.email || "",
      });
    }
  }
  return Array.from(map.values());
});

const moduleRecordOptions = computed(() => {
  if (manualForm.value.source_module === "cash_advance") {
    return userRecords.value.cash_advances || [];
  }
  if (manualForm.value.source_module === "liquidation") {
    return userRecords.value.liquidations || [];
  }
  return userRecords.value.reimbursements || [];
});

watch(
  () => manualForm.value.user_id,
  async (newUserId) => {
    manualForm.value.source_id = "";
    if (!newUserId) {
      userRecords.value = { cash_advances: [], liquidations: [], reimbursements: [] };
      return;
    }
    isLoadingRecords.value = true;
    try {
      userRecords.value = await penaltyStore.fetchUserRecords(newUserId);
    } catch (err) {
      addToast({ type: "error", message: err?.message || "Could not load employee records." });
      userRecords.value = { cash_advances: [], liquidations: [], reimbursements: [] };
    } finally {
      isLoadingRecords.value = false;
    }
  },
);

watch(
  () => manualForm.value.source_module,
  () => {
    manualForm.value.source_id = "";
  },
);

function isPdfAppeal(appeal) {
  if (!appeal) return false;
  const mime = String(appeal.letter_mime_type || "").toLowerCase();
  const url = String(appeal.letter_url || "").toLowerCase();
  const name = String(appeal.letter_file_name || "").toLowerCase();
  return mime.includes("pdf") || url.endsWith(".pdf") || name.endsWith(".pdf");
}

function isSelfAppeal(appeal) {
  if (!appeal || !auth.user?.id) return false;
  return Number(appeal.user_id ?? appeal.user?.id) === Number(auth.user.id);
}

function openReviewModal(appeal) {
  selectedAppeal.value = appeal;
  reviewComment.value = "";
  reviewCommentError.value = "";
  reviewModalOpen.value = true;
}

async function submitReview(decision) {
  if (!selectedAppeal.value || penaltyStore.isSubmitting) return;
  reviewCommentError.value = "";

  const trimmed = reviewComment.value.trim();
  if (decision === "reject" && !trimmed) {
    reviewCommentError.value = "A rejection comment is required before returning this appeal.";
    return;
  }

  try {
    await penaltyStore.reviewAppeal(selectedAppeal.value.id, {
      decision,
      comment: trimmed,
    });
    reviewModalOpen.value = false;
    addToast({
      type: "success",
      message:
        decision === "approve"
          ? "Appeal approved and employee strikes reset to 0/3."
          : "Appeal rejected with feedback sent to the employee.",
    });
    await loadAdminData();
  } catch (err) {
    reviewCommentError.value = err?.message || "Unable to submit appeal review.";
    addToast({ type: "error", message: reviewCommentError.value });
  }
}

function openManualStrikeModal(preselectedUserId = "") {
  manualForm.value = {
    user_id: preselectedUserId ? String(preselectedUserId) : "",
    source_module: "cash_advance",
    source_id: "",
    reason: "",
  };
  manualErrors.value = { user_id: "", source_id: "", reason: "" };
  manualModalOpen.value = true;
}

async function submitManualStrike() {
  if (penaltyStore.isSubmitting) return;
  manualErrors.value = { user_id: "", source_id: "", reason: "" };

  if (!manualForm.value.user_id) {
    manualErrors.value.user_id = "Please select an employee.";
  }
  if (!manualForm.value.source_id) {
    manualErrors.value.source_id = "Please select the linked financial record.";
  }
  if (manualForm.value.reason.trim().length < 5) {
    manualErrors.value.reason = "Please enter a clear compliance reason (at least 5 characters).";
  }

  if (
    manualErrors.value.user_id ||
    manualErrors.value.source_id ||
    manualErrors.value.reason
  ) {
    return;
  }

  try {
    await penaltyStore.issueManualStrike({
      user_id: Number(manualForm.value.user_id),
      source_module: manualForm.value.source_module,
      source_id: Number(manualForm.value.source_id),
      reason: manualForm.value.reason.trim(),
    });
    manualModalOpen.value = false;
    addToast({ type: "success", message: "Manual compliance strike issued." });
    await loadAdminData();
  } catch (err) {
    manualErrors.value.reason = err?.message || "Failed to issue manual strike.";
    addToast({ type: "error", message: manualErrors.value.reason });
  }
}

function openActionModal(mode, target) {
  actionMode.value = mode;
  actionTarget.value = target;
  actionReason.value = "";
  actionReasonError.value = "";
  actionModalOpen.value = true;
}

async function submitWaiveOrReset() {
  if (!actionTarget.value || penaltyStore.isSubmitting) return;
  actionReasonError.value = "";

  const trimmed = actionReason.value.trim();
  if (!trimmed) {
    actionReasonError.value = "A reason is required for audit compliance.";
    return;
  }

  try {
    if (actionMode.value === "waive") {
      await penaltyStore.waiveStrike(actionTarget.value.id, { reason: trimmed });
      addToast({ type: "success", message: "Strike waived and recorded in history." });
    } else {
      const userId = actionTarget.value.user_id ?? actionTarget.value.id;
      await penaltyStore.resetUserStrikes(userId, { reason: trimmed });
      addToast({ type: "success", message: "Active strikes reset to 0/3." });
    }
    actionModalOpen.value = false;
    await loadAdminData();
  } catch (err) {
    actionReasonError.value = err?.message || "Action failed.";
    addToast({ type: "error", message: actionReasonError.value });
  }
}

function formatRecordOptionLabel(rec) {
  const ref = rec.reference_no || `#${rec.id}`;
  const amt = formatPhpAmount(rec.amount ?? rec.total_expense_amount ?? 0);
  const date = formatMediumDate(rec.created_at);
  return `${ref} | ${amt} | ${rec.status || ""} (${date})`;
}
</script>

<template>
  <div class="flex flex-col gap-6 font-sans">
    <!-- Direct Workspace Header -->
    <div class="min-w-0">
      <h1 class="text-2xl font-bold leading-tight text-slate-800">
        Penalty Management
      </h1>
      <p class="mt-1 text-sm text-slate-500">
        Review employee compliance appeal letters, monitor 3-strike standing, and manage compliance actions.
      </p>
    </div>

    <!-- KPI Grid -->
    <BaseKpiGrid
      :kpis="kpis"
      grid-classes="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      :is-loading="penaltyStore.isAdminLoading && !penaltyStore.adminOverview.standings.length && !penaltyStore.adminOverview.pending_appeals.length"
      :skeleton-count="4"
    />

    <!-- Filter Tabs & Primary Action -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <BaseFilterTabs v-model="activeTab" :tabs="TABS" />

      <BaseButton
        data-testid="open-manual-strike-btn"
        variant="primary"
        class="min-h-[42px] px-5 w-full sm:w-fit font-bold whitespace-nowrap"
        @click="openManualStrikeModal()"
      >
        <Plus class="h-4 w-4" aria-hidden="true" />
        <span>Issue Manual Strike</span>
      </BaseButton>
    </div>

    <!-- TAB 1: PENDING APPEALS -->
    <section v-if="activeTab === 'Pending Appeals'" class="card p-6" aria-label="Pending Appeals">
      <div class="border-b border-slate-200 pb-3 mb-4 flex items-center justify-between">
        <h2 class="text-lg font-bold text-slate-800">Pending Compliance Appeal Letters</h2>
        <span class="text-sm font-semibold text-slate-600 tabular-nums">
          {{ penaltyStore.adminOverview.pending_appeals.length }} pending
        </span>
      </div>

      <SkeletonLoader
        v-if="penaltyStore.isAdminLoading && !penaltyStore.adminOverview.pending_appeals.length"
        variant="list"
        :rows="3"
      />

      <p
        v-else-if="penaltyStore.adminOverview.pending_appeals.length === 0"
        class="py-6 text-sm text-slate-600"
      >
        No pending appeal letters require review right now.
      </p>

      <div v-else class="overflow-x-auto">
        <table class="table-base">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Cycle</th>
              <th>Submitted Date</th>
              <th>Status</th>
              <th class="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="appeal in penaltyStore.adminOverview.pending_appeals"
              :key="appeal.id"
            >
              <td>
                <div class="font-semibold text-slate-800">
                  {{ appeal.user?.name || appeal.user_name || `Employee #${appeal.user_id}` }}
                </div>
                <div v-if="appeal.user?.email" class="text-xs text-slate-500">
                  {{ appeal.user.email }}
                </div>
              </td>
              <td class="tabular-nums">Cycle {{ appeal.cycle_number }}</td>
              <td>{{ formatMediumDate(appeal.created_at) }}</td>
              <td>
                <StatusBadge :status="appeal.status || 'pending'" tier="medium" />
              </td>
              <td class="text-right">
                <BaseButton
                  :data-testid="`review-appeal-${appeal.id}`"
                  variant="secondary"
                  size="sm"
                  @click="openReviewModal(appeal)"
                >
                  <Eye class="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Review Letter</span>
                </BaseButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- TAB 2: EMPLOYEE STANDINGS -->
    <section v-else-if="activeTab === 'Employee Standings'" class="card p-6" aria-label="Employee Standings">
      <div class="flex flex-col gap-3 border-b border-slate-200 pb-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="text-lg font-bold text-slate-800">Employee Compliance Standings</h2>

        <div class="flex flex-wrap items-center gap-2">
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              v-model="overviewSearch"
              type="search"
              placeholder="Search employee..."
              class="input pl-9 py-1.5 text-sm w-56"
              @keyup.enter="applyOverviewFilters"
            />
          </div>

          <select
            v-model="standingFilter"
            aria-label="Filter by standing"
            class="input py-1.5 text-sm w-40"
            @change="applyOverviewFilters"
          >
            <option value="all">All Standings</option>
            <option value="penalized">Penalized (3/3)</option>
            <option value="warning">Warning (1-2/3)</option>
            <option value="clear">Clear (0/3)</option>
          </select>

          <BaseButton variant="secondary" size="sm" @click="applyOverviewFilters">
            Filter
          </BaseButton>
        </div>
      </div>

      <p
        v-if="penaltyStore.adminOverview.standings.length === 0"
        class="py-6 text-sm text-slate-600"
      >
        No employee standing records match the selected filters.
      </p>

      <div v-else class="overflow-x-auto">
        <table class="table-base">
          <thead>
            <tr>
              <th>Employee</th>
              <th class="text-center">Active Strikes</th>
              <th>Standing</th>
              <th class="text-center">Cycle</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in penaltyStore.adminOverview.standings"
              :key="row.user_id ?? row.id"
            >
              <td>
                <div class="font-semibold text-slate-800">
                  {{ row.name || row.user_name || `User #${row.user_id ?? row.id}` }}
                </div>
                <div v-if="row.email" class="text-xs text-slate-500">{{ row.email }}</div>
              </td>
              <td class="text-center font-bold tabular-nums text-slate-800">
                {{ row.active_strikes_count ?? 0 }}/3
              </td>
              <td>
                <StatusBadge :status="row.standing || 'clear'" tier="medium" />
              </td>
              <td class="text-center tabular-nums">
                {{ row.current_cycle ?? 1 }}
              </td>
              <td class="text-right">
                <div class="inline-flex items-center gap-2">
                  <BaseButton
                    v-if="(row.active_strikes_count ?? 0) > 0"
                    :data-testid="`reset-user-${row.user_id ?? row.id}`"
                    variant="secondary"
                    size="sm"
                    @click="openActionModal('reset', row)"
                  >
                    <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reset Strikes</span>
                  </BaseButton>
                  <BaseButton
                    variant="ghost"
                    size="sm"
                    @click="openManualStrikeModal(row.user_id ?? row.id)"
                  >
                    <span>Issue Strike</span>
                  </BaseButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- TAB 3: STRIKE HISTORY -->
    <section v-else class="card p-6" aria-label="Strike History">
      <div class="flex flex-col gap-3 border-b border-slate-200 pb-4 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="text-lg font-bold text-slate-800">Strike Ledger</h2>

        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="strikeSearch"
            type="search"
            placeholder="Search reference or reason..."
            class="input py-1.5 text-sm w-52"
            @keyup.enter="applyStrikeFilters"
          />

          <select
            v-model="strikeStatusFilter"
            aria-label="Filter by status"
            class="input py-1.5 text-sm w-36"
            @change="applyStrikeFilters"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="waived">Waived</option>
            <option value="reset">Reset</option>
          </select>

          <select
            v-model="strikeModuleFilter"
            aria-label="Filter by module"
            class="input py-1.5 text-sm w-44"
            @change="applyStrikeFilters"
          >
            <option value="all">All Modules</option>
            <option value="cash_advance">Cash Advance</option>
            <option value="liquidation">Liquidation</option>
            <option value="reimbursement">Reimbursement</option>
          </select>

          <BaseButton variant="secondary" size="sm" @click="applyStrikeFilters">
            Filter
          </BaseButton>
        </div>
      </div>

      <p
        v-if="penaltyStore.adminStrikes.length === 0"
        class="py-6 text-sm text-slate-600"
      >
        No strike records found.
      </p>

      <div v-else class="overflow-x-auto">
        <table class="table-base">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Module / Ref</th>
              <th>Trigger & Reason</th>
              <th>Issued Date</th>
              <th>Status</th>
              <th class="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="strike in penaltyStore.adminStrikes" :key="strike.id">
              <td class="font-semibold text-slate-800">
                {{ strike.user?.name || strike.user_name || `User #${strike.user_id}` }}
              </td>
              <td>
                <div class="font-medium text-slate-800">
                  {{ formatSourceModule(strike.source_module) }}
                </div>
                <div v-if="strike.source_reference" class="text-xs text-slate-500 tabular-nums">
                  {{ strike.source_reference }}
                </div>
              </td>
              <td class="max-w-sm">
                <div class="text-xs font-semibold text-slate-700">
                  {{ formatTriggerType(strike.trigger_type) }}
                </div>
                <div class="text-sm text-slate-600">{{ strike.reason }}</div>
              </td>
              <td>{{ formatMediumDate(strike.created_at) }}</td>
              <td>
                <StatusBadge :status="strike.status || 'active'" tier="medium" />
              </td>
              <td class="text-right">
                <BaseButton
                  v-if="strike.status === 'active'"
                  :data-testid="`waive-strike-${strike.id}`"
                  variant="secondary"
                  size="sm"
                  @click="openActionModal('waive', strike)"
                >
                  <ShieldOff class="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Waive Strike</span>
                </BaseButton>
                <span v-else class="text-xs text-slate-500">
                  Resolved {{ formatMediumDate(strike.resolved_at) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- MODAL 1: REVIEW APPEAL LETTER -->
    <BaseModal
      :is-open="reviewModalOpen"
      max-width-class="max-w-2xl"
      title="Review Compliance Appeal Letter"
      description="Inspect the submitted letter and approve or reject the employee appeal."
      @close="reviewModalOpen = false"
    >
      <div v-if="selectedAppeal" class="p-6 space-y-5">
        <div class="flex items-start justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 class="text-lg font-bold text-slate-800">
              Compliance Appeal Letter Review
            </h3>
            <p class="text-sm text-slate-500">
              {{ selectedAppeal.user?.name || selectedAppeal.user_name || `User #${selectedAppeal.user_id}` }}
              <span class="mx-1.5">|</span>
              Submitted {{ formatMediumDate(selectedAppeal.created_at) }}
              <span class="mx-1.5">|</span>
              Cycle {{ selectedAppeal.cycle_number }}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close modal"
            class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            @click="reviewModalOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="rounded-lg bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed">
          {{ selectedAppeal.explanation }}
        </div>

        <!-- Inline Letter Preview -->
        <div v-if="selectedAppeal.letter_url" class="space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Attached Document: {{ selectedAppeal.letter_file_name || "Letter Attachment" }}</span>
            <a
              :href="selectedAppeal.letter_url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-primary underline"
            >
              <span>Open File</span>
              <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
          <iframe
            v-if="isPdfAppeal(selectedAppeal)"
            data-testid="appeal-pdf-preview"
            :src="selectedAppeal.letter_url"
            title="Submitted appeal PDF preview"
            class="h-64 w-full rounded-md border border-slate-200 bg-white"
          />
          <img
            v-else
            data-testid="appeal-image-preview"
            :src="selectedAppeal.letter_url"
            :alt="selectedAppeal.letter_file_name || 'Submitted appeal letter'"
            class="max-h-64 w-full rounded-md border border-slate-200 bg-slate-50 object-contain"
          />
        </div>

        <div
          v-if="isSelfAppeal(selectedAppeal)"
          role="alert"
          class="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
        >
          Self-approval is prohibited. Another administrator must review this appeal.
        </div>

        <div>
          <label for="review-comment" class="block text-sm font-semibold text-slate-700 mb-1.5">
            Reviewer Comment (required if rejecting)
          </label>
          <textarea
            id="review-comment"
            v-model="reviewComment"
            rows="3"
            class="input"
            :class="{ 'input-error': reviewCommentError }"
            placeholder="Enter approval remarks or specific reasons for rejection..."
          />
          <p
            v-if="reviewCommentError"
            role="alert"
            class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700"
          >
            <AlertCircle class="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{{ reviewCommentError }}</span>
          </p>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <BaseButton variant="secondary" @click="reviewModalOpen = false">
            Cancel
          </BaseButton>
          <BaseButton
            data-testid="reject-appeal-btn"
            variant="danger"
            :loading="penaltyStore.isSubmitting"
            :disabled="isSelfAppeal(selectedAppeal)"
            @click="submitReview('reject')"
          >
            Reject Appeal
          </BaseButton>
          <BaseButton
            data-testid="approve-appeal-btn"
            variant="primary"
            :loading="penaltyStore.isSubmitting"
            :disabled="isSelfAppeal(selectedAppeal)"
            @click="submitReview('approve')"
          >
            Approve &amp; Reset to 0
          </BaseButton>
        </div>
      </div>
    </BaseModal>

    <!-- MODAL 2: MANUAL ISSUE STRIKE -->
    <BaseModal
      :is-open="manualModalOpen"
      max-width-class="max-w-lg"
      title="Issue Manual Compliance Strike"
      description="Select an employee, module, and linked financial record to issue a compliance strike."
      @close="manualModalOpen = false"
    >
      <form class="p-6 space-y-4" novalidate @submit.prevent="submitManualStrike">
        <div class="flex items-start justify-between border-b border-slate-200 pb-3">
          <h3 class="text-lg font-bold text-slate-800">Issue Manual Strike</h3>
          <button
            type="button"
            aria-label="Close modal"
            class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            @click="manualModalOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div>
          <label for="manual-user" class="block text-sm font-semibold text-slate-700 mb-1.5">
            Employee
          </label>
          <select
            id="manual-user"
            v-model="manualForm.user_id"
            class="input"
            :class="{ 'input-error': manualErrors.user_id }"
          >
            <option value="">Select employee...</option>
            <option v-for="emp in employeeOptions" :key="emp.id" :value="String(emp.id)">
              {{ emp.name }}{{ emp.email ? ` (${emp.email})` : "" }}
            </option>
          </select>
          <p v-if="manualErrors.user_id" role="alert" class="mt-1 text-xs text-red-700">
            {{ manualErrors.user_id }}
          </p>
        </div>

        <div>
          <label for="manual-module" class="block text-sm font-semibold text-slate-700 mb-1.5">
            Source Module
          </label>
          <select id="manual-module" v-model="manualForm.source_module" class="input">
            <option value="cash_advance">Cash Advance</option>
            <option value="liquidation">Liquidation</option>
            <option value="reimbursement">Reimbursement</option>
          </select>
        </div>

        <div>
          <label for="manual-record" class="block text-sm font-semibold text-slate-700 mb-1.5">
            Linked Financial Record
          </label>
          <select
            id="manual-record"
            v-model="manualForm.source_id"
            class="input"
            :class="{ 'input-error': manualErrors.source_id }"
            :disabled="!manualForm.user_id || isLoadingRecords"
          >
            <option value="">
              {{ isLoadingRecords ? "Loading records..." : "Select record..." }}
            </option>
            <option v-for="rec in moduleRecordOptions" :key="rec.id" :value="String(rec.id)">
              {{ formatRecordOptionLabel(rec) }}
            </option>
          </select>
          <p v-if="manualErrors.source_id" role="alert" class="mt-1 text-xs text-red-700">
            {{ manualErrors.source_id }}
          </p>
        </div>

        <div>
          <label for="manual-reason" class="block text-sm font-semibold text-slate-700 mb-1.5">
            Compliance Reason
          </label>
          <textarea
            id="manual-reason"
            v-model="manualForm.reason"
            rows="3"
            class="input"
            :class="{ 'input-error': manualErrors.reason }"
            placeholder="Describe the policy violation or overdue obligation..."
          />
          <p v-if="manualErrors.reason" role="alert" class="mt-1 text-xs text-red-700">
            {{ manualErrors.reason }}
          </p>
        </div>

        <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <BaseButton variant="secondary" @click="manualModalOpen = false">
            Cancel
          </BaseButton>
          <BaseButton
            data-testid="submit-manual-strike-btn"
            type="submit"
            variant="primary"
            :loading="penaltyStore.isSubmitting"
          >
            Issue Strike
          </BaseButton>
        </div>
      </form>
    </BaseModal>

    <!-- MODAL 3: WAIVE STRIKE OR RESET USER STRIKES -->
    <BaseModal
      :is-open="actionModalOpen"
      max-width-class="max-w-md"
      :title="actionMode === 'waive' ? 'Waive Compliance Strike' : 'Reset Active Strikes'"
      description="Provide an audit justification to waive a strike or reset an employee cycle."
      @close="actionModalOpen = false"
    >
      <form class="p-6 space-y-4" novalidate @submit.prevent="submitWaiveOrReset">
        <div class="flex items-start justify-between border-b border-slate-200 pb-3">
          <h3 class="text-lg font-bold text-slate-800">
            {{ actionMode === "waive" ? "Waive Compliance Strike" : "Reset Active Strikes to 0" }}
          </h3>
          <button
            type="button"
            aria-label="Close modal"
            class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            @click="actionModalOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <p v-if="actionTarget" class="text-sm text-slate-600">
          <template v-if="actionMode === 'waive'">
            Waiving strike for
            <span class="font-semibold text-slate-800">
              {{ actionTarget.user?.name || actionTarget.user_name || `User #${actionTarget.user_id}` }}
            </span>
            ({{ actionTarget.source_reference || formatSourceModule(actionTarget.source_module) }}).
          </template>
          <template v-else>
            Resetting all active strikes to 0/3 for
            <span class="font-semibold text-slate-800">
              {{ actionTarget.name || actionTarget.user_name || `User #${actionTarget.user_id ?? actionTarget.id}` }}
            </span>.
          </template>
        </p>

        <div>
          <label for="action-reason" class="block text-sm font-semibold text-slate-700 mb-1.5">
            Justification Reason
          </label>
          <textarea
            id="action-reason"
            v-model="actionReason"
            rows="3"
            class="input"
            :class="{ 'input-error': actionReasonError }"
            placeholder="Enter mandatory audit justification..."
          />
          <p v-if="actionReasonError" role="alert" class="mt-1 text-xs text-red-700">
            {{ actionReasonError }}
          </p>
        </div>

        <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <BaseButton variant="secondary" @click="actionModalOpen = false">
            Cancel
          </BaseButton>
          <BaseButton
            data-testid="confirm-waive-reset-btn"
            type="submit"
            variant="primary"
            :loading="penaltyStore.isSubmitting"
          >
            {{ actionMode === "waive" ? "Confirm Waive" : "Confirm Reset" }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
