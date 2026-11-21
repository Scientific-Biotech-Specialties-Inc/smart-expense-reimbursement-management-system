// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TsTicketSelect from "./TsTicketSelect.vue";

const mockApiFetch = vi.fn();
vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

describe("TsTicketSelect", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads tickets and emits update:ticketId and update:ticketNumber on selection and clear", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        available: true,
        data: [
          {
            ticket_id: 42,
            ticket_number: "TKT-0042",
            title: "Centrifuge calibration",
            status: "Pending Evaluation",
            department: "Field Service",
            assignee_name: "Juan Dela Cruz",
          },
          {
            ticket_id: 43,
            ticket_number: "TKT-0043",
            title: "PCR thermal cycler repair",
            status: "Resolved",
            department: "Engineering",
            assignee_name: "Maria Santos",
          },
        ],
      }),
    });

    const wrapper = mount(TsTicketSelect, {
      props: { ticketId: null, ticketNumber: "" },
    });
    await flushPromises();

    const select = wrapper.find("#ts-ticket-select");
    expect(select.exists()).toBe(true);
    expect(select.text()).toContain("TKT-0042 — Centrifuge calibration (Pending Evaluation)");
    expect(select.text()).toContain("TKT-0043 — PCR thermal cycler repair (Resolved)");

    await select.setValue("42");
    expect(wrapper.emitted("update:ticketId")?.[0]).toEqual([42]);
    expect(wrapper.emitted("update:ticketNumber")?.[0]).toEqual(["TKT-0042"]);

    // Filter by TKT-0043
    const filterInput = wrapper.find('input[aria-label="Filter TS tickets"]');
    await filterInput.setValue("PCR");
    expect(select.text()).toContain("TKT-0043");
    expect(select.text()).not.toContain("TKT-0042");

    // Clear when prop is bound
    await wrapper.setProps({ ticketId: 42, ticketNumber: "TKT-0042" });
    const clearBtn = wrapper.find('button[aria-label="Clear selected TS ticket"]');
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger("click");
    expect(wrapper.emitted("update:ticketId")?.[1]).toEqual([null]);
    expect(wrapper.emitted("update:ticketNumber")?.[1]).toEqual([""]);
  });

  it("preserves prefilled ticket option when not in fetched catalog or when TS is unavailable", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ available: false, data: [] }),
    });

    const wrapper = mount(TsTicketSelect, {
      props: { ticketId: 99, ticketNumber: "TKT-0099" },
    });
    await flushPromises();

    const select = wrapper.find("#ts-ticket-select");
    expect(select.text()).toContain("TKT-0099");
    expect(wrapper.text()).toContain("Ticketing system (TS) is currently unavailable");
  });

  it("refreshes ticket list when Refresh button is clicked", async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: true, data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          available: true,
          data: [
            {
              ticket_id: 77,
              ticket_number: "TKT-0077",
              title: "Autoclave seal replacement",
              status: "Closed",
            },
          ],
        }),
      });

    const wrapper = mount(TsTicketSelect);
    await flushPromises();

    const refreshBtn = wrapper.find('button[aria-label="Refresh TS tickets"]');
    await refreshBtn.trigger("click");
    await flushPromises();

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(wrapper.find("#ts-ticket-select").text()).toContain("TKT-0077");
  });
});
