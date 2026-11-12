<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useReimbursementStore } from "@/stores/reimbursement";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseKpiGrid from "@/components/base/BaseKpiGrid.vue";
import BaseUtilityToolbar from "@/components/base/BaseUtilityToolbar.vue";
import ReimbursementDetailsModal from "@/components/reimbursements/ReimbursementDetailsModal.vue";
import ReceiptDetailsModal from "@/components/reimbursements/ReceiptDetailsModal.vue";
import DecisionConfirmationModal from "@/components/base/DecisionConfirmationModal.vue";
import GrantPayoutModal from "@/components/reimbursements/GrantPayoutModal.vue";
import DeleteConfirmModal from "@/components/base/DeleteConfirmModal.vue";
import ReimbursementsTable from "@/components/reimbursements/ReimbursementsTable.vue";
import { formatPeso } from "@/utils/formatters";
import {
  useReimbursementFilters,
  normalizeStatus,
} from "@/composables/reimbursements/useReimbursementFilters";
import { useReimbursementDetails } from "@/composables/reimbursements/useReimbursementDetails";
import { useReimbursementDecisions } from "@/composables/reimbursements/useReimbursementDecisions";
import { useNotificationDeepLink } from "@/composables/useNotificationDeepLink";
import {
  Plus,
  ShieldCheck,
  XCircle,
  Clock,
  Wallet,
  Send,
  ChevronDown,
  UploadCloud,
  Layers,
} from "lucide-vue-next";

const store = useReimbursementStore();
const auth = useAuthStore();
const router = useRouter();
const { addToast } = useToast();

const statusFilters = computed(() =>
  auth.isAdmin
    ? ["All", "Pending", "Revise", "Approved", "Rejected", "Granted"]
    : ["All", "Pending", "Revise", "Approved", "Rejected", "Granted"],
);

const employeeReimbursementColumns = [
  { key: "reportDescription", label: "Report Description" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "dateSubmitted", label: "Date Submitted" },
  { key: "displayStatus", label: "Status", align: "center" },
  { key: "action", sortKey: "id", label: "Action", align: "center" },
];

const adminReimbursementColumns = [
  { key: "reportDescription", label: "Report Description" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "dateSubmitted", label: "Date Submitted" },
  { key: "submittedBy", label: "Submitted By" },
  { key: "displayStatus", label: "Status", align: "center" },
  { key: "action", sortKey: "id", label: "Action", align: "center" },
];

const reimbursementColumns = computed(() =>
  auth.isAdmin ? adminReimbursementColumns : employeeReimbursementColumns,
);

const {
  searchQuery,
  activeStatus,
  activeCategory,
  sortKey,
  sortDirection,
  pageSize,
  currentPage,
  categoryFilters,
  paginatedTableRows,
  sortedTableRows,
  toggleSort,
} = useReimbursementFilters(store);

const reimbursementKpis = computed(() => [
  {
    label: "Pending",
    value: store.items.filter(
      (item) => normalizeStatus(item.status) === "pending",
    ).length,
    sub: "Awaiting review",
    icon: Clock,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    accent: "bg-amber-500",
  },
  {
    label: "Approved",
    value: store.items.filter((item) => item.status === "approved").length,
    sub: "Ready for payment",
    icon: ShieldCheck,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    accent: "bg-emerald-500",
  },
  {
    label: "Rejected",
    value: store.items.filter(
      (item) => normalizeStatus(item.status) === "rejected",
    ).length,
    sub: "Denied claims",
    icon: XCircle,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-500",
    accent: "bg-red-500",
  },
  {
    label: "Total Amount",
    value: formatPeso(store.totalAmount),
    sub: "All claims",
    icon: Wallet,
    iconBg: "bg-accent/10",
    iconColor: "text-accent",
    accent: "bg-accent",
  },
  {
    label: "Total Submitted",
    value: store.items.length,
    sub: "Claim records",
    icon: Send,
    iconBg: "bg-slate-500/10",
    iconColor: "text-slate-500",
    accent: "bg-slate-500",
  },
]);

const {
  viewingRecord,
  receiptDetailsOpen,
  selectedReceipt,
  reviewerNotes,
  pendingReceiptDecision,
  isReceiptReviewSubmitting,
  modalLoading,
  closeDetails,
  viewReceiptDetails,
  openDetails,
  requestReceiptDecision,
  cancelReceiptDecision,
  isReceiptDecisionPending,
  confirmReceiptDecision,
} = useReimbursementDetails(store, addToast);

