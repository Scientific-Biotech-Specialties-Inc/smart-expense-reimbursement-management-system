import { truncateDecimal } from "./formatters";

export const DISCOUNT_TYPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "senior", label: "Senior Citizen" },
  { value: "pwd", label: "PWD" },
  { value: "student", label: "Student" },
  { value: "promo", label: "Promo / Voucher" },
  { value: "employee", label: "Employee" },
  { value: "other", label: "Other" },
];

const VALID_DISCOUNT_TYPES = new Set(DISCOUNT_TYPE_OPTIONS.map((o) => o.value));

export function normalizeDiscountType(value, discountAmount = 0) {
  const normalized = String(value || "").trim().toLowerCase();
  if (VALID_DISCOUNT_TYPES.has(normalized) && normalized !== "none") {
    return normalized;
  }
  if (Number(discountAmount) > 0) {
    return "other";
  }
  return "none";
}

export function formatDiscountTypeLabel(value) {
  const found = DISCOUNT_TYPE_OPTIONS.find((opt) => opt.value === String(value || "").toLowerCase());
  return found && found.value !== "none" ? found.label : "";
}

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

export function receiptDiscountAmount(receipt) {
  const val = Number(
    receipt?.discountAmount ?? receipt?.discount_amount ?? receipt?.discount ?? 0,
  );
  return val > 0 ? val : 0;
}

export function receiptGrossAmount(receipt) {
  const explicitAmount = Number(receipt?.amount ?? receipt?.total_amount ?? 0);
  if (explicitAmount > 0) {
    return explicitAmount;
  }

  if (receipt?.items?.length) {
    return Math.max(0, itemsGrossAmount(receipt.items) - receiptDiscountAmount(receipt));
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
  const discountAmount = receiptDiscountAmount(receipt);
  const discountType = normalizeDiscountType(
    receipt?.discountType ?? receipt?.discount_type,
    discountAmount,
  );

  return {
    gross,
    vat,
    subtotal: Math.max(gross - vat, 0),
    vatClassification: classification,
    discountAmount,
    discountType,
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

/**
 * Formats a BIR TIN string into `XXX-XXX-XXX` or `XXX-XXX-XXX-XXX` segments.
 *
 * @param {string|number|null|undefined} value
 * @param {object} [options]
 * @param {boolean} [options.padLastBlock=false] Pad a 9-digit TIN with `-000`
 * @returns {string}
 */
export function formatTinValue(value, { padLastBlock = false } = {}) {
  let digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 12);
  if (padLastBlock && digits.length === 9) {
    digits = `${digits}000`;
  }

  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 9));
  if (digits.length > 9) parts.push(digits.slice(9, 12));
  return parts.join("-");
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
  const rawDiscount = Number(receiptData.discount_amount ?? receiptData.discountAmount ?? 0) || 0;
  const discountType = normalizeDiscountType(
    receiptData.discount_type ?? receiptData.discountType,
    rawDiscount,
  );
  const discountAmountStr = rawDiscount > 0 ? rawDiscount.toFixed(2) : "0.00";
  const categoryName = receiptData.category?.name || "";
  const items =
    Array.isArray(receiptData.items) && receiptData.items.length > 0
      ? receiptData.items.map((item) => ({
          name: item.name || "",
          qty: Number(item.quantity ?? item.qty) || 1,
          price: Number(item.price) || 0,
        }))
      : [];
  const amounts = receiptFinancials(
    { amount, items, discount_amount: rawDiscount, discount_type: discountType },
    vatClassification,
  );

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
    amount: amount > 0 ? Number(truncateDecimal(amounts.gross, 2)) : "",
    subtotal: resolvedSubtotal,
    tax:
      receiptData.vat_amount != null && receiptData.vat_amount !== ""
        ? Number(receiptData.vat_amount).toFixed(2)
        : (vatClassification === "non-vat" ? "0.00" : ""),
    discountAmount: discountAmountStr,
    discountType,
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
  const discAmt = Number(receipt.discountAmount) || 0;

  return {
    invoice_number: receipt.invoiceNumber,
    transaction_date: receipt.date,
    tin: receipt.tin,
    vendor_name: receipt.merchantName,
    expense_category_id: receipt.categoryId || "",
    total_amount: receipt.amount > 0 ? Number(receipt.amount.toFixed(2)) : "",
    vat_amount: receipt.tax,
    discount_amount: discAmt >= 0 ? discAmt.toFixed(2) : "0.00",
    discount_type: receipt.discountType || "none",
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

function isMissingFieldValue(receipt, fieldKey) {
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

export function isReceiptFieldMissing(receipt, fieldKey) {
  if (!receipt || (!receipt.hasOcrReturned && !receipt.validated)) return false;
  return isMissingFieldValue(receipt, fieldKey);
}

export function getMissingReceiptFields(receipt) {
  if (!receipt) return [];
  return REQUIRED_RECEIPT_FIELDS.filter(({ key }) =>
    isMissingFieldValue(receipt, key),
  );
}
