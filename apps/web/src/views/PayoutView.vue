<script setup>
import { ref, computed, onMounted } from "vue";
import * as vueRouter from "vue-router";
import { useReimbursementStore } from "@/stores/reimbursement";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import BaseKpiGrid from "@/components/base/BaseKpiGrid.vue";
import BaseUtilityToolbar from "@/components/base/BaseUtilityToolbar.vue";
import PayoutsTable from "@/components/payouts/PayoutsTable.vue";
import PayoutDetailsModal from "@/components/payouts/PayoutDetailsModal.vue";
import { formatPeso } from "@/utils/formatters";
import { usePayoutFilters } from "@/composables/payouts/usePayoutFilters";
import { useNotificationDeepLink } from "@/composables/useNotificationDeepLink";
import {
  Banknote,
  Wallet,
  CheckCircle2,
  Clock,
} from "lucide-vue-next";

const store = useReimbursementStore();
const cashAdvanceStore = useCashAdvanceStore();
const auth = useAuthStore();
const { addToast } = useToast();

const isLoading = computed(() => store.isLoading || cashAdvanceStore.isLoading);

const statusFilters = ["All", "Acknowledged", "Awaiting Acknowledgement"];

const employeePayoutColumns = [
  { key: "referenceNumber", sortKey: "id", label: "Reference Number" },
  { key: "typeLabel", sortKey: "typeLabel", label: "Type" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "payoutMethod", label: "Payout Method" },
  { key: "grantedDate", label: "Granted Date" },
  {
    key: "acknowledgementStatus",
    label: "Acknowledgement Status",
    align: "center",
  },
  { key: "action", sortKey: "id", label: "Action", align: "center" },
];

const adminPayoutColumns = [
  { key: "referenceNumber", sortKey: "id", label: "Reference Number" },
  { key: "typeLabel", sortKey: "typeLabel", label: "Type" },
  { key: "employeeName", sortKey: "employeeName", label: "Employee" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "payoutMethod", label: "Payout Method" },
  { key: "grantedDate", label: "Granted Date" },
  {
    key: "acknowledgementStatus",
    label: "Acknowledgement Status",
    align: "center",
  },
  { key: "action", sortKey: "id", label: "Action", align: "center" },
];

const payoutColumns = computed(() =>
  auth.isAdmin ? adminPayoutColumns : employeePayoutColumns,
);

const {
  searchQuery,
  activeType,
  typeOptions,
  activeStatus,
  activeEmployee,
  activeMethod,
  dateFrom,
  dateTo,
  employeeOptions,
  methodOptions,
  sortKey,
  sortDirection,
  pageSize,
  currentPage,
  tableRows,
  sortedTableRows,
  paginatedTableRows,
  toggleSort,
} = usePayoutFilters(store, auth, cashAdvanceStore);

const payoutKpis = computed(() => {
  const allGranted = tableRows.value;
  const totalAmount = allGranted.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0,
  );
  const acknowledgedCount = allGranted.filter((item) => item.acknowledged).length;
  const awaitingCount = allGranted.length - acknowledgedCount;

  if (auth.isAdmin) {
    return [
      {
        label: "Total Payouts",
        value: allGranted.length,
        sub: "Total releases",
        icon: Banknote,
        iconBg: "bg-accent/10",
        iconColor: "text-accent",
        accent: "bg-accent",
      },
      {
        label: "Total Amount Released",
        value: formatPeso(totalAmount),
        sub: "Disbursed funds",
        icon: Wallet,
        iconBg: "bg-emerald-500/10",
        iconColor: "text-emerald-500",
        accent: "bg-emerald-500",
      },
      {
        label: "Awaiting Acknowledgement",
        value: awaitingCount,
        sub: "Pending employee sign",
        icon: Clock,
        iconBg: "bg-amber-500/10",
        iconColor: "text-amber-500",
        accent: "bg-amber-500",
      },
    ];
  }

  return [
    {
      label: "Total Payouts",
      value: allGranted.length,
      sub: "Granted claims",
      icon: Banknote,
      iconBg: "bg-accent/10",
      iconColor: "text-accent",
      accent: "bg-accent",
    },
    {
      label: "Total Amount Received",
      value: formatPeso(totalAmount),
      sub: "Released funds",
      icon: Wallet,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      accent: "bg-emerald-500",
    },
    {
      label: "Acknowledged",
      value: acknowledgedCount,
      sub: "Signed payouts",
      icon: CheckCircle2,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      accent: "bg-emerald-500",
    },
    {
      label: "Awaiting Acknowledgement",
      value: awaitingCount,
      sub: "Pending signature",
      icon: Clock,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
      accent: "bg-amber-500",
    },
  ];
});

const viewingRecord = ref(null);
const isAcknowledgeSubmitting = ref(false);

function openDetails(row) {
  viewingRecord.value = row;
}

function closeDetails() {
  viewingRecord.value = null;
}

