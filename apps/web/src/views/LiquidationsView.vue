<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { useLiquidationStore } from "@/stores/liquidation";
import { useReceiptStore } from "@/stores/receipts";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import StatusBadge from "@/components/base/StatusBadge.vue";
import DaysLeftBadge from "@/components/base/DaysLeftBadge.vue";
import FileUpload from "@/components/base/FileUpload.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseModal from "@/components/base/BaseModal.vue";
import BaseToggleSwitch from "@/components/base/BaseToggleSwitch.vue";
import BaseKpiGrid from "@/components/base/BaseKpiGrid.vue";
import BasePagination from "@/components/base/BasePagination.vue";
import BaseUtilityToolbar from "@/components/base/BaseUtilityToolbar.vue";
import SkeletonLoader from "@/components/base/SkeletonLoader.vue";
import DecisionConfirmationModal from "@/components/base/DecisionConfirmationModal.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import DeleteConfirmModal from "@/components/base/DeleteConfirmModal.vue";
import ActionDropdownMenu from "@/components/base/ActionDropdownMenu.vue";
import LiquidationTable from "@/components/liquidations/LiquidationTable.vue";
import LiquidationReceiptModal from "@/components/liquidations/LiquidationReceiptModal.vue";
import LiquidationAdvancePicker from "@/components/liquidations/LiquidationAdvancePicker.vue";
import LiquidationReviewModal from "@/components/liquidations/LiquidationReviewModal.vue";
import LiquidationSettlementForm from "@/components/liquidations/LiquidationSettlementForm.vue";
import { useLiquidationDecisions } from "@/composables/liquidations/useLiquidationDecisions";
import { useLiquidationForwarding } from "@/composables/liquidations/useLiquidationForwarding";
import { useLiquidationSubmit } from "@/composables/liquidations/useLiquidationSubmit";
import { useOcrMode } from "@/composables/useOcrMode";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import { useNotificationDeepLink } from "@/composables/useNotificationDeepLink";
import { formatPeso, formatDate, truncateText } from "@/utils/formatters";
import { numberOrZero } from "@/utils/numbers";
import { getFileUrl } from "@/utils/fileUtils";
import { firstFilePathField } from "@/utils/receiptUtils";
import { apiFetch } from "@/utils/apiFetch";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Eye,
  FilePieChart,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-vue-next";

const store = useCashAdvanceStore();
const liqStore = useLiquidationStore();
const receiptStore = useReceiptStore();
const auth = useAuthStore();
const router = useRouter();
const { addToast } = useToast();
const { isMockOcr, setMockMode } = useOcrMode();

/** Refresh both stores in parallel — balance is now authoritative in the DB */
async function refreshAll() {
  await Promise.all([
    liqStore.fetchSettlements(),
    store.fetchAll(),
    receiptStore.fetchCategories(),
  ]);
}

const selectedAdvance = ref(null);
const receipts = ref([]);
const reportAttachment = ref(null);
const reportAttachmentInput = ref(null);
const { submitting, submitLiquidation: performSubmitLiquidation } =
  useLiquidationSubmit();
const submitted = ref(false);
const shortfallExplanation = ref("");
const settlementModalMode = ref("settle"); // "settle" | "view"
const settlementModalStep = ref("form"); // "select" | "form"
const canReturnToAdvanceList = ref(false);

function liquidationDraftSignature() {
  return JSON.stringify({
    receipts: receipts.value.map((r) => ({
      id: r.id ?? null,
      name: r.name ?? "",
      fileName: r.fileName ?? "",
      merchantName: r.merchantName ?? "",
      date: r.date ?? "",
      tin: r.tin ?? "",
      invoiceNumber: r.invoiceNumber ?? "",
      location: r.location ?? "",
      currency: r.currency ?? "",
      vatClassification: r.vatClassification ?? "",
      category: r.category ?? "",
      categoryId: r.categoryId ?? null,
      subtotal: r.subtotal ?? "",
      tax: r.tax ?? "",
      amount: r.amount ?? null,
      filePath: r.filePath ?? null,
      items: (r.items || []).map((item) => ({
        name: item.name ?? "",
        qty: item.qty ?? null,
        price: item.price ?? null,
      })),
    })),
    reportAttachment:
      reportAttachment.value && typeof reportAttachment.value === "object"
        ? reportAttachment.value.name ||
          reportAttachment.value.fileName ||
          "attached"
        : reportAttachment.value,
    shortfallExplanation: shortfallExplanation.value,
  });
}
const hydrationSignature = ref(liquidationDraftSignature());

const isDirty = computed(() => {
  // Do not blanket-force view mode clean: a hydrated baseline already keeps
  // untouched records clean while still catching real field edits.
  return liquidationDraftSignature() !== hydrationSignature.value;
});

const {
  showConfirmModal,
  handleConfirmLeave,
  handleCancelLeave,
  dismissWithConfirm,
} = useUnsavedChanges(isDirty, submitted);

const sortKey = ref("dateSubmitted");
const sortDirection = ref("desc");
const reviewingCase = ref(null);

const {
  approvingId,
  rejectingId,
  revisionAction,
  confirmPassword,
  rejectionComment,
  isReviewSubmitting,
  openApproveModal,
  openRejectModal,
  cancelApprove,
  cancelReject,
  confirmApprove,
  confirmReject,
} = useLiquidationDecisions(
  liqStore,
  addToast,
  reviewingCase,
  refreshAll,
  closeReview,
);

const reviewDrafts = ref({});
const confirmFinalizeOpen = ref(false);
const receiptDetailsOpen = ref(false);
const selectedReceipt = ref(null);
const pendingReceiptDecision = ref("");
const searchQuery = ref("");
const activeStatus = ref("All");
const pageSize = 10;
const currentPage = ref(1);
const employeeSearchQuery = ref("");
const employeeActiveStatus = ref("All");
const employeeSortKey = ref("date");
const employeeSortDirection = ref("desc");
const VALID_REPORT_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const VALID_REPORT_ATTACHMENT_EXTENSIONS = [".pdf", ".docx"];

const statusFilters = [
  "All",
  "Pending",
  "Under Review",
  "Approved",
  "Liquidated",
  "Incomplete",
  "Overpayment",
  "Rejected",
  "Overdue",
];
const employeeStatusFilters = [
  "All",
  "Pending",
  "Under Review",
  "Approved",
  "Disbursed",
  "Signed",
  "Incomplete",
  "Overpayment",
  "Liquidated",
  "Rejected",
  "Overdue",
];
const employeeLiquidationColumns = [
  { key: "purpose", label: "Purpose", sortKey: "purpose" },
  { key: "date", label: "Date Issued", sortKey: "date" },
  { key: "dueDate", label: "Due Date", sortKey: "dueDate" },
  { key: "amount", label: "Amount", align: "right", sortKey: "amount" },
  { key: "balance", label: "Balance", align: "right", sortKey: "balance" },
  { key: "status", label: "Status", align: "center", sortKey: "status" },
  { key: "actions", label: "Action", align: "center" },
];
const receiptCategoryOptions = computed(() => receiptStore.categories || []);

const defaultReceiptCategoryId = computed(() => {
  const categories = receiptCategoryOptions.value;
  if (categories.length === 0) return null;

  const preferredCategory = categories.find(
    (category) =>
      String(category.name || "")
        .trim()
        .toLowerCase() === "meals",
  );

  return Number(preferredCategory?.id ?? categories[0]?.id ?? null) || null;
});

const totalExpenseAmount = computed(() =>
  receipts.value.reduce(
    (sum, receipt) => sum + numberOrZero(receipt.ocrData?.amount),
    0,
  ),
);

