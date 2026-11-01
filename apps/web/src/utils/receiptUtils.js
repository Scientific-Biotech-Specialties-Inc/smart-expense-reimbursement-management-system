export function vatOf(amount) {
  return amount > 0 ? (amount * 0.12) / 1.12 : 0;
}

export function normalizeVatClassification(value) {
  return String(value || "").toLowerCase() === "non-vat" ? "non-vat" : "vat";
}

export function vatFor(amount, vatClassification = "vat") {
  return normalizeVatClassification(vatClassification) === "non-vat"
    ? 0
    : vatOf(amount);
}

export function subtotalOf(amount, vatClassification = "vat") {
  return amount > 0 ? amount - vatFor(amount, vatClassification) : 0;
}

export function itemGrossAmount(item) {
  return Number(item?.price) || 0;
}

export function itemsGrossAmount(items = []) {
  return items.reduce((sum, item) => sum + itemGrossAmount(item), 0);
}

export function receiptGrossAmount(receipt) {
  const explicitAmount = Number(receipt?.amount ?? receipt?.total_amount ?? 0);
  if (explicitAmount > 0) {
    return explicitAmount;
  }

  if (receipt?.items?.length) {
    return itemsGrossAmount(receipt.items);
  }

  return 0;
}

export function receiptFinancials(receipt, vatClassification) {
  const classification = normalizeVatClassification(
    vatClassification ??
      receipt?.vatClassification ??
      receipt?.vat_classification,
  );
  const gross = receiptGrossAmount(receipt);
  const vat = vatFor(gross, classification);

  return {
    gross,
    vat,
    subtotal: Math.max(gross - vat, 0),
    vatClassification: classification,
  };
}

export function cleanName(fileName) {
  return (fileName || "").replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
}

export function tinFor(receipt) {
  const seed = String(receipt.id || receipt.fileName || "")
    .replace(/\D/g, "")
    .padEnd(9, "0");
  return `${seed.slice(0, 3)}-${seed.slice(3, 6)}-${seed.slice(6, 9)}-000`;
}

const MOCK_ITEMS = {
  "Food & Dining": ["Chickenjoy 2pc Meal", "Yumburger w/ Cheese", "Iced Tea"],
  Lodging: [
    "1 Night - Deluxe Room",
    "Breakfast Buffet (x2)",
    "Airport Transfer",
  ],
  Transportation: [
    "GrabCar Ride - Terminal to CBD",
    "Toll Fee - SLEX",
    "Parking Fee",
  ],
  Meals: ["Set Meal A (x2)", "Drinks & Dessert", "Service Charge"],
  Supplies: ["Bond Paper (5 reams)", "Ballpens & Markers", "Correction Tape"],
  Uncategorized: ["Item 1", "Item 2"],
};

export function getItems(cat) {
  return MOCK_ITEMS[cat] || MOCK_ITEMS.Uncategorized;
}

function buildDefaultItems(categoryLabel, amount) {
  const itemNames = getItems(categoryLabel || "Expense");
  const splitPrice = itemNames.length > 0 ? Number(amount || 0) / itemNames.length : 0;

  return itemNames.map((name) => ({
    name,
    qty: 1,
    price: Number(splitPrice.toFixed(2)),
  }));
}

export function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  if (typeof dateStr === "string") {
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (trimmed.includes("T")) return trimmed.split("T")[0];
    if (trimmed.includes(" ")) return trimmed.split(" ")[0];
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  } catch (e) {
    return "";
  }
}

