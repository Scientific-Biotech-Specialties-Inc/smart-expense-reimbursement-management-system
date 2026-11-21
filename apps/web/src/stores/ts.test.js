// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTsStore } from "./ts";

const mockApiFetch = vi.fn();
vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

describe("useTsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("fetches TS tickets with search and status query parameters", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        available: true,
        data: [
          {
            ticket_id: 42,
            ticket_number: "TKT-0042",
            title: "Centrifuge field calibration travel",
            status: "Pending Evaluation",
            priority: "High",
            assignee_name: "Juan Dela Cruz",
            assignee_email: "juan@sbsi.com",
            department: "Field Service",
            created_at: "2026-11-20T09:00:00Z",
            updated_at: "2026-11-21T10:00:00Z",
            reimbursement: null,
          },
        ],
      }),
    });

    const store = useTsStore();
    const promise = store.fetchTickets("TKT-0042", "Pending Evaluation", 50);
    expect(store.loadingTickets).toBe(true);

    const list = await promise;
    expect(store.loadingTickets).toBe(false);
    expect(list).toHaveLength(1);
    expect(store.tickets).toHaveLength(1);
    expect(store.tickets[0].ticket_number).toBe("TKT-0042");
    expect(store.ticketsAvailable).toBe(true);
    expect(store.ticketsError).toBe("");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/serms/ts/tickets?limit=50&search=TKT-0042&status=Pending+Evaluation",
      { credentials: "include" },
    );
  });

  it("marks ticketsAvailable=false when TS returns available=false", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        available: false,
        data: [],
        error: "TS service timeout",
      }),
    });

    const store = useTsStore();
    const list = await store.fetchTickets();
    expect(list).toEqual([]);
    expect(store.ticketsAvailable).toBe(false);
    expect(store.ticketsError).toBe("TS service timeout");
  });

  it("marks ticketsAvailable=false on HTTP error or network rejection", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ message: "Service unavailable" }),
    });

    const store = useTsStore();
    const httpFallback = await store.fetchTickets();
    expect(httpFallback).toEqual([]);
    expect(store.ticketsAvailable).toBe(false);
    expect(store.ticketsError).toBe("Service unavailable");

    mockApiFetch.mockRejectedValueOnce(new Error("Network offline"));
    const netFallback = await store.fetchTickets();
    expect(netFallback).toEqual([]);
    expect(store.ticketsAvailable).toBe(false);
    expect(store.ticketsError).toBe("Network offline");
    expect(store.loadingTickets).toBe(false);
  });
});
