// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TsTicketsPanel from "./TsTicketsPanel.vue";

const mockApiFetch = vi.fn();
const mockPush = vi.fn();

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const sampleTickets = [
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
  {
    ticket_id: 43,
    ticket_number: "TKT-0043",
    title: "Analyzer warranty visit",
    status: "Resolved",
    priority: "Medium",
    assignee_name: "Maria Santos",
    assignee_email: "maria@sbsi.com",
    department: "Engineering",
    created_at: "2026-11-18T08:00:00Z",
    updated_at: "2026-11-19T12:00:00Z",
    reimbursement: {
      reimbursement_id: 105,
      reference_no: "RMB-2026-00105",
      status: "approved",
      amount: 3250.5,
    },
  },
  {
    ticket_id: 44,
    ticket_number: "TKT-0044",
    title: "Lab chiller emergency repair",
    status: "Closed",
    priority: "Urgent",
    assignee_name: "Carlo Gomez",
    assignee_email: "carlo@sbsi.com",
    department: "Operations",
    created_at: "2026-11-15T14:30:00Z",
    updated_at: "2026-11-16T09:00:00Z",
    reimbursement: {
      reimbursement_id: 88,
      reference_no: "RMB-2026-00088",
      status: "rejected",
      amount: 1400,
    },
  },
];

describe("TsTicketsPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders TS tickets with Medium Date Format, status badges, linked reimbursement info, and row actions", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ available: true, data: sampleTickets }),
    });

    const wrapper = mount(TsTicketsPanel);
    await flushPromises();

    expect(wrapper.text()).toContain("TKT-0042");
    expect(wrapper.text()).toContain("Centrifuge field calibration travel");
    expect(wrapper.text()).toContain("Pending Evaluation");
    expect(wrapper.text()).toContain("Nov 20, 2026");

    expect(wrapper.text()).toContain("TKT-0043");
    expect(wrapper.text()).toContain("RMB-2026-00105");
    expect(wrapper.text()).toContain("Approved");
    expect(wrapper.text()).toContain("Nov 18, 2026");

    // Unlinked ticket navigates to /reimbursements/new with ticket query params
    const row42 = wrapper.find('[data-testid="ts-ticket-row-42"]');
    const createBtn42 = row42.findAll("button").find((b) => b.text().includes("Create Reimbursement"));
    expect(createBtn42).toBeDefined();
    await createBtn42.trigger("click");
    expect(mockPush).toHaveBeenCalledWith({
      path: "/reimbursements/new",
      query: { ticket_id: "42", ticket_number: "TKT-0042" },
    });

    // Active linked reimbursement navigates to /reimbursements?view={id}
    const row43 = wrapper.find('[data-testid="ts-ticket-row-43"]');
    const viewBtn43 = row43.findAll("button").find((b) => b.text().includes("View Reimbursement"));
    expect(viewBtn43).toBeDefined();
    expect(row43.findAll("button").find((b) => b.text().includes("Create Reimbursement"))).toBeUndefined();
    await viewBtn43.trigger("click");
    expect(mockPush).toHaveBeenCalledWith({
      path: "/reimbursements",
      query: { view: "105" },
    });

    // Terminally rejected reimbursement allows creating a new claim AND viewing rejected claim
    const row44 = wrapper.find('[data-testid="ts-ticket-row-44"]');
    const createBtn44 = row44.findAll("button").find((b) => b.text().includes("Create Reimbursement"));
    const viewRejected44 = row44.findAll("button").find((b) => b.text().includes("View"));
    expect(createBtn44).toBeDefined();
    expect(viewRejected44).toBeDefined();
    await createBtn44.trigger("click");
    expect(mockPush).toHaveBeenCalledWith({
      path: "/reimbursements/new",
      query: { ticket_id: "44", ticket_number: "TKT-0044" },
    });
  });

  it("filters tickets by search bar and status dropdown, and refreshes via BaseButton", async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: true, data: sampleTickets }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: true, data: [sampleTickets[1]] }),
      });

    const wrapper = mount(TsTicketsPanel);
    await flushPromises();

    const searchInput = wrapper.find('input[aria-label="Search TS tickets"]');
    await searchInput.setValue("Analyzer");
    expect(wrapper.text()).toContain("TKT-0043");
    expect(wrapper.text()).not.toContain("TKT-0042");

    await searchInput.setValue("");
    const statusSelect = wrapper.find('select[aria-label="Filter tickets by status"]');
    await statusSelect.setValue("Closed");
    expect(wrapper.text()).toContain("TKT-0044");
    expect(wrapper.text()).not.toContain("TKT-0042");

    const refreshBtn = wrapper.findAll("button").find((b) => b.text().includes("Refresh"));
    expect(refreshBtn).toBeDefined();
    await refreshBtn.trigger("click");
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("renders loading skeleton while fetching and empty state or TS-unavailable banner cleanly", async () => {
    let resolveFetch;
    mockApiFetch.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const wrapper = mount(TsTicketsPanel);
    await flushPromises();

    expect(wrapper.find('[data-testid="ts-tickets-skeleton"]').exists()).toBe(true);

    resolveFetch({
      ok: true,
      json: async () => ({
        available: false,
        data: [],
        error: "TS gateway unreachable",
      }),
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="ts-tickets-skeleton"]').exists()).toBe(false);
    const alertBanner = wrapper.find('[role="alert"]');
    expect(alertBanner.exists()).toBe(true);
    expect(alertBanner.text()).toContain("TS gateway unreachable");

    // Now simulate available=true with empty data
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ available: true, data: [] }),
    });
    const refreshBtn = wrapper.findAll("button").find((b) => b.text().includes("Refresh"));
    await refreshBtn.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("No support tickets found");
  });
});
