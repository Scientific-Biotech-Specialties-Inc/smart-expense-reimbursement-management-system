import {
  cleanName,
  receiptFinancials,
  getItems,
  formatDateForInput,
} from "./receiptUtils";

const VENDOR_POOL = [
  "Jollibee",
  "SM Supermarket",
  "7-Eleven",
  "GrabCar",
  "Mercury Drug",
  "Starbucks",
  "Petron",
  "National Book Store",
];

const LOCATION_POOL = [
  "Makati, Metro Manila",
  "Bonifacio Global City, Taguig",
  "Ortigas, Pasig City",
  "Cebu City, Cebu",
  "Davao City, Davao del Sur",
];

const KNOWN_VENDORS = [
  ["jollibee", "Jollibee"],
  ["mcdo", "McDonald's"],
  ["mcdonald", "McDonald's"],
  ["7-eleven", "7-Eleven"],
  ["7eleven", "7-Eleven"],
  ["sm", "SM Supermarket"],
  ["grab", "GrabCar"],
  ["starbucks", "Starbucks"],
  ["petron", "Petron"],
  ["mercury", "Mercury Drug"],
  ["shell", "Shell"],
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDigits(count) {
  let out = "";
  for (let i = 0; i < count; i += 1) out += String(randomInt(0, 9));
  return out;
}

function formatTin(twelveDigits) {
  const d = String(twelveDigits).replace(/\D/g, "").slice(0, 12).padEnd(12, "0");
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}-${d.slice(9, 12)}`;
}

function todayInputDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return formatDateForInput(`${yyyy}-${mm}-${dd}`);
}

function vendorFromFile(file) {
  const raw = String(file?.name || "").toLowerCase();
  for (const [token, label] of KNOWN_VENDORS) {
    if (raw.includes(token)) return label;
  }
  const cleaned = cleanName(file?.name || "").trim();
  if (cleaned && cleaned.length >= 3 && !/^receipt/i.test(cleaned)) {
    return cleaned
      .split(/\s+/)
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return VENDOR_POOL[randomInt(0, VENDOR_POOL.length - 1)];
}

function splitItemsAcrossTotal(total) {
  const names = getItems("Meals");
  const per = Math.floor((Number(total) * 100) / names.length) / 100;
  const items = names.map((name) => ({ name, qty: 1, price: per }));
  const assigned = per * names.length;
  const remainder = Math.round((Number(total) - assigned) * 100) / 100;
  if (items.length > 0) {
    items[items.length - 1].price = Math.round((per + remainder) * 100) / 100;
  }
  return items;
}

/**
 * Offline replica of the ocr-pipeline extraction.
 * Pure function — performs zero backend uploads, zero fetch, zero polling.
 * Returns the same shape the real pipeline hydrates (vendor_name,
 * transaction_date, tin, invoice_number, location, total/vat, items).
 */
export function generateMockOcrData(file = {}) {
  const vendor = vendorFromFile(file);
  const transactionDate = todayInputDate();
  const tin = formatTin(`${randomDigits(9)}000`);
  const stamp = new Date();
  const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(
    stamp.getDate(),
  ).padStart(2, "0")}`;
  const invoiceNumber = `INV-${ymd}-${randomDigits(4)}`;
  const location = LOCATION_POOL[randomInt(0, LOCATION_POOL.length - 1)];
  const total = Math.round((150 + Math.random() * 4850) * 100) / 100;
  const { vat } = receiptFinancials({ amount: total }, "vat");
  const vatAmount = Math.round(Number(vat) * 100) / 100;
  const subtotal = Math.round(Math.max(total - vatAmount, 0) * 100) / 100;
  const items = splitItemsAcrossTotal(total);

  return {
    id: `mock-${Date.now()}-${randomDigits(4)}`,
    vendor_name: vendor,
    transaction_date: transactionDate,
    date: transactionDate,
    tin,
    invoice_number: invoiceNumber,
    invoiceNumber,
    location,
    total_amount: total,
    amount: total,
    subtotal: subtotal,
    vat_amount: vatAmount,
    vat: vatAmount,
    vat_classification: "vat",
    vatClassification: "vat",
    currency: "PHP",
    items: items.map((item) => ({
      name: item.name,
      quantity: item.qty,
      qty: item.qty,
      price: item.price,
    })),
    category: "",
    expense_category_id: null,
    file_name: file?.name || "receipt.jpg",
    file_type: file?.type || "image/jpeg",
    confidence: 92,
    ocr_confidence_score: 0.92,
    is_mock: true,
  };
}

