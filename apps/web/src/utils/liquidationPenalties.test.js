import { describe, it, expect } from "vitest";
import {
  CA_SIGNING_GRACE_DAYS,
  computeSigningDeadline,
  resolveAdvanceBalance,
  isExpenseBelowBalance,
  isLiquidationOverdue,
} from "./liquidationPenalties";

describe("liquidationPenalties balance helpers", () => {
  it("resolves balance -> outstanding_balance -> amount in precedence order", () => {
    expect(resolveAdvanceBalance(null)).toBe(0);
    expect(resolveAdvanceBalance({ balance: 5150, outstanding_balance: 5100, amount: 5000 })).toBe(5150);
    expect(resolveAdvanceBalance({ outstanding_balance: 5100, amount: 5000 })).toBe(5100);
    expect(resolveAdvanceBalance({ amount: 5000 })).toBe(5000);
    expect(resolveAdvanceBalance({ balance: "invalid" })).toBe(0);
  });

  it("compares total expenses against balance at cent precision", () => {
    expect(isExpenseBelowBalance(4999.99, 5000)).toBe(true);
    expect(isExpenseBelowBalance(5000, 5000)).toBe(false);
    expect(isExpenseBelowBalance(5250, 5000)).toBe(false);
    expect(isExpenseBelowBalance(100.1 + 200.2, 300.3)).toBe(false);
    expect(isExpenseBelowBalance(5000, 5150)).toBe(true);
  });

  it("evaluates overdue status past the 7-day grace period while respecting terminal and paused statuses", () => {
    const refDate = new Date("2026-10-21T00:00:00Z");

    expect(isLiquidationOverdue({ status: "overdue", dueDate: "2026-10-25" }, refDate)).toBe(true);
    expect(isLiquidationOverdue({ status: "liquidated", penalties: [{ penalty_amount: 50 }], dueDate: "2026-10-25" }, refDate)).toBe(true);
    expect(isLiquidationOverdue({ status: "disbursed", aging: { isOverdue: true }, dueDate: "2026-10-25" }, refDate)).toBe(true);

    // Grace period (7 days past due) vs penalty day (8 days past due)
    expect(isLiquidationOverdue({ status: "disbursed", dueDate: "2026-10-14" }, refDate)).toBe(false);
    expect(isLiquidationOverdue({ status: "disbursed", dueDate: "2026-10-13" }, refDate)).toBe(true);

    // Terminal & paused statuses without explicit overdue/penalties never trigger overdue
    for (const status of ["liquidated", "settled", "rejected", "pending", "under-review", "approved"]) {
      expect(isLiquidationOverdue({ status, dueDate: "2026-10-01" }, refDate)).toBe(false);
    }
  });

  it("computes 3-day cash advance signing deadline from granted date and returns null for invalid input", () => {
    expect(CA_SIGNING_GRACE_DAYS).toBe(3);
    expect(computeSigningDeadline(null)).toBeNull();
    expect(computeSigningDeadline("not-a-date")).toBeNull();

    const deadline = computeSigningDeadline("2026-11-23T08:00:00Z");
    expect(deadline).toBeInstanceOf(Date);
    expect(deadline.getUTCFullYear()).toBe(2026);
    expect(deadline.getUTCMonth()).toBe(10); // November
    expect(deadline.getUTCDate()).toBe(26);
  });
});
