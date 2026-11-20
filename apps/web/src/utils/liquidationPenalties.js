/**
 * Shared grace-period and daily overdue penalty helpers for cash advance liquidations.
 */

export const GRACE_PERIOD_DAYS = 7;
export const DAILY_PENALTY_PHP = 50;

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
