<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import { useCashAdvanceList } from "@/composables/useCashAdvanceList";
import DeleteConfirmModal from "@/components/base/DeleteConfirmModal.vue";

import BaseKpiGrid from "@/components/base/BaseKpiGrid.vue";
import BaseUtilityToolbar from "@/components/base/BaseUtilityToolbar.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import CashAdvanceTable from "@/components/cash-advances/CashAdvanceTable.vue";
import CashAdvanceDetailsModal from "@/components/cash-advances/CashAdvanceDetailsModal.vue";
import { Plus, Wallet, Activity, ShieldCheck, X } from "lucide-vue-next";
import { formatPeso } from "@/utils/formatters";
import { useNotificationDeepLink } from "@/composables/useNotificationDeepLink";

const store = useCashAdvanceStore();
const auth = useAuthStore();
const router = useRouter();
const { addToast } = useToast();

const { activeStatus, statusTabs, filteredRows, activeMetrics } =
  useCashAdvanceList(store, auth);
const searchQuery = ref("");

const searchedRows = computed(() => {
  if (!searchQuery.value.trim()) return filteredRows.value;
  const q = searchQuery.value.trim().toLowerCase();
  return filteredRows.value.filter((row) =>
    [row.purpose, row.status, row.user, row.requested, row.dueDate].some(
      (value) =>
        String(value || "")
          .toLowerCase()
          .includes(q),
    ),
  );
});

const viewingRecord = ref(null);

function openDetails(row) {
  viewingRecord.value = {
    ...row,
    id: row.id,
    purpose: (row.purpose || "").replace(/\s\.\.\.$|\.\.\.$/, ""),
    amount: row.amount,
    balance:
      row.outstanding ??
      (["approved", "disbursed", "granted", "unliquidated"].includes(row.status)
        ? row.amount
        : 0),
    status: row.status,
    date: row.requested,
    updatedAt: row.updated_at || row.requested,
    requestedBy: row.user || auth.user?.name || "Employee",
    userId: row.userId,
    dueDate:
      row.dueDate ||
      (row.status === "pending" || row.status === "rejected"
        ? "--"
        : "02/15/2025"),
    adminNotes: row.adminNotes || "N/A",
    acknowledgedAt: row.acknowledgedAt,
    signatureImage: row.signatureImage,
    document: row.document,
    documentUrl: row.documentUrl,
    documentFileName:
      row.documentFileName || `Cash_Advance_Request_${row.id}.pdf`,
    status_history: row.status_history || row.statusHistory || [],
    statusHistory: row.statusHistory || row.status_history || [],
    approval_actions: row.approval_actions || row.approvalActions || [],
    approvalActions: row.approvalActions || row.approval_actions || [],
    disbursement: row.disbursement || null,
    penalties: row.penalties || [],
  };
}

function closeDetails() {
  viewingRecord.value = null;
}

const { checkDeepLink } = useNotificationDeepLink({
  verifyUrl: (id) => `/api/serms/cash-advances/${id}`,
  onOpenRecord: (record) => {
    const existing = store.items.find((r) => String(r.id) === String(record.id));
    openDetails(existing || record);
  },
});

onMounted(async () => {
  await store.fetchAll();
  checkDeepLink();
});

const kpis = computed(() => {
  const m = activeMetrics.value;
  if (!m) return [];
  const admin = auth.isAdmin;
  const cards = [];

  if (!admin) {
    cards.push({
      label: "Total Amount",
      value: formatPeso(m.totalAmount || 0),
      sub: "Total requested",
      icon: Wallet,
      iconBg: "bg-blue-900/10",
      iconColor: "text-blue-900",
      accent: "bg-blue-900",
    });
  }

  cards.push({
    label: admin ? "Pending Advances" : "Pending",
    value: m.pending || 0,
    sub: "Needs action",
    icon: Activity,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    accent: "bg-amber-500",
  });

  cards.push({
    label: admin ? "Approved Advances" : "Approved",
    value: m.approved || 0,
    sub: "Processed",
    icon: ShieldCheck,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    accent: "bg-emerald-500",
  });

  cards.push({
    label: admin ? "Rejected Advances" : "Rejected",
    value: m.rejected || 0,
    sub: "Denied",
    icon: X,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-500",
    accent: "bg-red-500",
  });

  return cards;
});

const isDeleteModalOpen = ref(false);
const deletingRequestId = ref(null);

function handleEdit(row) {
  router.push({ name: "CashAdvanceEdit", params: { id: row.id } });
}

function handleDelete(row) {
  deletingRequestId.value = row.id;
  isDeleteModalOpen.value = true;
}

async function confirmDelete(password) {
  if (!deletingRequestId.value) return;
  try {
    await store.deleteRequest(deletingRequestId.value, password);
    addToast({
      message: "Cash advance request deleted successfully.",
      type: "success",
    });
    isDeleteModalOpen.value = false;
    deletingRequestId.value = null;
  } catch (error) {
    addToast({
      message: error.message || "Failed to delete request.",
      type: "error",
    });
  }
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 mx-auto font-sans max-w-7xl">
    <!-- Page Header -->
    <section
      class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
    >
      <div class="min-w-0">
        <h1
          class="text-2xl font-bold leading-tight font-heading text-slate-800"
        >
          Cash Advance
        </h1>
        <p class="mt-1 text-sm text-slate-400">
          {{
            auth.isAdmin
              ? "Review and manage employee cash advance activity"
              : "Request and track cash advance payments"
          }}
        </p>
      </div>
    </section>

    <!-- Analytics Metrics -->
    <BaseKpiGrid
      :kpis="kpis"
      :gridClasses="
        auth.isAdmin
          ? 'grid-cols-1 sm:grid-cols-3 xl:grid-cols-3 gap-4'
          : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'
      "
      :isLoading="store.isLoading"
    />

    <BaseUtilityToolbar
      v-model:search="searchQuery"
      v-model:status-value="activeStatus"
      :statuses="statusTabs"
    >
      <template #actions>
        <BaseButton
          id="request-advance-btn"
          variant="primary"
          class="min-h-[42px] px-5 w-full sm:w-fit font-bold whitespace-nowrap"
          @click="$router.push('/cash-advances/new')"
        >
          <Plus class="w-4 h-4" />
          New Request
        </BaseButton>
      </template>
    </BaseUtilityToolbar>

    <!-- Cash Advance Data Table -->
    <CashAdvanceTable
      :rows="searchedRows"
      :isAdmin="auth.isAdmin"
      :isLoading="store.isLoading"
      @view="openDetails"
      @edit="handleEdit"
      @delete="handleDelete"
    />

    <!-- Cash Advance Details Modal -->
    <CashAdvanceDetailsModal
      :isOpen="!!viewingRecord"
      :record="viewingRecord"
      @close="closeDetails"
    />

    <!-- Delete Confirmation Modal -->
    <DeleteConfirmModal
      v-model="isDeleteModalOpen"
      title="Delete Cash Advance Request"
      message="Are you sure you want to delete this pending cash advance request? This action cannot be undone."
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.1s linear;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
