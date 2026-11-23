// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCmsStore } from "./cms";

const mockApiFetch = vi.fn();
vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

describe("useCmsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("fetches active contracts and marks available=false on offline/error response", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        available: true,
        data: [{ contract_id: 10, contract_code: "CTR-ABC123", client_name: "Acme Biotech Corp" }],
      }),
    });

    const store = useCmsStore();
    const list = await store.fetchActiveContracts("Acme");
    expect(list).toHaveLength(1);
    expect(store.contractsAvailable).toBe(true);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/serms/cms/contracts/active?limit=100&search=Acme",
      { credentials: "include" },
    );

    mockApiFetch.mockRejectedValueOnce(new Error("Network offline"));
    const fallback = await store.fetchActiveContracts();
    expect(fallback).toEqual([]);
    expect(store.contractsAvailable).toBe(false);
  });

  it("forwards contract request and updates matching recurring vendor row", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            source_reference_id: "SERMS-REC-123",
            vendor_name: "Metro Calibration Services",
            tin_number: "111-222-333-000",
            occurrence_count: 4,
            total_spend: 80000,
            period_start: "2026-01-01",
            period_end: "2026-10-31",
            expense_items: [],
            forwarded_request: null,
          },
        ],
      }),
    });

    const store = useCmsStore();
    await store.fetchRecurringExpenses();

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 5,
          source_reference_id: "SERMS-REC-123",
          contract_code: "CRQ-2026-077",
          status: "Pending",
          supporting_expense_summary: "4 recurring purchases totaling PHP 80,000.00",
          forwarded_at: "2026-11-14T10:00:00Z",
        },
      }),
    });

    const created = await store.forwardContractRequest({
      source_reference_id: "SERMS-REC-123",
      vendor_name: "Metro Calibration Services",
    });

    expect(created.contract_code).toBe("CRQ-2026-077");
    expect(store.recurringVendors[0].forwarded_request.contract_code).toBe("CRQ-2026-077");
  });
});