const isReceiptOcrProcessing = computed(() =>
  receipts.value.some((r) => r.ocrStatus === "processing"),
);

const hasIncompleteReceiptFields = computed(() => {
  if (isReceiptOcrProcessing.value) return true;
  return receipts.value.some((receipt) => {
    // Block submit while OCR status is not done
    if (receipt.ocrStatus && receipt.ocrStatus !== "done") return true;
    const ocrData = receipt.ocrData || {};
    const amount = Number(ocrData.amount);

    return (
      !String(ocrData.vendor || "").trim() ||
      !String(ocrData.date || "").trim() ||
      !String(ocrData.tin || "").trim() ||
      !String(ocrData.invoiceNumber || "").trim() ||
      !receipt.categoryId ||
      !Number.isFinite(amount) ||
      amount <= 0
    );
  });
});

const agingInfo = computed(() => {
  if (!selectedAdvance.value) return null;
  return liqStore.calculateAging(selectedAdvance.value);
});

const variance = computed(() => {
  if (!selectedAdvance.value) return 0;
  const currentBalance = numberOrZero(
    selectedAdvance.value.balance ?? selectedAdvance.value.amount,
  );
  return currentBalance - totalExpenseAmount.value;
});

const liquidationOutstandingBalance = computed(() =>
  Math.max(variance.value, 0),
);
const liquidationStatus = computed(() => {
  if (!selectedAdvance.value) return "Incomplete";
  if (variance.value < 0) return "Overpayment";
  if (variance.value > 0) return "Incomplete";
  return "Liquidated";
});
const calculatedOutstandingBalance = computed(() => {
  const currentBalance = numberOrZero(selectedAdvance.value?.balance);
  return Math.max(totalExpenseAmount.value - currentBalance, 0);
});
const overpaymentAmount = computed(() =>
  Math.max(
    totalExpenseAmount.value - numberOrZero(selectedAdvance.value?.balance),
    0,
  ),
);

const { forwardOverpaymentToReimbursement } = useLiquidationForwarding(
  selectedAdvance,
  overpaymentAmount,
  receipts,
  defaultReceiptCategoryId,
);

const needsReportAttachmentReminder = computed(
  () =>
    selectedAdvance.value &&
    (liquidationStatus.value === "Incomplete" ||
      (overpaymentAmount.value > 0 && !reportAttachment.value)),
);

const currentUserId = computed(() =>
  auth.user?.id !== null && auth.user?.id !== undefined
    ? String(auth.user.id)
    : null,
);

function isOwnedByCurrentUser(item) {
  const ownerId = item?.userId ?? item?.user_id ?? item?.user?.id;
  return (
    currentUserId.value !== null &&
    ownerId !== null &&
    ownerId !== undefined &&
    String(ownerId) === currentUserId.value
  );
}

const employeeOutstandingAdvances = computed(() =>
  store.items.filter((item) => {
    const status = String(item.status || "").toLowerCase();
    const isEligibleAdvance =
      ["signed", "overdue", "incomplete"].includes(status) &&
      item.acknowledgedAt;

    if (!isEligibleAdvance) return false;
    if (!auth.isAdmin) return true;

    return isOwnedByCurrentUser(item);
  }),
);

const employeeFilteredAdvances = computed(() => {
  const query = employeeSearchQuery.value.trim().toLowerCase();
  const rows = store.items.filter((advance) => {
    const status = employeeAdvanceStatus(advance);
    const matchesStatus =
      employeeActiveStatus.value === "All" ||
      status === employeeActiveStatus.value;
    const matchesSearch =
      !query ||
      [
        advance.id,
        advance.purpose,
        advance.status,
        status,
        formatPeso(advance.amount || 0),
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );

    return matchesStatus && matchesSearch;
  });

  const direction = employeeSortDirection.value === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = employeeSortValue(a, employeeSortKey.value);
    const bValue = employeeSortValue(b, employeeSortKey.value);

    if (aValue === bValue) {
      const aTime = new Date(
        a.submitted_at ||
          a.submittedAt ||
          a.date ||
          a.created_at ||
          a.createdAt ||
          0,
      ).getTime();
      const bTime = new Date(
        b.submitted_at ||
          b.submittedAt ||
          b.date ||
          b.created_at ||
          b.createdAt ||
          0,
      ).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * direction;
    }

    return (
      String(aValue).localeCompare(String(bValue), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction
    );
  });
});

const employeePageSize = 10;
const employeeCurrentPage = ref(1);
const employeeTotalPages = computed(() =>
  Math.max(
    1,
    Math.ceil(employeeFilteredAdvances.value.length / employeePageSize),
  ),
);
const employeePaginatedAdvances = computed(() => {
  const start = (employeeCurrentPage.value - 1) * employeePageSize;
  return employeeFilteredAdvances.value.slice(start, start + employeePageSize);
});

watch([employeeSearchQuery, employeeActiveStatus], () => {
  employeeCurrentPage.value = 1;
});
watch(employeeTotalPages, (pages) => {
  if (employeeCurrentPage.value > pages) employeeCurrentPage.value = pages;
});

const tableColumns = [
  { key: "purpose", label: "Purpose" },
  { key: "requestorName", label: "Requestor Name" },
  { key: "dateSubmitted", label: "Date Submitted" },
  { key: "dueDate", label: "Due Date" },
  { key: "cashAdvanceAmount", label: "Cash Advance Amount", align: "right" },
  { key: "status", label: "Status", align: "center" },
  { key: "actions", sortKey: "databaseId", label: "Actions", align: "center" },
];

function categoryName(record, fallback = "Expense") {
  return (
    record?.category?.name ||
    record?.expense_category?.name ||
    record?.category ||
    fallback
  );
}

const mapBackendStatusToDisplayStatus = (backendStatus, row, acceptedTotal) => {
  if (backendStatus === "pending") return "Pending";
  if (backendStatus === "under-review" || backendStatus === "under review")
    return "Under Review";
  if (backendStatus === "approved") return "Approved";
  if (backendStatus === "liquidated") return "Liquidated";
  if (backendStatus === "rejected") return "Rejected";
  if (backendStatus === "incomplete") return "Incomplete";
  return calculateLiquidationStatus(row, acceptedTotal);
};