async function handleAcknowledge(signature) {
  if (!viewingRecord.value) return;
  const target = viewingRecord.value;
  isAcknowledgeSubmitting.value = true;
  try {
    if (target.type === "cash_advance") {
      await cashAdvanceStore.acknowledgeRequest(
        target.rawId ?? target.id,
        signature,
      );
      await cashAdvanceStore.fetchAll();
    } else {
      await store.acknowledgePayout(target.rawId ?? target.id, signature);
      await store.fetchAll();
    }
    addToast({ message: "Payout acknowledged successfully!", type: "success" });
    const updated = tableRows.value.find(
      (r) => String(r.id) === String(target.id) && r.type === target.type,
    );
    if (updated) {
      viewingRecord.value = updated;
    } else {
      closeDetails();
    }
  } catch (e) {
    addToast({
      message: e.message || "Failed to acknowledge payout",
      type: "error",
    });
  } finally {
    isAcknowledgeSubmitting.value = false;
  }
}

let route = null;
try {
  route =
    typeof vueRouter.useRoute === "function" ? vueRouter.useRoute() : null;
} catch {
  route = null;
}

const isCashAdvanceDeepLink = () =>
  String(route?.query?.type || "").toLowerCase() === "cash_advance";

const { checkDeepLink } = useNotificationDeepLink({
  verifyUrl: (id) =>
    isCashAdvanceDeepLink()
      ? `/api/serms/cash-advances/${id}`
      : `/api/serms/reimbursements/${id}`,
  onOpenRecord: (record) => {
    const targetType =
      isCashAdvanceDeepLink() ||
      "purpose" in (record || {}) ||
      "expected_liquidation_date" in (record || {})
        ? "cash_advance"
        : "reimbursement";
    const row = tableRows.value.find(
      (r) => String(r.id) === String(record.id) && r.type === targetType,
    );
    if (row) openDetails(row);
  },
});

onMounted(async () => {
  await Promise.all([store.fetchAll(), cashAdvanceStore.fetchAll()]);
  checkDeepLink();
});
</script>

<template>
  <div class="flex flex-col gap-6 font-sans animate-fade-up">
    <!-- Page Header -->
    <div
      class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
    >
      <div class="min-w-0">
        <h1
          class="text-2xl font-bold leading-tight font-heading text-slate-800"
        >
          Payout
        </h1>
        <p class="mt-1 text-sm text-slate-400">
          {{ auth.isAdmin ? "Monitor, audit, and track all granted reimbursement and cash advance payouts across employees." : "View and track all granted reimbursement and cash advance payouts released to you." }}
        </p>
      </div>
    </div>

    <!-- KPI Cards -->
    <BaseKpiGrid
      :kpis="payoutKpis"
      :gridClasses="auth.isAdmin ? 'grid-cols-1 sm:grid-cols-3 gap-4' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'"
      :isLoading="isLoading"
      :skeletonCount="auth.isAdmin ? 3 : 4"
    />

    <!-- Search & Filter Toolbar -->
    <BaseUtilityToolbar
      v-model:search="searchQuery"
      v-model:status-value="activeStatus"
      :statuses="statusFilters"
      search-placeholder="Search reference number, type, payout method, or amount..."
    >
      <template #extra-filters>
        <div class="flex flex-col gap-3 p-1">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
              Type
            </label>
            <select
              id="payout-type-filter"
              v-model="activeType"
              class="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 text-slate-700"
            >
              <option v-for="t in typeOptions" :key="t" :value="t">
                {{ t === "All" ? "All Types" : t }}
              </option>
            </select>
          </div>

          <template v-if="auth.isAdmin">
            <div>
              <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                Employee
              </label>
              <select
                id="admin-employee-filter"
                v-model="activeEmployee"
                class="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 text-slate-700"
              >
                <option value="All">All Employees</option>
                <option v-for="emp in employeeOptions" :key="emp" :value="emp">
                  {{ emp }}
                </option>
              </select>
            </div>

            <div>
              <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                Payout Method
              </label>
              <select
                id="admin-method-filter"
                v-model="activeMethod"
                class="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 text-slate-700"
              >
                <option v-for="m in methodOptions" :key="m" :value="m">
                  {{ m === "All" ? "All Methods" : m }}
                </option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                  From
                </label>
                <input
                  id="admin-date-from"
                  type="date"
                  v-model="dateFrom"
                  class="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 text-slate-700"
                />
              </div>
              <div>
                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                  To
                </label>
                <input
                  id="admin-date-to"
                  type="date"
                  v-model="dateTo"
                  class="w-full text-xs rounded-lg border border-slate-200 bg-white p-2 text-slate-700"
                />
              </div>
            </div>
          </template>
        </div>
      </template>
    </BaseUtilityToolbar>

    <!-- Main Payouts Table -->
    <PayoutsTable
      :is-loading="isLoading"
      :rows="paginatedTableRows"
      :total-rows="sortedTableRows.length"
      :columns="payoutColumns"
      :sort-key="sortKey"
      :sort-direction="sortDirection"
      v-model:current-page="currentPage"
      :page-size="pageSize"
      :is-admin="auth.isAdmin"
      :current-user-id="auth.user?.id ?? null"
      @toggle-sort="toggleSort"
      @view-details="openDetails"
    />

    <!-- Payout Details Modal (G2-049, G2-050, G2-052) -->
    <PayoutDetailsModal
      :record="viewingRecord"
      :is-admin="auth.isAdmin"
      :is-submitting="isAcknowledgeSubmitting"
      @close="closeDetails"
      @acknowledge="handleAcknowledge"
    />
  </div>
</template>
