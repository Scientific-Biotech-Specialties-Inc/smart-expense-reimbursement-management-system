// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLiquidationStore } from "./liquidation";
import { useCashAdvanceStore } from "./cashAdvance";
import { apiFetch } from "../utils/apiFetch";

vi.mock("../utils/apiFetch", () => ({
  apiFetch: vi.fn(),
}));

describe("useLiquidationStore.calculateAging & overdue balance normalization", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enforces a 7-day grace period after expected_liquidation_date before marking overdue or accruing ₱50/day", () => {
    const store = useLiquidationStore();

    // 5 days past due -> still inside 7-day grace period
    const inGrace = store.calculateAging({
      status: "signed",
      expected_liquidation_date: "2026-11-15",
      penalties: [],
    });
    expect(inGrace.isOverdue).toBe(false);
    expect(inGrace.penalty).toBe(0);
    expect(inGrace.daysOverdue).toBe(0);

    // Exactly 7 days past due -> last day of grace period (still ₱0 penalty)
    const seventhDay = store.calculateAging({
      status: "signed",
      expected_liquidation_date: "2026-11-13",
      penalties: [],
    });
    expect(seventhDay.isOverdue).toBe(false);
    expect(seventhDay.penalty).toBe(0);
    expect(seventhDay.daysOverdue).toBe(0);

    // 10 days past due -> 3 days past 7-day grace period -> ₱150 penalty
    const pastGrace = store.calculateAging({
      status: "signed",
      expected_liquidation_date: "2026-11-10",
      penalties: [],
    });
    expect(pastGrace.isOverdue).toBe(true);
    expect(pastGrace.daysOverdue).toBe(3);
    expect(pastGrace.penalty).toBe(150);
  });

  it("uses persisted backend penalties total when penalties exist and pauses fallback accrual while auditing", () => {
    const store = useLiquidationStore();

    const underReviewWithPriorPenalties = store.calculateAging({
      status: "under-review",
      expected_liquidation_date: "2026-11-08",
      penalties: [
        { days_overdue: 1, penalty_amount: 50 },
        { days_overdue: 2, penalty_amount: 50 },
      ],
    });
    expect(underReviewWithPriorPenalties.isOverdue).toBe(true);
    expect(underReviewWithPriorPenalties.penalty).toBe(100);
  });

  it("useCashAdvanceStore preserves penalty-inclusive outstanding_balance over amount", async () => {
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 19,
          amount: "10000.00",
          outstanding_balance: "10250.00",
          status: "overdue",
          expected_liquidation_date: "2026-11-08",
          penalties: [
            { days_overdue: 1, penalty_amount: "50.00" },
            { days_overdue: 2, penalty_amount: "50.00" },
            { days_overdue: 3, penalty_amount: "50.00" },
            { days_overdue: 4, penalty_amount: "50.00" },
            { days_overdue: 5, penalty_amount: "50.00" },
          ],
        },
      ],
    });

    const caStore = useCashAdvanceStore();
    await caStore.fetchAll();
    expect(caStore.items).toHaveLength(1);
    expect(caStore.items[0].balance).toBe(10250);
    expect(caStore.totalOutstanding).toBe(10250);
  });
});