const sourceCases = computed(() => {
  const rows = liqStore.settlements.map((item) => {
    const mappedReceipts = (item.receipts || []).map((r, rIdx) => {
      const subtotal = Math.max(
        Number(r.total_amount || 0) - Number(r.vat_amount || 0),
        0,
      );
      const rawPath = firstFilePathField(r.file_path);
      const filePathStr =
        typeof rawPath === "string" ? rawPath : rawPath ? String(rawPath) : "";
      const fileName = filePathStr
        ? filePathStr.split("/").pop()
        : r.file_name || r.fileName || `receipt_${rIdx + 1}.jpg`;

      return {
        id: r.id,
        fileName,
        merchantName: r.vendor_name || "Unknown Vendor",
        location: r.location || "N/A",
        category: categoryName(r),
        categoryId:
          Number(r.expense_category_id ?? defaultReceiptCategoryId.value) ||
          null,
        invoiceNumber: r.invoice_number || "N/A",
        transactionDate: r.transaction_date || r.created_at,
        tinNumber: r.tin || "N/A",
        items: r.items || [],
        amount: Number(r.total_amount || 0),
        subtotal,
        vat: Number(r.vat_amount || 0),
        decision: r.status === "rejected" ? "rejected" : "accepted",
        notes: r.admin_notes || "",
        filePath: filePathStr || r.file_path,
      };
    });

    const statusContext = {
      cashAdvanceAmount: Number(item.cash_advance?.amount || 0),
      dueDate:
        item.cash_advance?.expected_liquidation_date ||
        item.cash_advance?.dueDate,
    };

    const displayStatus = mapBackendStatusToDisplayStatus(
      item.status,
      statusContext,
      Number(item.total_expense_amount || 0),
    );

    return {
      id: `LIQ-${String(item.id).padStart(3, "0")}`,
      databaseId: item.id,
      advanceId: `CA-${String(item.cash_advance_id).padStart(3, "0")}`,
      cashAdvanceId: item.cash_advance_id,
      purpose:
        item.purpose ||
        item.cash_advance?.purpose ||
        item.cashAdvance?.purpose ||
        "",
      requestorId:
        item.user?.id ??
        item.user_id ??
        item.cash_advance?.user_id ??
        item.cash_advance?.userId,
      requestorName: item.user?.name || item.cash_advance?.user?.name || "",
      dateOfAdvances:
        item.cash_advance?.date ||
        item.cash_advance?.created_at ||
        item.cash_advance?.disbursed_at ||
        item.cashAdvance?.date ||
        item.date_of_advances ||
        item.dateOfAdvances ||
        null,
      dueDate:
        item.cash_advance?.expected_liquidation_date ||
        item.cash_advance?.dueDate,
      cashAdvanceAmount: Number(item.cash_advance?.amount || 0),
      outstandingBalance: numberOrZero(
        item.outstanding_balance ?? item.cash_advance?.amount,
      ),
      receipts: mappedReceipts,
      submittedReceiptTotal: Number(item.total_expense_amount || 0),
      shortfallExplanation: item.shortfall_explanation || "",
      adminNote: item.admin_note || "",
      reportFilePath: item.report_file_path || null,
      status: displayStatus,
      createdAt: item.created_at || item.createdAt || null,
      submittedAt:
        item.submitted_at || item.submittedAt || item.created_at || null,
      dateSubmitted: item.submitted_at || item.created_at || item.date || null,
    };
  });

  return rows;
});

const liquidationRows = computed(() =>
  sourceCases.value.map((row) => {
    const draft = reviewDrafts.value[row.id];
    const acceptedTotal = draft
      ? acceptedReceiptTotal(row, draft.receipts)
      : row.submittedReceiptTotal;

    let status = row.status;
    if (
      status !== "Liquidated" &&
      status !== "Rejected" &&
      status !== "Pending"
    ) {
      status =
        draft?.finalizedStatus ||
        calculateLiquidationStatus(row, acceptedTotal);
    }

    // Outstanding balance reflects the snapshot balance of the cash advance
    // at the time the liquidation was submitted.
    const outstandingBalance = numberOrZero(row.outstandingBalance);

    return {
      ...row,
      acceptedTotal,
      outstandingBalance,
      status,
    };
  }),
);

const filteredRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return liquidationRows.value.filter((row) => {
    const matchesStatus =
      activeStatus.value === "All" || row.status === activeStatus.value;
    const matchesSearch =
      !query ||
      [
        row.advanceId,
        row.purpose,
        row.requestorName,
        row.dueDate,
        row.status,
        formatDate(row.dueDate),
        formatPeso(row.cashAdvanceAmount),
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );

    return matchesStatus && matchesSearch;
  });
});

const sortedRows = computed(() => {
  const rows = [...filteredRows.value];
  if (!sortKey.value) {
    return rows.sort((a, b) => {
      const aTime = new Date(
        a.dateSubmitted || a.createdAt || a.submittedAt || 0,
      ).getTime();
      const bTime = new Date(
        b.dateSubmitted || b.createdAt || b.submittedAt || 0,
      ).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return (Number(b.databaseId) || 0) - (Number(a.databaseId) || 0);
    });
  }

  return rows.sort((a, b) => {
    const aValue = getSortValue(a, sortKey.value);
    const bValue = getSortValue(b, sortKey.value);
    if (aValue === bValue) {
      const aTime = new Date(
        a.dateSubmitted || a.createdAt || a.submittedAt || 0,
      ).getTime();
      const bTime = new Date(
        b.dateSubmitted || b.createdAt || b.submittedAt || 0,
      ).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return (Number(b.databaseId) || 0) - (Number(a.databaseId) || 0);
    }
    const result = aValue > bValue ? 1 : -1;
    return sortDirection.value === "asc" ? result : -result;
  });
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(sortedRows.value.length / pageSize)),
);
const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return sortedRows.value.slice(start, start + pageSize);
});

watch([searchQuery, activeStatus], () => {
  currentPage.value = 1;
});

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages;
});

const activeDraft = computed(() =>
  reviewingCase.value ? reviewDrafts.value[reviewingCase.value.id] : null,
);

const reviewReceipts = computed(() => activeDraft.value?.receipts || []);

const acceptedReviewTotal = computed(() =>
  reviewingCase.value
    ? acceptedReceiptTotal(reviewingCase.value, reviewReceipts.value)
    : 0,
);

const reviewOutstandingBalance = computed(() =>
  reviewingCase.value
    ? Math.max(
        numberOrZero(reviewingCase.value.outstandingBalance) -
          numberOrZero(acceptedReviewTotal.value),
        0,
      )
    : 0,
);

const reviewStatus = computed(() =>
  reviewingCase.value
    ? reviewReceipts.value.some((receipt) => receipt.decision === "rejected")
      ? "Rejected"
      : calculateLiquidationStatus(
          reviewingCase.value,
          acceptedReviewTotal.value,
        )
    : "Incomplete",
);

watch(
  receipts,
  (items) => {
    items.forEach((item) => {
      if (!item.categoryId && defaultReceiptCategoryId.value) {
        item.categoryId = defaultReceiptCategoryId.value;
      }
    });
  },
  { deep: true },
);

const isReviewingOwnLiquidation = computed(() => {
  const currentUserId = auth.user?.id;
  const ownerId =
    reviewingCase.value?.requestorId ??
    reviewingCase.value?.userId ??
    reviewingCase.value?.user_id;

  return (
    currentUserId !== null &&
    currentUserId !== undefined &&
    ownerId !== null &&
    ownerId !== undefined &&
    String(currentUserId) === String(ownerId)
  );
});

const liquidationKpis = computed(() => {
  const rows = liquidationRows.value;
  const incomplete = rows.filter((item) => item.status === "Incomplete").length;
  const liquidated = rows.filter((item) => item.status === "Liquidated").length;
  const outstanding = rows.reduce(
    (sum, item) => sum + numberOrZero(item.outstandingBalance),
    0,
  );

  return [
    {
      label: "Total Reports",
      value: rows.length,
      sub: "Liquidation cases",
      icon: FilePieChart,
      iconBg: "bg-accent/10",
      iconColor: "text-accent",
      accent: "bg-accent",
    },
    {
      label: "Incomplete",
      value: incomplete,
      sub: "Pending clearance",
      icon: AlertTriangle,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
      accent: "bg-amber-500",
    },
    {
      label: "Liquidated",
      value: liquidated,
      sub: "Settled advances",
      icon: CheckCircle,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      accent: "bg-emerald-500",
    },
    {
      label: "Outstanding Balance",
      value: formatPeso(outstanding),
      sub: "Open balances",
      icon: Wallet,
      iconBg: "bg-blue-900/10",
      iconColor: "text-blue-900",
      accent: "bg-blue-900",
    },
  ];
});

