// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CmsRecurringExpensesPanel from "./CmsRecurringExpensesPanel.vue";

const mockApiFetch = vi.fn();
vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

describe("CmsRecurringExpensesPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("displays recurring vendors with Medium Date period and forwards to CMS", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            source_reference_id: "SERMS-REC-42",
            vendor_name: "Metro Calibration Services",
            tin_number: "111-222-333-000",
            default_category: "Field Service",
            occurrence_count: 4,
            total_spend: 80000,
            period_start: "2026-01-01",
            period_end: "2026-10-31",
            expense_items: [{ date: "2026-02-10", amount: 20000, reference: "RMB-101" }],
            forwarded_request: null,
          },
        ],
      }),
    });

    const wrapper = mount(CmsRecurringExpensesPanel, {
      global: {
        stubs: { StatusBadge: true },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Metro Calibration Services");
    expect(wrapper.text()).toContain("4x");
    expect(wrapper.text()).toContain("Jan 1, 2026");

    const forwardBtn = wrapper.findAll("button").find((b) => b.text().includes("Forward to CMS"));
    await forwardBtn.trigger("click");

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 77,
          source_reference_id: "SERMS-REC-42",
          contract_code: "CRQ-2026-077",
          status: "Pending",
          supporting_expense_summary: "4 recurring purchases totaling PHP 80,000.00",
          forwarded_at: "2026-11-14T10:00:00Z",
        },
      }),
    });

    const confirmBtn = wrapper.findAll("button").find((b) => b.text().includes("Confirm & Forward"));
    await confirmBtn.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("CRQ-2026-077");
    expect(wrapper.text()).toContain("4 recurring purchases totaling PHP 80,000.00");
  });
});
