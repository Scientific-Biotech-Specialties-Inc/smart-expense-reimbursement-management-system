import { ref, computed, watch } from "vue";
import { normalizeStatus } from "@/composables/reimbursements/useReimbursementFilters";

const ELIGIBLE_CASH_ADVANCE_STATUSES = [
  "disbursed",
  "signed",
  "unliquidated",
  "under-review",
  "incomplete",
  "overdue",
  "liquidated",
  "settled",
];

export function resolvePayoutMethod(item) {
  const payout = item?.payout || {};
  const disbursement = item?.disbursement || {};
  const method =
    payout.payout_method ||
    item?.payout_method ||
    disbursement.payout_method ||
    disbursement.channel ||
    "Cash";
  const methodOther =
    payout.payout_method_other ||
    item?.payout_method_other ||
    disbursement.payout_method_other;
  if (String(method).toLowerCase() === "other" && methodOther) {
    return methodOther;
  }
  return method;
}

export function isPayoutAcknowledged(item) {
  const payout = item?.payout || {};
  return Boolean(
    payout.acknowledged_at ||
      payout.employee_signature ||
      item?.acknowledged_at ||
      item?.acknowledgedAt ||
      item?.employee_signature ||
      item?.signature ||
      item?.signatureImage ||
      String(item?.status || "").toLowerCase() === "signed",
  );
}

export function getAcknowledgementStatusKey(item) {
  return isPayoutAcknowledged(item)
    ? "acknowledged"
    : "awaiting-acknowledgement";
}

export function getAcknowledgementStatusLabel(item) {
  return isPayoutAcknowledged(item)
    ? "Acknowledged"
    : "Awaiting Acknowledgement";
}

/** Resolve human-readable payout type label ("Cash Advance" or "Reimbursement"). */
export function getPayoutTypeLabel(item) {
  return (
    item?.typeLabel ||
    (item?.type === "cash_advance" ? "Cash Advance" : "Reimbursement")
  );
}

/** Resolve Tailwind badge classes for a payout type pill. */
export function getPayoutTypeBadgeClass(item) {
  return item?.type === "cash_advance"
    ? "bg-blue-50 text-blue-700 border border-blue-200/80"
    : "bg-slate-100 text-slate-700 border border-slate-200/80";
}

function isOwnedByCurrentUser(item, currentUserId, isAdmin) {
  if (isAdmin) return true;
  if (currentUserId === undefined || currentUserId === null) return true;
  const ownerId =
    item.user?.id ??
    item.requester?.id ??
    item.user_id ??
    item.userId ??
    item.submitted_by;
  return String(ownerId) === String(currentUserId);
}

function resolveEmployeeName(item) {
  return (
    item.requester?.name ||
    item.user?.name ||
    item.submitted_by_name ||
    item.requestedBy ||
    (typeof item.user === "string" ? item.user : null) ||
    "Employee"
  );
}

function normalizePayoutRow(item, type) {
  const isCashAdvance = type === "cash_advance";
  const payout = item.payout || {};
  const disbursement = item.disbursement || {};
  const requestDate =
    payout.request_date || item.date || item.submitted_at || item.created_at;
  const approvedDate =
    payout.approved_at || item.approved_at || item.updated_at || requestDate;
  const grantedDate =
    payout.granted_at ||
    item.granted_at ||
    disbursement.created_at ||
    disbursement.disbursement_date ||
    item.updated_at ||
    requestDate;

  return {
    ...item,
    uid: `${type}-${item.id}`,
    id: item.id,
    rawId: item.id,
    type,
    typeLabel: isCashAdvance ? "Cash Advance" : "Reimbursement",
    referenceNumber: `Ref #${item.id}`,
    description: isCashAdvance
      ? item.purpose || item.description || "Cash Advance"
      : item.description,
    employeeName: resolveEmployeeName(item),
    amount: payout.amount ?? item.amount ?? 0,
    currency: item.currency || "PHP",
    payoutMethod: resolvePayoutMethod(item),
    requestDate,
    approvedDate,
    grantedDate,
    grantedBy:
      payout.granted_by ||
      item.granted_by ||
      disbursement.granted_by ||
      disbursement.disbursed_by?.name ||
      "Finance / Admin",
    approvedBy: payout.approved_by || item.approved_by || "Approver",
    granterSignature:
      payout.granter_signature ||
      item.granter_signature ||
      disbursement.granter_signature ||
      null,
    employeeSignature:
      payout.employee_signature ||
      item.employee_signature ||
      item.signature ||
      item.signatureImage ||
      null,
    acknowledgedAt:
      payout.acknowledged_at ||
      item.acknowledged_at ||
      item.acknowledgedAt ||
      null,
    acknowledgementStatus: getAcknowledgementStatusKey(item),
    acknowledgementLabel: getAcknowledgementStatusLabel(item),
    acknowledged: isPayoutAcknowledged(item),
  };
}

