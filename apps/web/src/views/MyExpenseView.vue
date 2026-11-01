<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useReceiptStore } from "@/stores/receipts";
import { useToast } from "@/composables/useToast";
import { formatPeso } from "@/utils/formatters";
import { EXPENSE_CATEGORIES } from "@/utils/constants";
import { canEditReceipt, canDeleteReceipt } from "@/utils/receiptUtils";
import {
  getForwardingBlockReason,
  mapReceiptToReimbursement,
} from "@/utils/reimbursementForwarding";
import { useNotificationDeepLink } from "@/composables/useNotificationDeepLink";

import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseKpiGrid from "@/components/base/BaseKpiGrid.vue";
import BasePagination from "@/components/base/BasePagination.vue";
import BaseUtilityToolbar from "@/components/base/BaseUtilityToolbar.vue";
import ReceiptViewModal from "@/components/expenses/ReceiptViewModal.vue";
import ExpenseCard from "@/components/expenses/ExpenseCard.vue";
import ExpenseCardSkeleton from "@/components/expenses/ExpenseCardSkeleton.vue";
import ReceiptUploadModal from "@/components/expenses/ReceiptUploadModal.vue";
import DeleteConfirmModal from "@/components/base/DeleteConfirmModal.vue";
import {
  AlertTriangle,
  Search,
  UploadCloud,
  Send,
  Receipt,
  Wallet,
  CheckSquare,
  ShieldCheck,
  ChevronDown,
  Layers,
} from "lucide-vue-next";

const auth = useAuthStore();
const receiptsStore = useReceiptStore();
const { addToast } = useToast();
const router = useRouter();

// ── Selection ────────────────────────────────────────────────────
const selectedIds = ref(new Set());

function toggleSelect(id) {
  const s = new Set(selectedIds.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selectedIds.value = s;
}

const selectedCount = computed(() => selectedIds.value.size);

const selectedReceiptsData = computed(() =>
  receiptsStore.visibleReceipts.filter((r) => selectedIds.value.has(r.id)),
);

function forwardSelected() {
  forwardReceipts(selectedReceiptsData.value);
}

function forwardReceipt(receipt) {
  forwardReceipts([receipt]);
}

function forwardReceipts(receipts) {
  const reason = getForwardingBlockReason(receipts);
  if (reason) {
    addToast({ message: reason, type: "error" });
    return;
  }

  sessionStorage.setItem(
    "serms_forwarded_reimbursement_receipts",
    JSON.stringify(receipts.map(mapReceiptToReimbursement)),
  );
  router.push("/reimbursements/new");
}

const CATEGORIES = computed(() => {
  const source = receiptsStore.categories.length
    ? receiptsStore.categories
    : EXPENSE_CATEGORIES;

  return ["All", ...source.map((c) => c.name)];
});
const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "category-asc", label: "Category: A to Z" },
  { value: "status-asc", label: "Status: A to Z" },
];

const activeCategory = ref("All");
const activeStatus = ref("All");
const activeSort = ref("newest");
const searchQuery = ref("");
const currentPage = ref(1);
const pageSize = 10;

const STATUS_FILTERS = ["All", "Processed", "Pending", "Rejected", "Approved"];

function normalizeFilterLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

const filteredReceipts = computed(() => receiptsStore.visibleReceipts);

async function fetchReceipts(page = currentPage.value) {
  currentPage.value = page;
  await receiptsStore.fetchAll({
    page,
    perPage: pageSize,
    search: searchQuery.value.trim(),
    status: normalizeFilterLabel(activeStatus.value),
    category: activeCategory.value,
    sort: activeSort.value,
    scope: "mine",
  });
}

// ── Metrics ───────────────────────────────────────────────────────
const totalExpenses = computed(() =>
  receiptsStore.visibleReceipts.reduce((s, r) => s + (r.amount || 0), 0),
);

// ── Delete Modal ──────────────────────────────────────────────────
const deleteModalOpen = ref(false);
const selectedReceiptId = ref(null);

function promptDelete(id) {
  selectedReceiptId.value = id;
  deleteModalOpen.value = true;
}

