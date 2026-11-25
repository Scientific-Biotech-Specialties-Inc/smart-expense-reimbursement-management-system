/**
 * Shared grace-period and daily overdue penalty helpers for cash advance liquidations.
 */

export const GRACE_PERIOD_DAYS = 7;
export const CA_SIGNING_GRACE_DAYS = 3;
export const DAILY_PENALTY_PHP = 50;
export const TERMINAL_LIQUIDATION_STATUSES = ["liquidated", "settled", "rejected"];
export const PAUSED_LIQUIDATION_STATUSES = ["pending", "under-review", "approved"];

/**
 * Sum persisted penalty amounts from an array of penalty records.
 *
 * @param {Array<{ penalty_amount?: number|string, amount?: number|string, penaltyAmount?: number|string }>} penalties
 * @returns {number}
 */
export function sumPenaltyRecords(penalties) {
  if (!Array.isArray(penalties) || penalties.length === 0) return 0;
  return penalties.reduce((sum, entry) => {
    const val = Number(entry?.penalty_amount ?? entry?.amount ?? entry?.penaltyAmount ?? 0);
    return sum + (Number.isFinite(val) ? val : 0);
  }, 0);
}

/**
 * Compute overdue days past the 7-day grace period after expected_liquidation_date.
 *
 * @param {string|Date|number|null|undefined} dueDateValue
 * @param {Date} [referenceDate]
 * @returns {number}
 */
export function computePenaltyDaysPastGrace(dueDateValue, referenceDate = new Date()) {
  if (!dueDateValue) return 0;
  const due = new Date(dueDateValue);
  if (Number.isNaN(due.getTime())) return 0;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const daysPastDue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysPastDue - GRACE_PERIOD_DAYS);
}

/**
 * Resolve the authoritative outstanding balance for a cash advance (balance -> outstanding_balance -> amount).
 *
 * @param {{ balance?: number|string|null, outstanding_balance?: number|string|null, amount?: number|string|null }|null|undefined} advance
 * @returns {number}
 */
export function resolveAdvanceBalance(advance) {
  if (!advance) return 0;
  const val = Number(advance.balance ?? advance.outstanding_balance ?? advance.amount ?? 0);
  return Number.isFinite(val) ? val : 0;
}

/**
 * Check at cent precision whether total expenses are strictly below the required advance balance.
 *
 * @param {number|string|null|undefined} expenseAmount
 * @param {number|string|null|undefined} balanceAmount
 * @returns {boolean}
 */
export function isExpenseBelowBalance(expenseAmount, balanceAmount) {
  const expense = Number(expenseAmount);
  const balance = Number(balanceAmount);
  const expenseCents = Math.round((Number.isFinite(expense) ? expense : 0) * 100);
  const balanceCents = Math.round((Number.isFinite(balance) ? balance : 0) * 100);
  return expenseCents < balanceCents;
}

/**
 * Determine whether a liquidation/cash advance is overdue past the 7-day grace period,
 * respecting explicit overdue/penalty records and terminal or paused review statuses.
 *
 * @param {{ status?: string, aging?: { isOverdue?: boolean }|null, penalties?: Array|null, dueDate?: string|Date|number|null }} [params]
 * @param {Date} [referenceDate]
 * @returns {boolean}
 */
export function isLiquidationOverdue(
  { status = "", aging = null, penalties = null, dueDate = null } = {},
  referenceDate = new Date(),
) {
  const normalizedStatus = String(status || "").toLowerCase().trim();
  if (normalizedStatus === "overdue") return true;
  if (Array.isArray(penalties) && penalties.length > 0) return true;
  if (
    TERMINAL_LIQUIDATION_STATUSES.includes(normalizedStatus) ||
    PAUSED_LIQUIDATION_STATUSES.includes(normalizedStatus)
  ) {
    return false;
  }
  if (aging?.isOverdue) return true;
  return computePenaltyDaysPastGrace(dueDate, referenceDate) > 0;
}

/**
 * Compute the 3-day employee signing deadline from a cash advance disbursement timestamp.
 *
 * @param {string|Date|number|null|undefined} grantedDateValue
 * @returns {Date|null}
 */
export function computeSigningDeadline(grantedDateValue) {
  if (!grantedDateValue) return null;
  const granted = new Date(grantedDateValue);
  if (Number.isNaN(granted.getTime())) return null;
  const due = new Date(granted);
  due.setDate(due.getDate() + CA_SIGNING_GRACE_DAYS);
  return due;
}