export function buildPrefilledReceiptDraft({
  id,
  file,
  receiptData = {},
  thumbnail = "",
  defaultLocation = "",
} = {}) {
  const resolvedId = receiptData.id || id || `temp-${Date.now()}`;
  const fileName = file?.name || receiptData.file_name || `Receipt-${resolvedId}`;
  const fileType = file?.type || receiptData.file_type || "";
  const merchantName = receiptData.vendor_name || "";
  const vatClassification = normalizeVatClassification(
    receiptData.vat_classification,
  );
  const amount = Number(receiptData.total_amount) || 0;
  const categoryName = receiptData.category?.name || "";
  const items =
    Array.isArray(receiptData.items) && receiptData.items.length > 0
      ? receiptData.items.map((item) => ({
          name: item.name || "",
          qty: Number(item.quantity ?? item.qty) || 1,
          price: Number(item.price) || 0,
        }))
      : [];
  const amounts = receiptFinancials({ amount, items }, vatClassification);

  let resolvedSubtotal = "";
  if (receiptData.subtotal != null && receiptData.subtotal !== "") {
    resolvedSubtotal = Number(receiptData.subtotal).toFixed(2);
  } else if (amount > 0) {
    resolvedSubtotal = amounts.subtotal.toFixed(2);
  }

  return {
    id: resolvedId,
    invoiceNumber: receiptData.invoice_number || "",
    tin: receiptData.tin || "",
    merchantName,
    location: receiptData.location || defaultLocation || "",
    fileName,
    fileType,
    thumbnail,
    amount: amount > 0 ? amounts.gross : "",
    subtotal: resolvedSubtotal,
    tax:
      receiptData.vat_amount != null && receiptData.vat_amount !== ""
        ? Number(receiptData.vat_amount).toFixed(2)
        : (vatClassification === "non-vat" ? "0.00" : ""),
    vatClassification: amounts.vatClassification,
    currency: receiptData.currency || "",
    date: formatDateForInput(receiptData.transaction_date || receiptData.date),
    category: categoryName,
    categoryId: receiptData.expense_category_id || null,
    items,
    isUploading: false,
    sourceFile: file || null,
  };
}

export function buildReceiptUploadFormPrefill(options = {}) {
  const receipt = buildPrefilledReceiptDraft(options);

  return {
    invoice_number: receipt.invoiceNumber,
    transaction_date: receipt.date,
    tin: receipt.tin,
    vendor_name: receipt.merchantName,
    expense_category_id: receipt.categoryId || "",
    total_amount: receipt.amount > 0 ? Number(receipt.amount.toFixed(2)) : "",
    vat_amount: receipt.tax,
    vat_classification: receipt.vatClassification,
    currency: receipt.currency,
    items: (receipt.items || []).map((item) => ({
      name: item.name,
      quantity: Number(item.qty ?? item.quantity) || 1,
      price: Number(item.price) || 0,
    })),
  };
}

export function firstFilePathField(value) {
  return Array.isArray(value) ? (value[0] ?? value) : value;
}

/**
 * Statuses for which a receipt may NOT be edited by its owner on the
 * "My Expense" page. This is the single source of truth for edit gating.
 * Any status not in this list is editable (e.g. processing, processed,
 * flagged, rejected, failed, automatic-rejected).
 */
export const EDIT_FORBIDDEN_STATUSES = [
  "approved",
  "pending",
  "pending-admin-re-review",
  "final-rejected",
];

// Delete reuses the edit list but also allows "final-rejected" receipts.
export const DELETE_FORBIDDEN_STATUSES = EDIT_FORBIDDEN_STATUSES.filter(
  (status) => status !== "final-rejected",
);

/**
 * Returns true when the receipt's effective status is NOT in the
 * EDIT_FORBIDDEN_STATUSES set, i.e. the receipt can be edited.
 *
 * Reads `status` first and falls back to `complianceStatus` (both are
 * populated by the store's mapReceipt), so callers can pass either shape.
 *
 * @param {object|null|undefined} receipt
 * @returns {boolean}
 */
export function canEditReceipt(receipt) {
  if (!receipt) return false;
  const status = String(
    receipt.status ?? receipt.complianceStatus ?? "",
  ).trim().toLowerCase();
  // Unknown/empty status is treated as not editable (fail-safe default-deny),
  // consistent with the prior exact-match ("processed") behavior.
  if (!status) return false;
  return !EDIT_FORBIDDEN_STATUSES.includes(status);
}