async function confirmDelete(password) {
  const receipt = receiptsStore.visibleReceipts.find(
    (item) => item.id === selectedReceiptId.value,
  );

  if (receipt && !canDeleteReceipt(receipt)) {
    addToast({
      message: "This receipt's current status does not allow deletion.",
      type: "error",
    });
    deleteModalOpen.value = false;
    return;
  }

  const isValid = await auth.verifyPassword(password);

  if (isValid) {
    await receiptsStore.softDelete(selectedReceiptId.value);
    const s = new Set(selectedIds.value);
    s.delete(selectedReceiptId.value);
    selectedIds.value = s;
    const nextPage =
      receiptsStore.visibleReceipts.length === 1 && currentPage.value > 1
        ? currentPage.value - 1
        : currentPage.value;
    await fetchReceipts(nextPage);
    addToast({ message: "Receipt removed.", type: "success" });
    deleteModalOpen.value = false;
  } else {
    addToast({ message: "Invalid password.", type: "error" });
  }
}

// ── OCR completion toasts ─────────────────────────────────────────
// Poll any receipt currently in `processing` and surface a toast when the
// external AI OCR callback flips it to a terminal status. Covers both the
// Retry OCR flow and first-time uploads, even if the modal was closed.
const ocrWatchedIds = ref(new Set());
let ocrPollTimer = null;

function toastOcrCompletion(receipt) {
  if (!receipt) return;
  const status = String(receipt.status || receipt.complianceStatus || "").toLowerCase();
  const label = receipt.id || "receipt";
  switch (status) {
    case "processed":
      addToast({ message: `OCR completed for ${label}.`, type: "success" });
      break;
    case "flagged":
      addToast({
        message: `OCR finished with low confidence — ${label} was flagged.`,
        type: "warning",
      });
      break;
    case "rejected":
      addToast({ message: `OCR rejected ${label}.`, type: "error" });
      break;
    case "failed":
      addToast({ message: `OCR failed for ${label}.`, type: "error" });
      break;
    default:
      addToast({ message: `OCR finished for ${label} (${status}).`, type: "info" });
  }
}

async function tickOcrWatch() {
  for (const id of [...ocrWatchedIds.value]) {
    try {
      const updated = await receiptsStore.refreshReceipt(id);
      const status = String(updated?.status || "").toLowerCase();
      if (status && status !== "processing") {
        toastOcrCompletion(updated);
        ocrWatchedIds.value.delete(id);
      }
    } catch {
      // keep watching; will retry on the next tick
    }
  }
  if (ocrWatchedIds.value.size === 0 && ocrPollTimer) {
    clearInterval(ocrPollTimer);
    ocrPollTimer = null;
  }
}

function ensureOcrWatch() {
  for (const r of receiptsStore.visibleReceipts) {
    if (String(r.status || "").toLowerCase() === "processing") {
      ocrWatchedIds.value.add(r.dbId);
    }
  }
  if (ocrWatchedIds.value.size > 0 && !ocrPollTimer) {
    ocrPollTimer = setInterval(tickOcrWatch, 2500);
  }
}

watch(
  () => receiptsStore.visibleReceipts.map((r) => `${r.dbId}:${r.status}`).join("|"),
  () => ensureOcrWatch(),
);

// ── View Modal ────────────────────────────────────────────────────
const viewModalOpen = ref(false);
const viewedReceipt = ref(null);

function openViewModal(receipt) {
  viewedReceipt.value = receipt;
  viewModalOpen.value = true;
}

// ── Upload Modal ──────────────────────────────────────────────────
const uploadModalOpen = ref(false);
const receiptBeingEdited = ref(null);
const isDropdownOpen = ref(false);
const uploadMode = ref("single");
const myExpenseFileInput = ref(null);
const pendingUpload = ref(null);

const automaticRejectedReceipts = computed(() =>
  receiptsStore.visibleReceipts.filter(
    (r) => r.status === "automatic-rejected",
  ),
);

function triggerUpload(mode) {
  uploadMode.value = mode;
  isDropdownOpen.value = false;
  if (myExpenseFileInput.value) {
    myExpenseFileInput.value.multiple = (mode === "multi");
    myExpenseFileInput.value.value = "";
    myExpenseFileInput.value.click();
  }
}

function handleFileInput(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    const fileArray = Array.from(files);
    if (uploadMode.value === "single") {
      pendingUpload.value = { mode: "single", files: [fileArray[0]] };
    } else {
      if (fileArray.length >= 2) {
        pendingUpload.value = { mode: "multi", files: fileArray.slice(0, 6) };
      } else {
        // Fallback to single receipt
        pendingUpload.value = { mode: "single", files: [fileArray[0]] };
      }
    }
    uploadModalOpen.value = true;
  }
  if (e.target) e.target.value = "";
}

const dropdownRef = ref(null);

function handleWindowClick(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
}

