import {
  cleanName,
  getItems,
  normalizeVatClassification,
  receiptFinancials,
  tinFor,
} from "@/utils/receiptUtils";

export function canForwardToReimbursement(receipt) {
  return normalizeReceiptStatus(receipt?.status) === "processed" && !receipt?.isReimbursed;
}

/**
 * Return a precise, human-readable reason a set of receipts cannot be
 * forwarded to reimbursement, or an empty string when they can be forwarded.
 *
 * The two distinct failure modes are reported with DISTINCT messages so the UI
 * never conflates "not yet processed" with "already attached to a
 * reimbursement":
 *   - genuinely attached (isReimbursed === true) -> "...already attached..."
 *   - merely unprocessed (status !== "processed") -> "...must be processed..."
 *
 * This matters because a freshly uploaded, un-attached receipt is in `pending`
 * (or `processing`) state and must be reported as "needs processing", NOT as
 * "already attached".
 */
export function getForwardingBlockReason(receipts) {
  const list = Array.isArray(receipts) ? receipts : [receipts];

  if (!list.length) {
    return "Select at least one receipt to forward.";
  }

  // Failure mode 1: genuinely attached to a reimbursement request.
  const attached = list.filter((receipt) => receipt?.isReimbursed);
  if (attached.length) {
    return list.length > 1
      ? "One or more selected receipts are already attached to a reimbursement request."
      : "This receipt is already attached to a reimbursement request.";
  }

  // Failure mode 2: not yet processed (status !== "processed"). This is the
  // common case for a freshly uploaded receipt and must NOT be reported as
  // "already attached".
  const unprocessed = list.filter(
    (receipt) => normalizeReceiptStatus(receipt?.status) !== "processed",
  );
  if (unprocessed.length) {
    return "Receipts must be processed before they can be forwarded to reimbursement.";
  }

  if (list.some((receipt) => !receipt?.dbId)) {
    return "Receipt database id is missing. Please refresh My Expense and try again.";
  }

  return "";
}

export function mapReceiptToReimbursement(receipt) {
  const vatClassification = normalizeVatClassification(receipt.vatClassification);
  const items = normalizeItems(receipt);
  const amounts = receiptFinancials(
    {
      amount: Number(receipt.amount) || 0,
      total_amount: Number(receipt.amount) || 0,
      vatAmount: Number(receipt.vatAmount) || 0,
      vat_amount: Number(receipt.vatAmount) || 0,
      items,
    },
    vatClassification,
  );

  const resolvedSubtotal =
    receipt.subtotal != null && receipt.subtotal !== ""
      ? Number(receipt.subtotal).toFixed(2)
      : amounts.subtotal.toFixed(2);

  return {
    sourceExpenseId: receipt.id,
    id: receipt.dbId,
    fileName: receipt.fileName || receipt.vendorName || `Receipt-${receipt.dbId}`,
    fileType: receipt.fileType,
    merchantName: receipt.vendorName || cleanName(receipt.fileName || ""),
    date: receipt.date,
    amount: amounts.gross,
    subtotal: resolvedSubtotal,
    tax: amounts.vat.toFixed(2),
    vatClassification: amounts.vatClassification,
    tin: receipt.tin || tinFor({ id: receipt.dbId || receipt.id }),
    invoiceNumber: receipt.invoiceNumber || receipt.dbId || receipt.id,
    category: receipt.category || "Uncategorized",
    categoryId: receipt.categoryId || null,
    eventType: receipt.eventType || "",
    location: receipt.location || "",
    thumbnail: receipt.thumbnail,
    items,
    isUploading: false,
    isForwardedFromExpense: true,
  };
}

function normalizeReceiptStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function normalizeItems(receipt) {
  const totalAmount = Number(receipt.amount) || 0;

  if (Array.isArray(receipt.items) && receipt.items.length) {
    const items = receipt.items.map((item) => ({
      name: item.name || "",
      qty: Number(item.qty ?? item.quantity ?? 1),
      price: Number(item.price ?? 0),
    }));

    if (items.every((item) => item.name && item.qty > 0 && item.price > 0)) {
      return items;
    }
  }

  const fallbackName =
    cleanName(receipt.fileName || "") ||
    getItems(receipt.category || "Food & Dining")[0] ||
    "Receipt total";

  return [{
    name: fallbackName,
    qty: 1,
    price: Number(totalAmount.toFixed(2)),
  }];
}