const employeeLiquidationKpis = computed(() => {
  const rows = employeeOutstandingAdvances.value;
  const overdue = rows.filter(
    (item) => employeeAdvanceStatus(item) === "Overdue",
  ).length;
  const readyForLiquidation = rows.filter((item) =>
    ["Approved", "Signed"].includes(employeeAdvanceStatus(item)),
  ).length;
  const outstanding = rows.reduce(
    (sum, item) => sum + numberOrZero(item.balance),
    0,
  );

  const activeAdvances = store.items.filter((item) =>
    ["pending", "approved", "disbursed", "signed"].includes(item.status),
  ).length;

  return [
    {
      label: "Active Advances",
      value: activeAdvances,
      sub: "To reconcile",
      icon: Activity,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-500",
      accent: "bg-amber-500",
    },
    {
      label: "Ready to Liquidate",
      value: readyForLiquidation,
      sub: "Available reports",
      icon: CheckCircle,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
      accent: "bg-emerald-500",
    },
    {
      label: "Overdue",
      value: overdue,
      sub: "Past due window",
      icon: AlertTriangle,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-500",
      accent: "bg-red-500",
    },
    {
      label: "Outstanding Balance",
      value: formatPeso(outstanding),
      sub: "Open amount",
      icon: Wallet,
      iconBg: "bg-blue-900/10",
      iconColor: "text-blue-900",
      accent: "bg-blue-900",
    },
  ];
});

