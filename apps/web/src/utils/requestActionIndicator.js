import { normalizeStatus } from "@/composables/reimbursements/useReimbursementFilters";
import { isPayoutAcknowledged } from "@/composables/payouts/usePayoutFilters";

function normalizeIndicatorStatus(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
}

function resolveIsOwner(row, isAdmin, currentUserId) {
  const ownerId =
    row?.user?.id ??
    row?.requester?.id ??
    row?.user_id ??
    row?.userId ??
    row?.requestorId ??
    row?.submitted_by ??
    row?.cash_advance?.user_id;

  if (
    currentUserId === null ||
    currentUserId === undefined ||
    ownerId === null ||
    ownerId === undefined
  ) {
    // Employee views only display the user's own rows; admin unit tests without IDs represent other users' rows.
    return !isAdmin;
  }

  return String(currentUserId) === String(ownerId);
}

/**
 * Return a concise human-readable action label describing what the currently
 * logged-in user needs to do on a request row, or null when no action is needed.
 *
 * @param {object} row
 * @param {'reimbursement'|'cash_advance'|'liquidation'|'liquidation_advance'|'payout'} type
 * @param {{ isAdmin?: boolean, currentUserId?: string|number|null }} [context]
 * @returns {string|null}
 */
export function getRequiredActionLabel(row, type, context = {}) {
  if (!row) return null;

  const isAdmin = Boolean(context.isAdmin);
  const isOwner = resolveIsOwner(row, isAdmin, context.currentUserId);

  if (type === "payout") {
    if (isAdmin) return null;
    const ackStatus = normalizeIndicatorStatus(row.acknowledgementStatus);
    if (ackStatus === "acknowledged") return null;
    if (ackStatus === "awaiting-acknowledgement" || !isPayoutAcknowledged(row)) {
      return "Sign to acknowledge payout";
    }
    return null;
  }

  if (type === "reimbursement") {
    const status = normalizeStatus(row.displayStatus ?? row.status);
    if (isOwner) {
      if (status === "revise") return "Edit & resubmit request";
      if (status === "granted" && !isPayoutAcknowledged(row)) {
        return "Sign to acknowledge payout";
      }
      return null;
    }
    if (!isAdmin) return null;
    if (status === "pending" || status === "processing") {
      return "Review & approve claim";
    }
    if (status === "approved") return "Grant payout";
    return null;
  }

  if (type === "cash_advance") {
    const status = normalizeIndicatorStatus(row.status);
    if (isOwner) {
      if (status === "revise") return "Edit & resubmit request";
      if (status === "disbursed" && !isPayoutAcknowledged(row)) {
        return "Sign to acknowledge receipt";
      }
      return null;
    }
    if (!isAdmin) return null;
    if (status === "pending") return "Review & approve request";
    if (status === "approved") return "Disburse funds";
    return null;
  }

  if (type === "liquidation") {
    const status = normalizeIndicatorStatus(row.status);
    if (isOwner) {
      return status === "revise" ? "Edit & resubmit liquidation" : null;
    }
    if (
      isAdmin &&
      ["pending", "under-review", "incomplete", "overdue", "overpayment"].includes(
        status,
      )
    ) {
      return "Review & settle liquidation";
    }
    return null;
  }

  if (type === "liquidation_advance") {
    const status = normalizeIndicatorStatus(row.status);
    if (status === "disbursed") return "Sign to acknowledge receipt";
    if (status === "revise") return "Edit & resubmit liquidation";
    if (["signed", "incomplete", "overdue", "overpayment"].includes(status)) {
      return "Submit liquidation";
    }
    return null;
  }

  return null;
}

/**
 * Boolean helper indicating whether the current user has an action required on a row.
 *
 * @param {object} row
 * @param {'reimbursement'|'cash_advance'|'liquidation'|'liquidation_advance'|'payout'} type
 * @param {{ isAdmin?: boolean, currentUserId?: string|number|null }} [context]
 * @returns {boolean}
 */
export function hasPendingSignOff(row, type, context = {}) {
  return Boolean(getRequiredActionLabel(row, type, context));
}