/**
 * Returns true when a receipt's delete option should be available.
 *
 * Delete availability mirrors edit, except "final-rejected" receipts ARE
 * deletable (unlike edit). It reuses EDIT_FORBIDDEN_STATUSES via
 * DELETE_FORBIDDEN_STATUSES so the two gates stay aligned by construction.
 *
 * @param {object|null|undefined} receipt
 * @returns {boolean}
 */
export function canDeleteReceipt(receipt) {
  if (!receipt) return false;
  const status = String(
    receipt.status ?? receipt.complianceStatus ?? "",
  ).trim().toLowerCase();
  if (!status) return false;
  return !DELETE_FORBIDDEN_STATUSES.includes(status);
}

export const REQUIRED_RECEIPT_FIELDS = [
  { key: "invoiceNumber", label: "Invoice Number" },
  { key: "date", label: "Date" },
  { key: "tin", label: "TIN Number" },
  { key: "merchantName", label: "Merchant Name" },
  { key: "location", label: "Location" },
  { key: "categoryId", label: "Category" },
  { key: "amount", label: "Total Amount" },
  { key: "subtotal", label: "Subtotal" },
];

export function isReceiptFieldMissing(receipt, fieldKey) {
  if (!receipt || (!receipt.hasOcrReturned && !receipt.validated)) return false;
  switch (fieldKey) {
    case "invoiceNumber":
      return !receipt.invoiceNumber || !String(receipt.invoiceNumber).trim();
    case "date":
      return !receipt.date || !String(receipt.date).trim();
    case "tin":
      return !receipt.tin || !String(receipt.tin).trim();
    case "merchantName":
      return !receipt.merchantName || !String(receipt.merchantName).trim();
    case "location":
      return !receipt.location || !String(receipt.location).trim();
    case "categoryId":
      return !receipt.categoryId;
    case "eventType":
      return !receipt.eventType || !String(receipt.eventType).trim();
    case "amount":
      return (
        receipt.amount === "" ||
        receipt.amount === null ||
        receipt.amount === undefined ||
        Number(receipt.amount) <= 0
      );
    case "subtotal":
      return (
        receipt.subtotal === "" ||
        receipt.subtotal === null ||
        receipt.subtotal === undefined ||
        Number(receipt.subtotal) <= 0
      );
    default:
      return false;
  }
}

export function getMissingReceiptFields(receipt) {
  if (!receipt) return [];
  const missing = [];

  if (!receipt.invoiceNumber || !String(receipt.invoiceNumber).trim()) {
    missing.push({ key: "invoiceNumber", label: "Invoice Number" });
  }
  if (!receipt.date || !String(receipt.date).trim()) {
    missing.push({ key: "date", label: "Date" });
  }
  if (!receipt.tin || !String(receipt.tin).trim()) {
    missing.push({ key: "tin", label: "TIN Number" });
  }
  if (!receipt.merchantName || !String(receipt.merchantName).trim()) {
    missing.push({ key: "merchantName", label: "Merchant Name" });
  }
  if (!receipt.location || !String(receipt.location).trim()) {
    missing.push({ key: "location", label: "Location" });
  }
  if (!receipt.categoryId) {
    missing.push({ key: "categoryId", label: "Category" });
  }
  if (
    receipt.amount === "" ||
    receipt.amount === null ||
    receipt.amount === undefined ||
    Number(receipt.amount) <= 0
  ) {
    missing.push({ key: "amount", label: "Total Amount" });
  }
  if (
    receipt.subtotal === "" ||
    receipt.subtotal === null ||
    receipt.subtotal === undefined ||
    Number(receipt.subtotal) <= 0
  ) {
    missing.push({ key: "subtotal", label: "Subtotal" });
  }

  return missing;
}