function employeeAdvanceStatus(advance) {
  const linkedLiquidation = liqStore.settlements.find(
    (settlement) => settlement.cash_advance_id === advance.id,
  );
  const linkedLiquidationStatus = String(
    linkedLiquidation?.status || "",
  ).toLowerCase();

  if (linkedLiquidationStatus === "rejected") return "Rejected";
  if (
    linkedLiquidationStatus === "pending" ||
    linkedLiquidationStatus === "under-review"
  )
    return "Under Review";
  if (linkedLiquidationStatus === "liquidated") return "Liquidated";
  if (linkedLiquidationStatus === "approved") return "Approved";

  if (liqStore.calculateAging(advance).isOverdue) return "Overdue";
  const status = String(advance.status || "pending").toLowerCase();
  if (status === "approved") return "Approved";
  if (status === "disbursed") return "Disbursed";
  if (status === "signed") return "Signed";
  if (status === "incomplete") return "Incomplete";
  if (status === "pending") return "Pending";
  if (status === "under-review") return "Under Review";
  if (status === "liquidated") return "Liquidated";
  if (status === "rejected") return "Rejected";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function employeeAdvanceBadgeStatus(advance) {
  const derivedStatus = employeeAdvanceStatus(advance);
  return derivedStatus === "Overdue"
    ? "overdue"
    : derivedStatus.toLowerCase().replace(/\s+/g, "-");
}

const modalAdvanceStatus = computed(() => {
  if (!selectedAdvance.value) return "";
  return employeeAdvanceBadgeStatus(selectedAdvance.value);
});

const isModalAdvanceOverdue = computed(() => {
  if (!selectedAdvance.value) return false;
  if (modalAdvanceStatus.value === "overdue") return true;
  if (liqStore.calculateAging(selectedAdvance.value)?.isOverdue) return true;
  const due =
    selectedAdvance.value.dueDate ||
    selectedAdvance.value.expected_liquidation_date;
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return d < today;
});

function employeeSortValue(advance, key) {
  if (key === "amount") return numberOrZero(advance.amount);
  if (key === "balance") return numberOrZero(advance.balance);
  if (key === "purpose") return String(advance.purpose || "").toLowerCase();
  if (key === "dueDate") {
    const timestamp = new Date(
      advance.dueDate || advance.expected_liquidation_date || 0,
    ).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  if (key === "date") {
    const timestamp = new Date(
      advance.submitted_at ||
        advance.submittedAt ||
        advance.date ||
        advance.created_at ||
        advance.createdAt ||
        advance.dueDate ||
        0,
    ).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  return employeeAdvanceStatus(advance);
}

function employeeToggleSort(column) {
  const key = column.sortKey || column.key;
  if (key === "actions") return;
  if (employeeSortKey.value === key) {
    employeeSortDirection.value =
      employeeSortDirection.value === "asc" ? "desc" : "asc";
  } else {
    employeeSortKey.value = key;
    employeeSortDirection.value = ["date", "dueDate"].includes(key)
      ? "desc"
      : "asc";
  }
  employeeCurrentPage.value = 1;
}

const isSettlementModalOpen = ref(false);

function openSettlementModal(row = null, mode = "settle") {
  settlementModalStep.value = "form";
  canReturnToAdvanceList.value = false;
  settlementModalMode.value = mode;
  if (row && String(row.id) === String(selectedAdvance.value?.id)) {
    isSettlementModalOpen.value = true;
    return;
  }
  const show = () => {
    if (row) selectAdvance(row);
    settlementModalMode.value = mode;
    isSettlementModalOpen.value = true;
  };
  if (row) {
    dismissWithConfirm(show);
  } else if (selectedAdvance.value) {
    isSettlementModalOpen.value = true;
  }
}

function closeSettlementModal() {
  if (settlementModalMode.value === "view") {
    isSettlementModalOpen.value = false;
    settlementModalMode.value = "settle";
    settlementModalStep.value = "form";
    canReturnToAdvanceList.value = false;
    resetLiquidationComposer();
    return;
  }

  dismissWithConfirm(async () => {
    await abortLiquidationDraftReceipts();
    isSettlementModalOpen.value = false;
    settlementModalMode.value = "settle";
    settlementModalStep.value = "form";
    canReturnToAdvanceList.value = false;
    resetLiquidationComposer();
  });
}

function handleReloadConsole() {
  isSettlementModalOpen.value = false;
  settlementModalMode.value = "settle";
  settlementModalStep.value = "form";
  canReturnToAdvanceList.value = false;
  resetLiquidationComposer();
}

function handleNewLiquidation() {
  openLiquidationRequest();
}

function findLiquidationForAdvance(advance) {
  if (!advance) return null;
  return (
    liqStore.settlements.find(
      (settlement) =>
        String(settlement.cash_advance_id ?? settlement.cashAdvanceId) ===
        String(advance.id),
    ) || null
  );
}

function employeeAdvanceActions(row) {
  const settlement = findLiquidationForAdvance(row);

  return [
    {
      label: "Settle",
      icon: Wallet,
      disabled: String(selectedAdvance.value?.id) === String(row.id),
      handler: () => openSettlementModal(row, "settle"),
    },
    {
      label: "View",
      icon: Eye,
      handler: () => openSettlementModal(row, "view"),
    },
    {
      label: "Delete",
      icon: Trash2,
      variant: "danger",
      visible:
        !!settlement &&
        String(settlement.status || "").toLowerCase() === "pending",
      handler: () => {
        deletingLiqId.value = settlement.id;
        isDeleteLiqModalOpen.value = true;
      },
    },
  ];
}

const selectedAdvanceAcknowledged = computed(() => {
  const adv = selectedAdvance.value;
  if (!adv) return false;
  if (adv.acknowledgedAt || adv.acknowledged_at) return true;
  if (adv.signature || adv.signatureImage) return true;
  return (
    String(adv.status || "")
      .toLowerCase()
      .trim() === "signed"
  );
});

const selectedAdvanceIsPhase2 = computed(() => {
  if (existingLiquidation.value) return true;
  const status = String(selectedAdvance.value?.status || "")
    .toLowerCase()
    .trim()
    .replace(/[\s/_-]+/g, "-");
  return [
    "signed",
    "under-review",
    "pending-under-review",
    "incomplete",
    "overdue",
    "liquidated",
    "settled",
  ].includes(status);
});

const selectedAdvanceCanLiquidate = computed(() => {
  if (!selectedAdvance.value) return false;
  // Revise stays editable — already in Phase 2
  if (
    String(existingLiquidation.value?.status || "").toLowerCase() === "revise"
  )
    return true;
  return selectedAdvanceAcknowledged.value || selectedAdvanceIsPhase2.value;
});

const showSubmitConfirmModal = ref(false);

function promptSubmitLiquidation() {
  if (settlementModalMode.value === "view") return;
  // Preview-only until acknowledged / Phase 2 — block submit with feedback
  if (!selectedAdvanceCanLiquidate.value) {
    addToast({
      title: "Acknowledgement Required",
      message:
        "Please acknowledge the cash advance (sign) before submitting a liquidation. Preview only until Phase 2.",
      type: "danger",
    });
    return;
  }
  showSubmitConfirmModal.value = true;
}

function handleConfirmSubmit() {
  showSubmitConfirmModal.value = false;
  submitLiquidation();
}

function handleCancelSubmit() {
  showSubmitConfirmModal.value = false;
}

async function submitLiquidation() {
  // Preview-only until acknowledged / Phase 2 — block submit with feedback
  if (!selectedAdvanceCanLiquidate.value) {
    addToast({
      title: "Acknowledgement Required",
      message:
        "Please acknowledge the cash advance (sign) before submitting a liquidation. Preview only until Phase 2.",
      type: "danger",
    });
    return;
  }
  const isEditing = !!existingLiquidation.value;
  const success = await performSubmitLiquidation({
    receipts: receipts.value,
    selectedAdvance: selectedAdvance.value,
    reportAttachment: reportAttachment.value,
    totalExpenses: totalExpenseAmount.value,
    variance: variance.value,
    shortfallExplanation: shortfallExplanation.value,
    existingLiquidation: existingLiquidation.value,
  });

  if (success) {
    submitted.value = true;
    addToast({
      message: isEditing
        ? "Liquidation settlement updated successfully!"
        : "Liquidation settlement submitted successfully!",
      type: "success",
    });
  }
}

const existingLiquidation = computed(() => {
  if (!selectedAdvance.value) return null;
  return findLiquidationForAdvance(selectedAdvance.value);
});

const isDeleteLiqModalOpen = ref(false);
const deletingLiqId = ref(null);

function handleDeleteLiquidation() {
  if (!existingLiquidation.value) return;
  deletingLiqId.value = existingLiquidation.value.id;
  isDeleteLiqModalOpen.value = true;
}

async function confirmDeleteLiquidation(password) {
  if (!deletingLiqId.value) return;
  try {
    submitting.value = true;
    await liqStore.deleteSettlement(deletingLiqId.value, password);
    addToast({
      title: "Deleted",
      message: "Liquidation settlement deleted successfully.",
      type: "success",
    });
    isDeleteLiqModalOpen.value = false;
    deletingLiqId.value = null;
    isSettlementModalOpen.value = false;
    resetLiquidationComposer();
    await refreshAll();
  } catch (error) {
    addToast({
      title: "Failed",
      message: error.message || "Failed to delete liquidation.",
      type: "danger",
    });
  } finally {
    submitting.value = false;
  }
}

function getActions(row) {
  const status = String(row.status || "").toLowerCase();
  const isRevise = status === "revise";
  const isRejected = status === "rejected";
  return [
    {
      label: "Edit",
      icon: Pencil,
      visible: !auth.isAdmin && (status === "pending" || isRevise),
      handler: () => handleEditLiquidation(row),
    },
    {
      label: "View",
      icon: Eye,
      visible: true,
      handler: () => openReview(row),
    },
    {
      label: "Delete",
      icon: Trash2,
      visible: !auth.isAdmin && status === "pending",
      variant: "danger",
      handler: () => handleDeleteLiquidationForRow(row),
    },
  ];
}

function handleEditLiquidation(row) {
  // Locate the parent cash advance for this liquidation and open the settlement form in edit mode
  const advId = row.cash_advance_id ?? row.cashAdvanceId;
  const adv = store.items.find((a) => String(a.id) === String(advId));
  if (adv) {
    selectAdvance(adv);
  } else {
    // Fallback: fabricate minimal advance so form can still load existing liquidation
    selectAdvance({
      id: advId,
      amount: row.cashAdvanceAmount,
      outstanding_balance: row.outstandingBalance,
    });
  }
  // Scroll to settlement form for immediate editing
  setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
}

function handleDeleteLiquidationForRow(row) {
  deletingLiqId.value = row.id;
  isDeleteLiqModalOpen.value = true;
}

function selectAdvance(adv) {
  dismissWithConfirm(() => {
    selectedAdvance.value = adv;
    submitted.value = false;

    // Find if there is an existing liquidation in liqStore.settlements
    const existingLiq = findLiquidationForAdvance(adv);

    if (existingLiq) {
      shortfallExplanation.value = existingLiq.shortfall_explanation || "";
      // If it's a string filepath from backend, reportAttachment can be set to it
      reportAttachment.value = existingLiq.report_file_path;

      if (existingLiq.receipts && Array.isArray(existingLiq.receipts)) {
        receipts.value = existingLiq.receipts.map((r) => {
          const rawPath = firstFilePathField(r.file_path);
          const rawStr =
            typeof rawPath === "string"
              ? rawPath
              : rawPath
                ? String(rawPath)
                : "";
          const vatClass = r.vat_classification || "vat";
          const subtotal = Math.max(
            Number(r.total_amount || 0) - Number(r.vat_amount || 0),
            0,
          );
          return {
            id: r.id,
            name:
              r.vendor_name ||
              (rawStr ? rawStr.split("/").pop() : `Receipt-${r.id}`),
            fileName:
              r.vendor_name ||
              (rawStr ? rawStr.split("/").pop() : `Receipt-${r.id}`),
            ocrStatus: "done",
            category: categoryName(r, "General"),
            categoryId:
              Number(r.expense_category_id ?? defaultReceiptCategoryId.value) ||
              null,
            merchantName: r.vendor_name || "",
            date: r.transaction_date,
            tin: r.tin || "",
            invoiceNumber: r.invoice_number || "",
            location: r.location || "",
            currency: r.currency || "PHP",
            vatClassification: vatClass,
            subtotal: subtotal.toFixed(2),
            tax: Number(r.vat_amount || 0).toFixed(2),
            amount: Number(r.total_amount || 0),
            items:
              Array.isArray(r.items) && r.items.length > 0
                ? r.items.map((item) => ({
                    name: item.name || "",
                    qty: Number(item.qty || 1),
                    price: Number(item.price || 0),
                  }))
                : [],
            filePath: rawStr || r.file_path,
            thumbnail: rawStr ? getFileUrl(rawStr) : null,
            ocrData: {
              id: r.id,
              vendor: r.vendor_name,
              date: r.transaction_date,
              amount: r.total_amount,
              vat: r.vat_amount || 0,
              tin: r.tin,
              invoiceNumber: r.invoice_number,
              location: r.location || "",
              file_path: r.file_path,
            },
          };
        });
      } else {
        receipts.value = [];
      }
    } else {
      receipts.value = [];
      reportAttachment.value = null;
      shortfallExplanation.value = "";
    }

    hydrationSignature.value = liquidationDraftSignature();
  });
}

async function abortLiquidationDraftReceipts() {
  if (submitted.value) return;
  const existingIds = new Set(
    (existingLiquidation.value?.receipts || []).map((r) => r.id)
  );
  const draftsToDelete = receipts.value.filter(
    (r) => r.id && !existingIds.has(r.id) && !String(r.id).startsWith("temp-")
  );

  if (draftsToDelete.length === 0) return;

  await Promise.allSettled(
    draftsToDelete.map(async (r) => {
      try {
        await apiFetch(`/api/serms/reimbursements/receipts/${r.id}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error(`Failed to delete liquidation receipt draft ${r.id}:`, err);
      }
    })
  );
}

async function onConfirmLeaveModal() {
  await abortLiquidationDraftReceipts();
  handleConfirmLeave();
}

function resetLiquidationComposer() {
  selectedAdvance.value = null;
  receipts.value = [];
  reportAttachment.value = null;
  shortfallExplanation.value = "";
  submitted.value = false;
  hydrationSignature.value = liquidationDraftSignature();
}

function openLiquidationRequest() {
  const eligible = employeeOutstandingAdvances.value;
  if (eligible.length === 0) {
    addToast({
      title: "No Eligible Advance",
      message: "You have no cash advance available to liquidate yet.",
      type: "info",
    });
    return;
  }

  resetLiquidationComposer();
  settlementModalMode.value = "settle";
  settlementModalStep.value = "select";
  canReturnToAdvanceList.value = true;
  isSettlementModalOpen.value = true;
}

function chooseAdvanceForLiquidation(advance) {
  // The picker is only reachable from a reset composer, so it is safe to
  // select directly without another unsaved-changes prompt.
  selectAdvance(advance);
  settlementModalMode.value = "settle";
  settlementModalStep.value = "form";
  isSettlementModalOpen.value = true;
}

function backToAdvanceSelection() {
  dismissWithConfirm(async () => {
    await abortLiquidationDraftReceipts();
    resetLiquidationComposer();
    settlementModalMode.value = "settle";
    settlementModalStep.value = "select";
  });
}

function isValidReportAttachment(file) {
  if (!file) return false;

  const normalizedName = String(file.name || "").toLowerCase();
  const isValidImage = String(file.type || "").startsWith("image/");
  const hasValidMimeType = VALID_REPORT_ATTACHMENT_MIME_TYPES.includes(
    file.type,
  );
  const hasValidExtension = VALID_REPORT_ATTACHMENT_EXTENSIONS.some((ext) =>
    normalizedName.endsWith(ext),
  );

  if (isValidImage || hasValidMimeType || hasValidExtension) {
    return true;
  }

  addToast({
    message:
      "Invalid file type. Only image files, PDF, and DOCX are allowed for the report attachment.",
    type: "error",
  });
  return false;
}

function selectReportAttachment(event) {
  const file = event.target.files?.[0];
  if (file && isValidReportAttachment(file)) reportAttachment.value = file;
  event.target.value = "";
}

function clearReportAttachment() {
  reportAttachment.value = null;
}

function acceptedReceiptTotal(row, receipts) {
  return receipts.reduce((sum, receipt) => {
    if (receipt.decision !== "accepted") return sum;
    return sum + Number(receipt.amount || 0);
  }, 0);
}

function calculateLiquidationStatus(row, acceptedTotal) {
  const outstanding = Math.max(row.cashAdvanceAmount - acceptedTotal, 0);
  if (acceptedTotal > row.cashAdvanceAmount) return "Overpayment";
  if (outstanding === 0) return "Liquidated";
  if (isPastDue(row.dueDate)) return "Overdue";
  return "Incomplete";
}

function isPastDue(value) {
  if (!value) return false;
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function toggleSort(column) {
  const key = column.sortKey || column.key;
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    currentPage.value = 1;
    return;
  }
  sortKey.value = key;
  sortDirection.value = [
    "dateSubmitted",
    "dueDate",
    "databaseId",
    "id",
    "actions",
  ].includes(key)
    ? "desc"
    : "asc";
  currentPage.value = 1;
}

function getSortValue(row, key) {
  if (["cashAdvanceAmount", "outstandingBalance"].includes(key))
    return Number(row[key] || 0);
  if (["dueDate"].includes(key)) {
    const timestamp = new Date(row[key] || 0).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
  if (["dateSubmitted", "createdAt", "submittedAt", "date"].includes(key)) {
    const raw =
      row.dateSubmitted || row.createdAt || row.submittedAt || row.dueDate || 0;
    const timestamp = new Date(raw).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
  if (["id", "databaseId", "actions"].includes(key)) {
    return Number(
      row.databaseId || String(row.id || "").replace(/\D/g, "") || 0,
    );
  }
  return String(row[key] || "").toLowerCase();
}

function openReview(row) {
  if (!reviewDrafts.value[row.id]) {
    reviewDrafts.value[row.id] = {
      receipts: row.receipts.map((receipt) => ({
        ...receipt,
        decision: receipt.decision || "accepted",
        notes: receipt.notes || "",
        detailsOpen: false,
      })),
      finalizedStatus: "",
    };
  }

  reviewingCase.value = row;
  confirmFinalizeOpen.value = false;
  receiptDetailsOpen.value = false;
  selectedReceipt.value = null;
  pendingReceiptDecision.value = "";
}

function closeReview() {
  reviewingCase.value = null;
  confirmFinalizeOpen.value = false;
  receiptDetailsOpen.value = false;
  selectedReceipt.value = null;
  pendingReceiptDecision.value = "";
}

function viewReceiptDetails(receipt) {
  selectedReceipt.value = receipt;
  pendingReceiptDecision.value = "";
  receiptDetailsOpen.value = true;
}

function closeReceiptDetails() {
  receiptDetailsOpen.value = false;
  selectedReceipt.value = null;
  pendingReceiptDecision.value = "";
}

function setReceiptDecision(receiptId, decision) {
  const receipt = reviewReceipts.value.find((item) => item.id === receiptId);
  if (receipt) receipt.decision = decision;
}

function requestReceiptDecision(decision) {
  if (isReviewingOwnLiquidation.value) {
    addToast({
      title: "Action Not Allowed",
      message:
        "You cannot process receipts from your own liquidation settlement.",
      type: "danger",
    });
    return;
  }

  pendingReceiptDecision.value = decision;
}

function cancelReceiptDecision() {
  pendingReceiptDecision.value = "";
}

function confirmReceiptDecision() {
  if (!selectedReceipt.value || !pendingReceiptDecision.value) return;
  setReceiptDecision(selectedReceipt.value.id, pendingReceiptDecision.value);
  if (pendingReceiptDecision.value === "rejected") {
    pendingReceiptDecision.value = "";
    receiptDetailsOpen.value = false;
    addToast({
      title: "Settlement Rejection Required",
      message:
        "Rejecting a receipt also rejects the entire liquidation settlement.",
      type: "danger",
    });
    openRejectModal();
    return;
  }
  pendingReceiptDecision.value = "";
}

function handleReceiptUploadError(payload) {
  addToast({
    title: "Upload Failed",
    message:
      payload?.message || "One or more receipt files could not be uploaded.",
    type: "danger",
  });
}

function finalizeLiquidation() {
  if (!reviewingCase.value || !activeDraft.value) return;
  activeDraft.value.finalizedStatus = reviewStatus.value;
  confirmFinalizeOpen.value = false;
  closeReview();
}

const { checkDeepLink: checkLiquidationDeepLink } = useNotificationDeepLink({
  verifyUrl: (id) => `/api/serms/liquidations/${id}`,
  onOpenRecord: (record) => {
    if (auth.isAdmin) {
      const row = sourceCases.value.find(
        (r) => String(r.databaseId) === String(record.id),
      );
      if (row) openReview(row);
    } else {
      const adv = store.items.find(
        (a) => String(a.id) === String(record.cash_advance_id),
      );
      if (adv) openSettlementModal(adv, "view");
    }
  },
});

const { checkDeepLink: checkAdvanceDeepLink } = useNotificationDeepLink({
  queryKey: "advance",
  verifyUrl: (id) => `/api/serms/cash-advances/${id}`,
  onOpenRecord: (record) => {
    const adv = store.items.find((a) => String(a.id) === String(record.id)) || record;
    openSettlementModal(adv, "view");
  },
});

onMounted(async () => {
  await refreshAll();
  checkLiquidationDeepLink();
  checkAdvanceDeepLink();
});
</script>

<template>
  <div class="flex flex-col w-full gap-6 mx-auto font-sans max-w-7xl">
    <section
      class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
    >
      <div class="min-w-0">
        <h1
          class="text-2xl font-bold leading-tight font-heading text-slate-800"
        >
          {{
            auth.isAdmin
              ? "Liquidation Console"
              : "Liquidation"
          }}
        </h1>
        <p class="mt-1 text-sm text-slate-400">
          {{
            auth.isAdmin
              ? "Review and manage employee liquidation settlements"
              : "Settle outstanding cash advance balances"
          }}
        </p>
      </div>
    </section>

    <BaseKpiGrid
      v-if="auth.isAdmin"
      :kpis="liquidationKpis"
      gridClasses="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      :isLoading="store.isLoading"
      :skeletonCount="4"
    />

    <div
      class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
    >
      <div class="min-w-0 flex-1">
        <BaseUtilityToolbar
          v-if="auth.isAdmin"
          v-model:search="searchQuery"
          v-model:status-value="activeStatus"
          :statuses="statusFilters"
          searchPlaceholder="Search employee, status, or amount..."
        />
      </div>
      <div v-if="auth.isAdmin" class="flex w-full justify-end lg:w-auto">
        <BaseButton
          id="admin-new-liquidation-request-btn"
          variant="primary"
          class="min-h-[42px] px-5 w-full sm:w-fit font-bold whitespace-nowrap"
          type="button"
          @click="openLiquidationRequest"
        >
          <Upload class="w-4 h-4" />
          New Request
        </BaseButton>
      </div>
    </div>

    <section
      v-if="auth.isAdmin"
      class="overflow-hidden bg-white border shadow-sm rounded-xl border-slate-200"
    >
      <div
        class="flex flex-col gap-1 px-5 py-4 bg-white border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between"
      >
        <h2 class="text-sm font-semibold text-slate-700">
          Liquidation Reports
        </h2>
        <span class="text-xs text-slate-400">
          <template v-if="store.isLoading">Loading...</template>
          <template v-else>{{ sortedRows.length }} reports</template>
        </span>
      </div>

      <LiquidationTable
        :columns="tableColumns"
        :rows="paginatedRows"
        :is-loading="store.isLoading"
        :page-size="pageSize"
        :sort-key="sortKey"
        :sort-direction="sortDirection"
        @sort="toggleSort"
      >
        <template #cell-purpose="{ row }">
          <div class="max-w-[18ch]">
            <span
              class="block truncate text-sm font-medium text-slate-800"
              :title="row.purpose"
            >
              {{ truncateText(row.purpose, 18) }}
            </span>
          </div>
        </template>
        <template #cell-requestorName="{ row }">
          <span class="text-sm font-semibold text-slate-700">{{
            row.requestorName
          }}</span>
        </template>
        <template #cell-dateSubmitted="{ row }">
          <span class="text-sm text-slate-500">{{
            formatDate(row.dateSubmitted || row.createdAt)
          }}</span>
        </template>
        <template #cell-dueDate="{ row }">
          <span class="text-sm text-slate-500">{{
            formatDate(row.dueDate)
          }}</span>
        </template>
        <template #cell-cashAdvanceAmount="{ row }">
          <span class="text-sm font-bold text-primary">{{
            formatPeso(row.cashAdvanceAmount)
          }}</span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :status="row.status" />
        </template>
        <template #cell-actions="{ row }">
          <ActionDropdownMenu :actions="getActions(row)" />
        </template>
      </LiquidationTable>
      <BasePagination
        v-if="!store.isLoading && sortedRows.length > pageSize"
        v-model:page="currentPage"
        :page-size="pageSize"
        :total="sortedRows.length"
        label="reports"
      />
    </section>

    <LiquidationReviewModal
      :is-open="!!(auth.isAdmin && reviewingCase)"
      :reviewing-case="reviewingCase"
      :review-status="reviewStatus"
      :review-outstanding-balance="reviewOutstandingBalance"
      :review-receipts="reviewReceipts"
      :accepted-review-total="acceptedReviewTotal"
      :is-reviewing-own-liquidation="isReviewingOwnLiquidation"
      :get-file-url="getFileUrl"
      :format-date-only="formatDate"
      @close="closeReview"
      @view-receipt="viewReceiptDetails"
      @reject="(action) => openRejectModal(action || 'revise')"
      @approve="openApproveModal"
    />

    <LiquidationReceiptModal
      :is-open="!!(reviewingCase && receiptDetailsOpen && selectedReceipt)"
      :receipt="selectedReceipt"
      :pending-decision="pendingReceiptDecision"
      :is-reviewing-own-liquidation="isReviewingOwnLiquidation"
      :get-file-url="getFileUrl"
      @close="closeReceiptDetails"
      @close-review="closeReview"
      @request-decision="requestReceiptDecision"
      @cancel-decision="cancelReceiptDecision"
      @confirm-decision="confirmReceiptDecision"
    />

    <!-- Audit Confirmation Modal -->
    <DecisionConfirmationModal
      v-if="auth.isAdmin"
      :is-open="!!approvingId || !!rejectingId"
      :mode="approvingId ? 'approve' : revisionAction || 'revise'"
      :is-submitting="isReviewSubmitting"
      :min-comment-length="10"
      title="Liquidation Settlement Audit"
      :description="
        approvingId
          ? 'Are you sure you want to approve this liquidation settlement? This will mark the cash advance as settled.'
          : revisionAction === 'revise'
            ? 'Please provide instructions to request revision of this liquidation settlement.'
            : 'Please provide a comment to authorize rejecting this liquidation settlement.'
      "
      v-model:password="confirmPassword"
      v-model:comment="rejectionComment"
      @close="approvingId ? cancelApprove() : cancelReject()"
      @confirm="approvingId ? confirmApprove() : confirmReject()"
    />
    <BaseKpiGrid
      v-if="!auth.isAdmin"
      :kpis="employeeLiquidationKpis"
      gridClasses="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      :isLoading="store.isLoading"
      :skeletonCount="4"
    />

    <BaseUtilityToolbar
      v-if="!auth.isAdmin"
      v-model:search="employeeSearchQuery"
      v-model:status-value="employeeActiveStatus"
      :statuses="employeeStatusFilters"
      searchPlaceholder="Search purpose, status, or amount..."
    >
      <template #actions>
        <BaseButton
          id="new-liquidation-btn"
          variant="primary"
          class="min-h-[42px] px-5 w-full sm:w-fit font-bold whitespace-nowrap"
          type="button"
          @click="handleNewLiquidation"
        >
          <Plus class="w-4 h-4" /> New Liquidation
        </BaseButton>
      </template>
    </BaseUtilityToolbar>

    <div
      v-if="!auth.isAdmin"
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <BaseToggleSwitch
        :model-value="isMockOcr"
        @update:model-value="setMockMode"
        hint="Mock uploads file, fills instantly, skips OCR wait"
      />
      <p class="text-[11px] text-slate-400">
        {{
          isMockOcr
            ? "Fast — real file upload, instant mock data."
            : "Online — uses ocr-pipeline with polling."
        }}
      </p>
    </div>

    <section
      v-if="!auth.isAdmin"
      class="overflow-hidden bg-white border shadow-sm rounded-xl border-slate-200"
    >
      <div
        class="flex flex-col gap-1 px-5 py-4 bg-white border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between"
      >
        <h2 class="text-sm font-semibold text-slate-700">Cash Advances</h2>
        <span class="text-xs text-slate-400">
          <template v-if="store.isLoading">Loading...</template>
          <template v-else
            >{{ employeeFilteredAdvances.length }} advances</template
          >
        </span>
      </div>

      <LiquidationTable
        :columns="employeeLiquidationColumns"
        :rows="employeePaginatedAdvances"
        :is-loading="store.isLoading"
        :page-size="employeePageSize"
        :sort-key="employeeSortKey"
        :sort-direction="employeeSortDirection"
        @sort="employeeToggleSort"
      >
        <template #cell-purpose="{ row }">
          <div class="max-w-[18ch]">
            <span
              class="block truncate text-sm font-medium text-slate-800"
              :title="row.purpose"
            >
              {{ truncateText(row.purpose, 18) }}
            </span>
          </div>
        </template>
        <template #cell-date="{ row }">
          <span class="text-sm text-slate-500">{{ formatDate(row.date) }}</span>
        </template>
        <template #cell-dueDate="{ row }">
          <span
            class="text-sm"
            :class="
              liqStore.calculateAging(row).isOverdue
                ? 'font-medium text-danger'
                : 'text-slate-500'
            "
          >
            {{ formatDate(row.dueDate) }}
          </span>
        </template>
        <template #cell-amount="{ row }">
          <span class="text-sm font-semibold text-slate-700">{{
            formatPeso(row.amount || 0)
          }}</span>
        </template>
        <template #cell-balance="{ row }">
          <span class="text-sm font-bold text-primary">{{
            formatPeso(row.balance || 0)
          }}</span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :status="employeeAdvanceBadgeStatus(row)" />
        </template>
        <template #cell-actions="{ row }">
          <ActionDropdownMenu :actions="employeeAdvanceActions(row)" />
        </template>
      </LiquidationTable>

      <BasePagination
        v-if="
          !store.isLoading && employeeFilteredAdvances.length > employeePageSize
        "
        v-model:page="employeeCurrentPage"
        :page-size="employeePageSize"
        :total="employeeFilteredAdvances.length"
        label="advances"
      />
    </section>

    <BaseModal
      :is-open="isSettlementModalOpen"
      max-width-class="max-w-4xl"
      :title="
        settlementModalStep === 'select'
          ? auth.isAdmin
            ? 'New Liquidation Request'
            : 'New Liquidation'
          : auth.isAdmin
            ? 'New Liquidation Request'
            : 'Liquidation Request'
      "
      :description="
        settlementModalStep === 'select'
          ? 'Choose a cash advance to liquidate.'
          : auth.isAdmin
            ? 'Complete the liquidation form for the selected cash advance.'
            : 'View or settle a cash advance liquidation.'
      "
      @close="closeSettlementModal"
    >
      <div class="flex max-h-[90vh] flex-col">
        <div
          class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"
        >
          <div class="flex min-w-0 items-start gap-2">
            <button
              v-if="
                settlementModalStep === 'form' && canReturnToAdvanceList
              "
              id="back-to-advance-selection"
              type="button"
              aria-label="Back to cash advances"
              title="Back to cash advances"
              class="-ml-1 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              @click="backToAdvanceSelection"
            >
              <ArrowLeft class="h-4 w-4" />
            </button>
            <div class="min-w-0">
              <h2 class="text-base font-bold font-heading text-slate-800">
                {{
                  settlementModalStep === "select"
                    ? auth.isAdmin
                      ? "New Liquidation Request"
                      : "New Liquidation"
                    : auth.isAdmin
                      ? "New Liquidation Request"
                      : settlementModalMode === "view"
                        ? "Liquidation Details"
                        : "Settle Cash Advance"
                }}
              </h2>
              <p class="mt-0.5 truncate text-xs text-slate-400">
                {{
                  settlementModalStep === "select"
                    ? "Choose a cash advance to liquidate."
                    : selectedAdvance?.purpose || "Cash advance details"
                }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <DaysLeftBadge
              v-if="
                settlementModalStep === 'form' &&
                (selectedAdvance?.dueDate ||
                  selectedAdvance?.expected_liquidation_date)
              "
              :due-date="
                selectedAdvance?.dueDate ||
                selectedAdvance?.expected_liquidation_date
              "
              :start-date="
                selectedAdvance?.date ||
                selectedAdvance?.dateOfAdvances ||
                selectedAdvance?.createdAt
              "
              :status="modalAdvanceStatus"
              :is-overdue="isModalAdvanceOverdue"
            />
            <StatusBadge
              v-if="settlementModalStep === 'form' && selectedAdvance"
              :status="modalAdvanceStatus"
            />
            <button
              id="settlement-modal-close"
              type="button"
              aria-label="Close liquidation details"
              class="-mr-1 mt-0.5 flex shrink-0 items-center justify-center rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100"
              @click="closeSettlementModal"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>
        <div class="overflow-y-auto">
          <LiquidationAdvancePicker
            v-if="settlementModalStep === 'select'"
            :advances="employeeOutstandingAdvances"
            :get-badge-status="employeeAdvanceBadgeStatus"
            @select="chooseAdvanceForLiquidation"
          />
          <LiquidationSettlementForm
            v-else
            :selected-advance="selectedAdvance"
            :submitted="submitted"
            :receipts="receipts"
            @update:receipts="receipts = $event"
            :receipt-category-options="receiptCategoryOptions"
            :report-attachment="reportAttachment"
            @file-selected="selectReportAttachment"
            @file-cleared="clearReportAttachment"
            :existing-liquidation="existingLiquidation"
            :needs-report-attachment-reminder="needsReportAttachmentReminder"
            :variance="variance"
            :shortfall-explanation="shortfallExplanation"
            @update:shortfall-explanation="shortfallExplanation = $event"
            :total-expense-amount="totalExpenseAmount"
            :liquidation-status="liquidationStatus"
            :liquidation-outstanding-balance="liquidationOutstandingBalance"
            :overpayment-amount="overpaymentAmount"
            :submitting="submitting"
            :disabled="
              settlementModalMode === 'view' || !selectedAdvanceCanLiquidate
            "
            :has-incomplete-receipt-fields="hasIncompleteReceiptFields"
            @reload-console="handleReloadConsole"
            @upload-error="handleReceiptUploadError"
            @forward-overpayment="forwardOverpaymentToReimbursement"
            @delete-liquidation="handleDeleteLiquidation"
            @submit-liquidation="promptSubmitLiquidation"
          />
        </div>
      </div>
    </BaseModal>

    <ConfirmModal
      :is-open="showSubmitConfirmModal"
      title="Submit Request"
      message="Are you sure do you want to submit this request?"
      confirm-text="Done"
      cancel-text="Cancel"
      :danger="false"
      :loading="submitting"
      @confirm="handleConfirmSubmit"
      @close="handleCancelSubmit"
    />

    <ConfirmModal
      :is-open="showConfirmModal"
      title="Unsaved Changes"
      message="You have unsaved changes in your liquidation form. Are you sure you want to leave? All progress will be lost."
      confirm-text="Leave"
      cancel-text="Stay"
      :danger="true"
      @confirm="onConfirmLeaveModal"
      @close="handleCancelLeave"
    />

    <DeleteConfirmModal
      v-model="isDeleteLiqModalOpen"
      title="Delete Liquidation Settlement"
      message="Are you sure you want to delete this pending liquidation request? This will revert the parent cash advance status back to incomplete. This action cannot be undone."
      @confirm="confirmDeleteLiquidation"
    />
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
