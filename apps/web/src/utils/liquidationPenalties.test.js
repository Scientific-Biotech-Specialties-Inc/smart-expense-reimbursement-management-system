import { describe, it, expect } from "vitest";
import {
  resolveAdvanceBalance,
  isExpenseBelowBalance,
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
});
