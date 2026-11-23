import { ref, computed, watch } from "vue";

export function normalizeStatus(status) {
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

export function statusLabel(status) {
  const labels = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    granted: "Granted",
    processing: "Processing",
    revise: "Needs Revision",
  };
  return labels[normalizeStatus(status)] || "Pending";
}

function getSortValue(row, key) {
  const value = row[key];
  if (["amount", "receiptQuantity", "quantityReport"].includes(key)) {
    return Number(value || 0);
  }
  if (["dateSubmitted"].includes(key)) {
    const raw = row.created_at || row.submitted_at || row.date || value;
    const timestamp = new Date(raw).getTime();
    return Number.isNaN(timestamp)
      ? String(value || "").toLowerCase()
      : timestamp;
  }
  if (["id"].includes(key)) {
    return Number(row.id || 0);
  }
  return String(value || "").toLowerCase();
}

export function useReimbursementFilters(store) {
  const searchQuery = ref("");
  const activeStatus = ref("All");
  const activeCategory = ref("All");
  const activeVendorFilter = ref("All");
  const sortKey = ref("dateSubmitted");
  const sortDirection = ref("desc");
  const pageSize = 10;
  const currentPage = ref(1);

  const tableRows = computed(() =>
    store.items.map((item) => ({
      ...item,
      category:
        item.expense_category?.name ||
        item.receipts?.find((receipt) => receipt.category?.name)?.category?.name ||
        "Uncategorized",
      categoryId:
        item.expense_category_id ||
        item.receipts?.find((receipt) => receipt.expense_category_id)?.expense_category_id ||
        null,
      originalStatus: item.status,
      reportDescription: item.description,
      receiptQuantity: Array.isArray(item.receipts)
        ? item.receipts.length
        : Number(item.receipts) || 0,
      quantityReport: 1,
      dateSubmitted: item.date || item.submitted_at || item.created_at,
      submittedBy: item.user?.name || item.submitted_by_name || "Employee",
      displayStatus: normalizeStatus(item.status),
      displayStatusLabel: statusLabel(item.status),
      fastTrackEligible: Boolean(item.fast_track_eligible),
      vendorAuditRequired: Boolean(item.vendor_audit_required),
      unverifiedVendors: Array.isArray(item.unverified_vendors)
        ? item.unverified_vendors
        : [],
    })),
  );

  const categoryFilters = computed(() => [
    "All",
    ...new Set(tableRows.value.map((row) => row.category).filter(Boolean)),
  ]);

  const vendorFilters = ["All", "Fast-Track Eligible", "Needs Secondary Audit"];

  const filteredTableRows = computed(() => {
    let rows = tableRows.value;
    if (activeStatus.value !== "All") {
      rows = rows.filter(
        (row) => row.displayStatus === normalizeStatus(activeStatus.value),
      );
    }
    if (activeCategory.value !== "All") {
      rows = rows.filter((row) => row.category === activeCategory.value);
    }
    if (activeVendorFilter.value === "Fast-Track Eligible") {
      rows = rows.filter((row) => row.fastTrackEligible);
    } else if (activeVendorFilter.value === "Needs Secondary Audit") {
      rows = rows.filter((row) => row.vendorAuditRequired);
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      rows = rows.filter((row) =>
        [
          row.id,
          row.reference_no,
          row.ticket_number,
          row.ticket_id,
          row.prs_activity_id,
          row.source_submission_id,
          row.source_system,
          row.reportDescription,
          row.category,
          row.submittedBy,
          row.amount,
          row.dateSubmitted,
          row.displayStatus,
          row.displayStatusLabel,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }
    return rows;
  });

  const sortedTableRows = computed(() => {
    const rows = [...filteredTableRows.value];
    const isDefaultPrioritySort =
      sortKey.value === "dateSubmitted" && sortDirection.value === "desc";

    if (!sortKey.value) {
      return rows.sort((a, b) => {
        const aFast = a.displayStatus === "pending" && a.fastTrackEligible ? 1 : 0;
        const bFast = b.displayStatus === "pending" && b.fastTrackEligible ? 1 : 0;
        if (aFast !== bFast) return bFast - aFast;
        const aTime = new Date(a.created_at || a.submitted_at || a.dateSubmitted || a.date || 0).getTime();
        const bTime = new Date(b.created_at || b.submitted_at || b.dateSubmitted || b.date || 0).getTime();
        if (aTime !== bTime) return bTime - aTime;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
    }

    return rows.sort((a, b) => {
      if (isDefaultPrioritySort) {
        const aFast = a.displayStatus === "pending" && a.fastTrackEligible ? 1 : 0;
        const bFast = b.displayStatus === "pending" && b.fastTrackEligible ? 1 : 0;
        if (aFast !== bFast) return bFast - aFast;
      }
      const aValue = getSortValue(a, sortKey.value);
      const bValue = getSortValue(b, sortKey.value);
      if (aValue === bValue) {
        const aTime = new Date(a.created_at || a.submitted_at || a.dateSubmitted || a.date || 0).getTime();
        const bTime = new Date(b.created_at || b.submitted_at || b.dateSubmitted || b.date || 0).getTime();
        if (aTime !== bTime) return bTime - aTime;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
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

  watch([searchQuery, activeStatus, activeCategory, activeVendorFilter], () => {
    currentPage.value = 1;
  });

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
    sortDirection.value = ["dateSubmitted", "id"].includes(key) ? "desc" : "asc";
    currentPage.value = 1;
  }

  return {
    searchQuery,
    activeStatus,
    activeCategory,
    activeVendorFilter,
    sortKey,
    sortDirection,
    pageSize,
    currentPage,
    categoryFilters,
    vendorFilters,
    filteredTableRows,
    sortedTableRows,
    paginatedTableRows,
    totalPages,
    toggleSort,
  };
}