function openEditReceipt(receipt) {
  if (!canEditReceipt(receipt)) {
    addToast({
      message: "This receipt's current status does not allow editing.",
      type: "error",
    });
    return;
  }

  receiptBeingEdited.value = receipt;
  uploadModalOpen.value = true;
}

function closeUploadModal(value) {
  uploadModalOpen.value = value;
  if (!value) {
    receiptBeingEdited.value = null;
    pendingUpload.value = null;
  }
}

// Refresh the card grid after a new OCR'd receipt is saved.
function onExpenseSaved() {
  fetchReceipts(currentPage.value);
}

// ── Lifecycle ─────────────────────────────────────────────────────
const handleOpenReceiptUpload = () => { triggerUpload("single"); };

const { checkDeepLink } = useNotificationDeepLink({
  verifyUrl: (id) => `/api/serms/reimbursements/receipts/${id}`,
  onOpenRecord: (record) => {
    const existing = receiptsStore.visibleReceipts.find(
      (r) => String(r.dbId ?? r.id) === String(record.id),
    );
    openViewModal(existing || record);
  },
});

onMounted(async () => {
  window.addEventListener("click", handleWindowClick);
  const tasks = [fetchReceipts(1), receiptsStore.fetchCategories()];
  await Promise.all(tasks);
  checkDeepLink();
  ensureOcrWatch();
  window.addEventListener('open-receipt-upload', handleOpenReceiptUpload);
});

onUnmounted(() => {
  window.removeEventListener("click", handleWindowClick);
  if (ocrPollTimer) clearInterval(ocrPollTimer);
  window.removeEventListener('open-receipt-upload', handleOpenReceiptUpload);
});

watch([activeCategory, activeStatus, activeSort], () => {
  fetchReceipts(1);
});

watch(searchQuery, () => {
  fetchReceipts(1);
});

// KPI definitions matching dashboard pattern
const kpis = computed(() => [
  {
    label: "Total Receipts",
    value: receiptsStore.pagination.total,
    sub: "In repository",
    icon: Receipt,
    iconBg: "bg-accent-100",
    iconColor: "text-accent-600",
    accent: "bg-accent",
  },
  {
    label: "Total Expenses",
    value: formatPeso(totalExpenses.value),
    sub: "Cumulative amount",
    icon: Wallet,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    accent: "bg-emerald-500",
  },
  {
    label: "Selected",
    value: selectedCount.value,
    sub: "Ready to forward",
    icon: CheckSquare,
    iconBg: "bg-primary-100",
    iconColor: "text-primary-600",
    accent: "bg-primary",
  },
]);
</script>