function getSortValue(row, key) {
  const value = row[key];
  if (key === "amount") {
    return Number(value || 0);
  }
  if (key === "grantedDate") {
    const timestamp = new Date(value || 0).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
  if (key === "referenceNumber" || key === "id") {
    return Number(row.id || 0);
  }
  return String(value || "").toLowerCase();
}

export function usePayoutFilters(store, auth, cashAdvanceStore = null) {
  const searchQuery = ref("");
  const activeType = ref("All");
  const activeStatus = ref("All");
  const activeEmployee = ref("All");
  const activeMethod = ref("All");
  const dateFrom = ref("");
  const dateTo = ref("");
  const sortKey = ref("grantedDate");
  const sortDirection = ref("desc");
  const pageSize = 10;
  const currentPage = ref(1);

  const typeOptions = ["All", "Reimbursement", "Cash Advance"];

  const grantedReimbursements = computed(() => {
    const currentUserId = auth?.user?.id;
    const isAdmin = Boolean(auth?.isAdmin);

    return (store?.items || []).filter((item) => {
      if (normalizeStatus(item.status) !== "granted") return false;
      return isOwnedByCurrentUser(item, currentUserId, isAdmin);
    });
  });

  const disbursedCashAdvances = computed(() => {
    const currentUserId = auth?.user?.id;
    const isAdmin = Boolean(auth?.isAdmin);

    return (cashAdvanceStore?.items || []).filter((item) => {
      if (!ELIGIBLE_CASH_ADVANCE_STATUSES.includes(normalizeStatus(item.status))) {
        return false;
      }
      return isOwnedByCurrentUser(item, currentUserId, isAdmin);
    });
  });

  const tableRows = computed(() => [
    ...grantedReimbursements.value.map((item) =>
      normalizePayoutRow(item, "reimbursement"),
    ),
    ...disbursedCashAdvances.value.map((item) =>
      normalizePayoutRow(item, "cash_advance"),
    ),
  ]);

  const employeeOptions = computed(() => {
    const names = tableRows.value.map((r) => r.employeeName).filter(Boolean);
    return Array.from(new Set(names));
  });

  const methodOptions = ["All", "Cash", "E-wallet", "Card", "Visa", "Other"];

  const filteredTableRows = computed(() => {
    let rows = tableRows.value;

    if (activeType.value !== "All") {
      rows = rows.filter((row) => row.typeLabel === activeType.value);
    }

    if (activeStatus.value !== "All") {
      const targetKey =
        activeStatus.value === "Acknowledged"
          ? "acknowledged"
          : "awaiting-acknowledgement";
      rows = rows.filter((row) => row.acknowledgementStatus === targetKey);
    }

    if (activeEmployee.value !== "All") {
      rows = rows.filter((row) => row.employeeName === activeEmployee.value);
    }

    if (activeMethod.value !== "All") {
      rows = rows.filter((row) => {
        const method = row.payoutMethod || "";
        if (activeMethod.value === "Other") {
          return !["cash", "e-wallet", "card", "visa"].includes(
            String(method).toLowerCase(),
          );
        }
        return String(method).toLowerCase() === activeMethod.value.toLowerCase();
      });
    }

    if (dateFrom.value) {
      rows = rows.filter((row) => {
        const d = String(row.grantedDate || "").slice(0, 10);
        return d >= dateFrom.value;
      });
    }

    if (dateTo.value) {
      rows = rows.filter((row) => {
        const d = String(row.grantedDate || "").slice(0, 10);
        return d <= dateTo.value;
      });
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      rows = rows.filter((row) =>
        [
          row.id,
          row.referenceNumber,
          row.typeLabel,
          row.employeeName,
          row.description,
          row.amount,
          row.payoutMethod,
          row.grantedDate,
          row.grantedBy,
          row.acknowledgementLabel,
        ].some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }

    return rows;
  });

  const sortedTableRows = computed(() => {
    const rows = [...filteredTableRows.value];
    return rows.sort((a, b) => {
      const aValue = getSortValue(a, sortKey.value);
      const bValue = getSortValue(b, sortKey.value);
      if (aValue === bValue) {
        const idDiff = (Number(b.id) || 0) - (Number(a.id) || 0);
        if (idDiff !== 0) return idDiff;
        return String(a.uid || "").localeCompare(String(b.uid || ""));
      }
      const result = aValue > bValue ? 1 : -1;
      return sortDirection.value === "asc" ? result : -result;
    });
  });

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(sortedTableRows.value.length / pageSize)),
  );

  const paginatedTableRows = computed(() => {
    const start = (currentPage.value - 1) * pageSize;
    return sortedTableRows.value.slice(start, start + pageSize);
  });

  watch(
    [
      searchQuery,
      activeType,
      activeStatus,
      activeEmployee,
      activeMethod,
      dateFrom,
      dateTo,
    ],
    () => {
      currentPage.value = 1;
    },
  );

  watch(totalPages, (pages) => {
    if (currentPage.value > pages) currentPage.value = pages;
  });

  function toggleSort(column) {
    const key = column.sortKey || column.key;
    if (sortKey.value === key) {
      sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
      currentPage.value = 1;
      return;
    }
    sortKey.value = key;
    sortDirection.value = ["grantedDate", "id", "referenceNumber"].includes(key)
      ? "desc"
      : "asc";
    currentPage.value = 1;
  }

  return {
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
    filteredTableRows,
    sortedTableRows,
    paginatedTableRows,
    totalPages,
    toggleSort,
  };
}