const {
  approvingId,
  rejectingId,
  grantingId,
  revisionAction,
  rejectionComment,
  confirmPassword,
  isReviewSubmitting,
  openApproveModal,
  cancelApprove,
  confirmApprove,
  openRejectModal,
  cancelReject,
  confirmReject,
  openGrantModal,
  cancelGrant,
  confirmGrant,
} = useReimbursementDecisions(store, addToast, viewingRecord);

const isDeleteModalOpen = ref(false);
const deletingRequestId = ref(null);
const newRequestFileInput = ref(null);
const isDropdownOpen = ref(false);
const newRequestUploadMode = ref("single");

function triggerNewRequestUpload(mode) {
  newRequestUploadMode.value = mode;
  isDropdownOpen.value = false;
  if (newRequestFileInput.value) {
    newRequestFileInput.value.multiple = (mode === "multi");
    newRequestFileInput.value.value = "";
    newRequestFileInput.value.click();
  }
}

function handleNewRequest() {
  triggerNewRequestUpload("single");
}

function handleNewRequestFiles(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    const fileArray = Array.from(files);
    if (newRequestUploadMode.value === "single") {
      const selected = [fileArray[0]];
      window.__serms_pending_upload = { mode: "single", files: selected };
      window.__serms_pending_files = selected;
    } else {
      if (fileArray.length >= 2) {
        const segments = fileArray.slice(0, 6);
        window.__serms_pending_upload = { mode: "multi", files: segments };
        window.__serms_pending_files = segments;
      } else {
        // Graceful fallback to single receipt if only 1 file was chosen
        const selected = [fileArray[0]];
        window.__serms_pending_upload = { mode: "single", files: selected };
        window.__serms_pending_files = selected;
      }
    }
    router.push('/reimbursements/new');
  }
  if (e.target) e.target.value = "";
}