function safeThumbnail(file, fallback = "") {
  if (fallback) return fallback;
  try {
    if (file && typeof Blob !== "undefined" && file instanceof Blob) {
      if (String(file.type || "").startsWith("image/")) {
        return URL.createObjectURL(file);
      }
    }
  } catch {
    // Node / test env — fall through to empty thumbnail.
  }
  return "";
}

/**
 * Adapter for the reimbursement flow (ScannedReceiptsList inputs).
 * Mirrors buildPrefilledReceiptDraft output so the form fills identically.
 */
export function buildMockReimbursementReceipt(file = {}, options = {}) {
  const ocr = generateMockOcrData(file);
  if (options.categoryId != null) ocr.expense_category_id = options.categoryId;
  const { vat, subtotal } = receiptFinancials({ amount: Number(ocr.total_amount) }, "vat");
  const items = (ocr.items || []).map((item) => ({
    name: item.name || "",
    qty: Number(item.qty ?? item.quantity ?? 1) || 1,
    price: Number(item.price) || 0,
  }));

  return {
    id: ocr.id,
    invoiceNumber: ocr.invoice_number,
    tin: ocr.tin,
    merchantName: ocr.vendor_name,
    location: ocr.location,
    fileName: file?.name || ocr.file_name,
    fileType: file?.type || ocr.file_type,
    thumbnail: options.thumbnail ?? safeThumbnail(file),
    amount: Number(ocr.total_amount),
    subtotal: Number(subtotal).toFixed(2),
    tax: Number(ocr.vat_amount ?? vat).toFixed(2),
    vatClassification: "vat",
    currency: "PHP",
    date: ocr.transaction_date,
    category: options.categoryName || "",
    categoryId: options.categoryId ?? null,
    items,
    isUploading: false,
    isProcessing: false,
    isMock: true,
    sourceFile: file && typeof File !== "undefined" && file instanceof File ? file : null,
    ocrData: {
      ...ocr,
      vendor: ocr.vendor_name,
      date: ocr.transaction_date,
      amount: ocr.total_amount,
      vat: ocr.vat_amount,
    },
  };
}

/**
 * Adapter for the liquidation flow (FileUpload entries).
 * Mirrors hydrateEntry output so the settlement form fills identically.
 */
export function buildMockFileUploadEntry(file = {}, options = {}) {
  const ocr = generateMockOcrData(file);
  const { vat, subtotal } = receiptFinancials({ amount: Number(ocr.total_amount) }, "vat");
  const amount = Number(ocr.total_amount) || 0;
  const tax = Number(ocr.vat_amount ?? vat) || 0;
  const previews = options.previews ?? (options.thumbnail ? [options.thumbnail] : []);
  const thumbnail = options.thumbnail ?? previews[0] ?? safeThumbnail(file);
  const categoryId = options.categoryId ?? null;

  const entry = {
    id: ocr.id,
    pages: [file],
    name: file?.name || ocr.file_name,
    fileName: file?.name || ocr.file_name,
    size: file?.size || 0,
    previews,
    thumbnail,
    ocrStatus: "done",
    merchantName: ocr.vendor_name,
    date: ocr.transaction_date,
    tin: ocr.tin,
    invoiceNumber: ocr.invoice_number,
    location: ocr.location,
    currency: "PHP",
    vatClassification: "vat",
    categoryId,
    subtotal: Number(subtotal).toFixed(2),
    tax: String(tax.toFixed ? tax.toFixed(2) : tax),
    amount,
    items: (ocr.items || []).map((item) => ({
      name: item.name || "",
      qty: Number(item.qty ?? item.quantity ?? 1) || 1,
      price: Number(item.price) || 0,
    })),
    isMock: true,
    ocrData: {
      id: ocr.id,
      vendor: ocr.vendor_name,
      date: ocr.transaction_date,
      amount: ocr.total_amount,
      vat: ocr.vat_amount,
      tin: ocr.tin,
      invoiceNumber: ocr.invoice_number,
      location: ocr.location,
      confidence: ocr.confidence,
      file_path: null,
      file_type: ocr.file_type,
      is_mock: true,
    },
  };

  return entry;
}
