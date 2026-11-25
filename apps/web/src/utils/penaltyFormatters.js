import { formatDate } from "@/utils/formatters";

const MODULE_LABELS = {
  cash_advance: "Cash Advance",
  liquidation: "Liquidation",
  reimbursement: "Reimbursement",
};

const TRIGGER_LABELS = {
  ca_unsigned_overdue: "Unsigned Cash Advance Overdue",
  liquidation_overdue: "Overdue Liquidation",
  manual_admin: "Admin Compliance Notice",
};

/**
 * Format a numeric value as "PHP 1,250.00" for penalty compliance displays.
 * @param {number|string|null|undefined} amount
 * @returns {string}
 */
export function formatPhpAmount(amount) {
  const num = Number(amount);
  const safe = Number.isFinite(num) ? num : 0;
  return `PHP ${safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format a date string into Medium Date format ("MMM D, YYYY", e.g. "Nov 25, 2026").
 * @param {string|Date|null|undefined} dateValue
 * @returns {string}
 */
export function formatMediumDate(dateValue) {
  if (!dateValue) return "N/A";
  const formatted = formatDate(dateValue);
  return formatted === "—" ? "N/A" : formatted;
}

/**
 * Human-readable label for a penalty source module.
 * @param {string} moduleName
 * @returns {string}
 */
export function formatSourceModule(moduleName) {
  return MODULE_LABELS[moduleName] || moduleName || "Compliance";
}

/**
 * Human-readable label for a penalty trigger type.
 * @param {string} triggerType
 * @returns {string}
 */
export function formatTriggerType(triggerType) {
  return TRIGGER_LABELS[triggerType] || triggerType || "Compliance Strike";
}