function handleEdit(row) {
  const id = typeof row === "object" && row !== null ? row.id : row;
  if (!id) return;
  closeDetails();
  router.push({ name: "ReimbursementEdit", params: { id } });
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
      message: "Reimbursement request deleted successfully.",
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

const { checkDeepLink } = useNotificationDeepLink({
  verifyUrl: (id) => `/api/serms/reimbursements/${id}`,
  onOpenRecord: (record) => openDetails(record),
});

const dropdownRef = ref(null);

function handleWindowClick(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
}

onMounted(async () => {
  window.addEventListener("click", handleWindowClick);
  await store.fetchAll();
  checkDeepLink();
});

onBeforeUnmount(() => {
  window.removeEventListener("click", handleWindowClick);
});
</script>

<template>
  <div class="flex flex-col gap-6 font-sans animate-fade-up">
    <!-- Hidden file input for New Request -->
    <input
      ref="newRequestFileInput"
      type="file"
      class="hidden"
      accept=".jpg,.jpeg,.png,.pdf"
      :multiple="newRequestUploadMode === 'multi'"
      @change="handleNewRequestFiles"
    />

    <!-- ── Page Header ── -->
    <div
      class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
    >
      <div class="min-w-0">
        <h1
          class="text-2xl font-bold leading-tight font-heading text-slate-800"
        >
          Reimbursements
        </h1>
        <p class="mt-1 text-sm text-slate-400">
          Manage and track all submitted expense claims.
        </p>
      </div>
    </div>

    <!-- ── KPI Cards ── -->
    <BaseKpiGrid
      :kpis="reimbursementKpis"
      gridClasses="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
      :isLoading="store.isLoading"
      :skeletonCount="5"
    />
    <BaseUtilityToolbar
      v-model:search="searchQuery"
      v-model:status-value="activeStatus"
      v-model:category-value="activeCategory"
      :statuses="statusFilters"
      :categories="categoryFilters"
    >
      <template #actions>
        <div ref="dropdownRef" class="relative inline-block text-left w-full sm:w-auto" @click.stop>
          <button
            id="new-reimbursement-btn"
            type="button"
            class="btn btn-primary min-h-[42px] px-5 w-full sm:w-fit font-bold whitespace-nowrap inline-flex items-center justify-center gap-2"
            @click.stop="isDropdownOpen = !isDropdownOpen"
          >
            <Plus class="w-4 h-4" />
            <span>New Request</span>
            <ChevronDown class="w-3.5 h-3.5 ml-1 -mr-1" aria-hidden="true" />
          </button>

          <transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0"
          >
            <div
              v-if="isDropdownOpen"
              class="absolute z-30 w-48 mt-2 origin-top-right right-0 bg-white divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            >
              <div class="px-1 py-1">
                <button
                  type="button"
                  id="new-request-single-btn"
                  class="group flex w-full items-center rounded-md px-3 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white transition-colors"
                  @click="triggerNewRequestUpload('single')"
                >
                  <UploadCloud class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                  Single Receipt
                </button>
                <button
                  type="button"
                  id="new-request-multi-btn"
                  class="group flex w-full items-center rounded-md px-3 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white transition-colors"
                  @click="triggerNewRequestUpload('multi')"
                >
                  <Layers class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                  Multi Receipt
                </button>
              </div>
            </div>
          </transition>
        </div>
      </template>
    </BaseUtilityToolbar>

    <!-- ── Main Table ── -->
    <ReimbursementsTable
      :is-loading="store.isLoading"
      :rows="paginatedTableRows"
      :total-rows="sortedTableRows.length"
      :columns="reimbursementColumns"
      :sort-key="sortKey"
      :sort-direction="sortDirection"
      :is-admin="auth.isAdmin"
      v-model:current-page="currentPage"
      :page-size="pageSize"
      @toggle-sort="toggleSort"
      @view-details="openDetails"
      @edit-request="handleEdit"
      @delete-request="handleDelete"
    />

    <!-- ── Record Detail Panel (Modal) ── -->
    <ReimbursementDetailsModal
      :viewing-record="viewingRecord"
      :receipt-details-open="receiptDetailsOpen"
      :modal-loading="modalLoading"
      @close="closeDetails"
      @view-receipt-details="viewReceiptDetails"
      @reject="(id, action) => openRejectModal(id, action || 'revise')"
      @approve="openApproveModal"
      @grant="openGrantModal"
      @edit="handleEdit"
    />

    <!-- ── Single Receipt Details Modal ── -->
    <ReceiptDetailsModal
      :is-open="!!viewingRecord && receiptDetailsOpen"
      :receipt="selectedReceipt"
      v-model:reviewer-notes="reviewerNotes"
      :pending-decision-action="
        isReceiptDecisionPending(selectedReceipt)
          ? pendingReceiptDecision?.action
          : null
      "
      :is-submitting="isReceiptReviewSubmitting"
      @close="receiptDetailsOpen = false"
      @close-all="closeDetails"
      @request-decision="
        (action) => requestReceiptDecision(selectedReceipt, action)
      "
      @cancel-decision="cancelReceiptDecision"
      @confirm-decision="confirmReceiptDecision"
    />

    <!-- Approve / Revise / Reject Confirmation Modal -->
    <DecisionConfirmationModal
      :is-open="!!approvingId || !!rejectingId"
      :mode="approvingId ? 'approve' : (revisionAction || 'revise')"
      :is-submitting="isReviewSubmitting"
      v-model:password="confirmPassword"
      v-model:comment="rejectionComment"
      @close="approvingId ? cancelApprove() : cancelReject()"
      @confirm="approvingId ? confirmApprove() : confirmReject()"
    />

    <!-- Grant Reimbursement Payout Modal (G2-043 to G2-046) -->
    <GrantPayoutModal
      :is-open="!!grantingId"
      :record="viewingRecord || store.items.find((i) => i.id === grantingId)"
      :default-granted-by="auth.user?.name"
      :is-submitting="isReviewSubmitting"
      @close="cancelGrant"
      @confirm="confirmGrant"
    />

    <!-- Delete Confirmation Modal -->
    <DeleteConfirmModal
      v-model="isDeleteModalOpen"
      title="Delete Reimbursement Request"
      message="Are you sure you want to delete this pending reimbursement request? This action cannot be undone."
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.modal-enter-active {
  transition: opacity 0.2s ease-out;
}
.modal-leave-active {
  transition: opacity 0.15s ease-in;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active > div {
  animation: modal-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes modal-pop {
  from {
    transform: scale(0.95) translateY(8px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
</style>