<template>
  <div>
    <!-- Hidden file input for My Expense Upload -->
    <input
      ref="myExpenseFileInput"
      type="file"
      class="hidden"
      accept=".jpg,.jpeg,.png,.pdf"
      :multiple="uploadMode === 'multi'"
      @change="handleFileInput"
    />

    <div class="flex flex-col gap-6 pb-12 mx-auto max-w-7xl animate-fade-up">
      <!-- ── Page Header ── -->
      <div
        class="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center"
      >
        <div>
          <h1
            class="text-2xl font-bold leading-tight text-slate-800 font-heading tracking-tight"
          >
            My Expense
          </h1>
          <p
            class="mt-1 text-sm text-slate-400 font-sans"
          >
            Organize and manage your receipts
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <!-- Forward to Reimbursement -->
          <button
            @click="forwardSelected"
            :disabled="selectedCount === 0"
            class="btn min-h-[42px] px-4 py-2 border border-transparent inline-flex items-center justify-center gap-2 font-medium"
            :class="
              selectedCount > 0
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed'
            "
          >
            <Send class="w-4 h-4 shrink-0" />
            <span>To Reimbursement</span>
          </button>
          <!-- Upload Receipt Dropdown -->
          <div ref="dropdownRef" class="relative inline-block text-left" @click.stop>
            <button
              id="upload-receipt-btn"
              type="button"
              @click.stop="isDropdownOpen = !isDropdownOpen"
              class="btn btn-primary min-h-[42px] inline-flex items-center gap-2"
            >
              <UploadCloud class="w-4 h-4" />
              <span>Upload Receipt</span>
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
                    id="my-expense-single-btn"
                    class="group flex w-full items-center rounded-md px-3 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white transition-colors"
                    @click="triggerUpload('single')"
                  >
                    <UploadCloud class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                    Single Receipt
                  </button>
                  <button
                    type="button"
                    id="my-expense-multi-btn"
                    class="group flex w-full items-center rounded-md px-3 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white transition-colors"
                    @click="triggerUpload('multi')"
                  >
                    <Layers class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                    Multi Receipt
                  </button>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- ── KPI Cards ── -->
      <BaseKpiGrid
        :kpis="kpis"
        :is-loading="receiptsStore.isLoading"
        gridClasses="grid-cols-1 sm:grid-cols-3 gap-4"
      />

      <div
        v-if="!auth.isAdmin && automaticRejectedReceipts.length > 0"
        class="p-4 border rounded-xl border-danger/20 bg-danger/5"
      >
        <div class="flex items-start gap-3">
          <AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <p class="text-sm font-bold font-heading text-danger">
              {{ automaticRejectedReceipts.length }} receipt{{
                automaticRejectedReceipts.length === 1 ? "" : "s"
              }}
              need correction
            </p>
            <p class="mt-1 text-sm text-slate-600">
              System validation automatically rejected these receipts. Edit and
              resubmit them for admin re-review.
            </p>
          </div>
        </div>
      </div>

      <!-- ── Search / Popup Filters ── -->
      <BaseUtilityToolbar
        v-model:search="searchQuery"
        v-model:status-value="activeStatus"
        v-model:category-value="activeCategory"
        v-model:sort-value="activeSort"
        :statuses="STATUS_FILTERS"
        :categories="CATEGORIES"
        :sort-options="SORT_OPTIONS"
      />

      <!-- ── Receipt Card Grid ── -->
      <TransitionGroup
        v-if="receiptsStore.isLoading"
        tag="div"
        name="list"
        class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <ExpenseCardSkeleton v-for="i in 8" :key="'skeleton-' + i" />
      </TransitionGroup>

      <template v-else-if="filteredReceipts.length > 0">
        <TransitionGroup
          tag="div"
          name="list"
          class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <ExpenseCard
            v-for="receipt in filteredReceipts"
            :key="receipt.id"
            :expense="receipt"
            :is-selected="selectedIds.has(receipt.id)"
            @select="toggleSelect"
            @view="openViewModal"
            @edit="openEditReceipt"
            @delete="promptDelete"
            @forward-reimbursement="forwardReceipt"
          />
        </TransitionGroup>

        <BasePagination
          v-if="receiptsStore.pagination.total > pageSize"
          :page="currentPage"
          :page-size="pageSize"
          :total="receiptsStore.pagination.total"
          label="receipts"
          @update:page="fetchReceipts"
        />
      </template>

      <!-- Empty State -->
      <div
        v-else
        class="flex flex-col items-center gap-4 p-16 text-center card"
      >
        <div
          class="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/5"
        >
          <Search class="w-7 h-7 text-primary/30" />
        </div>
        <div>
          <p
            class="text-sm font-semibold text-slate-600 font-heading"
          >
            No receipts found
          </p>
          <p class="mt-1 text-xs text-slate-400">
            Try a different category filter or upload a new receipt.
          </p>
        </div>
        <button @click="triggerUpload('single')" class="mt-2 btn btn-primary">
          <UploadCloud class="w-4 h-4" /> Upload Receipt
        </button>
      </div>
    </div>

    <!-- ── Upload / Receipt Scanned Modal ── -->
    <ReceiptUploadModal
      :model-value="uploadModalOpen"
      :categories="receiptsStore.categories"
      :receipt-to-edit="receiptBeingEdited"
      :pending-upload="pendingUpload"
      @update:model-value="closeUploadModal"
      @saved="onExpenseSaved"
    />

    <!-- ── Delete Confirmation Modal ── -->
    <DeleteConfirmModal v-model="deleteModalOpen" @confirm="confirmDelete" />

    <!-- ── View Receipt Modal ── -->
    <ReceiptViewModal
      v-model="viewModalOpen"
      :receipt="viewedReceipt"
      @delete="promptDelete"
      @edit="openEditReceipt"
    />
  </div>
</template>

<style scoped>
/* ── Card modal pop ── */
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
  animation: modal-pop 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both;
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

/* ── Grid List Transitions ── */
.list-enter-active,
.list-leave-active,
.list-move {
  transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(10px);
}
.list-leave-active {
  position: absolute;
}

/* ── Badge Pop ── */
.pop-enter-active {
  animation: bounce-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.pop-leave-active {
  animation: bounce-in 0.2s reverse ease-in;
}
@keyframes bounce-in {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
