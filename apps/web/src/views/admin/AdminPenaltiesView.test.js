// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AdminPenaltiesView from "@/views/admin/AdminPenaltiesView.vue";
import { useAuthStore } from "@/stores/auth";

const addToastMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    addToast: addToastMock,
  }),
}));

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => apiFetchMock(...args),
}));

function makeOverviewPayload() {
  return {
    data: {
      kpis: {
        penalized_count: 2,
        pending_appeals_count: 1,
        warning_count: 3,
        resolved_cycles_count: 4,
      },
      pending_appeals: [
        {
          id: 77,
          user_id: 10,
          cycle_number: 1,
          explanation: "Delayed due to field travel connectivity.",
          letter_file_name: "signed-letter.pdf",
          letter_mime_type: "application/pdf",
          letter_url: "https://example.test/signed-letter.pdf",
          status: "pending",
          created_at: "2026-11-25T09:00:00Z",
          user: { id: 10, name: "Juan Dela Cruz", email: "juan@example.com" },
        },
      ],
      standings: [
        {
          user_id: 10,
          name: "Juan Dela Cruz",
          email: "juan@example.com",
          active_strikes_count: 3,
          standing: "penalized",
          current_cycle: 1,
        },
      ],
      employees: [
        {
          id: 10,
          name: "Juan Dela Cruz",
          email: "juan@example.com",
          department: "Operations",
        },
        {
          id: 22,
          name: "Maria ZeroStrike",
          email: "maria@example.com",
          department: "Finance",
        },
      ],
    },
  };
}

function makeStrikesPayload() {
  return {
    data: [
      {
        id: 301,
        user_id: 10,
        user_name: "Juan Dela Cruz",
        source_module: "cash_advance",
        source_id: 55,
        source_reference: "CA-2026-055",
        trigger_type: "ca_unsigned_overdue",
        reason: "Unsigned after 3 days",
        status: "active",
        created_at: "2026-11-24T08:00:00Z",
      },
    ],
  };
}

const mountOptions = {
  global: {
    stubs: {
      BaseModal: {
        props: ["isOpen"],
        template: '<div v-if="isOpen"><slot /></div>',
      },
    },
  },
};

describe("AdminPenaltiesView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    addToastMock.mockReset();
    apiFetchMock.mockReset();

    const auth = useAuthStore();
    auth.user = { id: 1, name: "Admin User", is_admin: true };
  });

  it("loads KPIs, pending appeals, and reviews an appeal with mandatory reject comment & approve reset", async () => {
    apiFetchMock.mockImplementation(async (url, opts = {}) => {
      if (url.startsWith("/api/serms/penalties/admin/overview")) {
        return { ok: true, json: async () => makeOverviewPayload() };
      }
      if (url.startsWith("/api/serms/penalties/admin/strikes") && !opts.method) {
        return { ok: true, json: async () => makeStrikesPayload() };
      }
      if (url === "/api/serms/penalties/admin/appeals/77/review") {
        return { ok: true, json: async () => ({ data: { status: "approved" } }) };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    const wrapper = mount(AdminPenaltiesView, mountOptions);
    await flushPromises();

    const html = wrapper.html();
    expect(html.indexOf("Penalized Employees")).toBeGreaterThan(-1);
    expect(html.indexOf("open-manual-strike-btn")).toBeGreaterThan(
      html.indexOf("Penalized Employees"),
    );

    expect(wrapper.text()).toContain("Juan Dela Cruz");
    expect(wrapper.text()).toContain("Nov 25, 2026");

    await wrapper.find('[data-testid="review-appeal-77"]').trigger("click");
    expect(wrapper.find('[data-testid="appeal-pdf-preview"]').exists()).toBe(true);

    // Reject without comment is blocked client-side
    await wrapper.find('[data-testid="reject-appeal-btn"]').trigger("click");
    expect(wrapper.text()).toContain("rejection comment is required");

    // Approve & Reset to 0 posts decision: 'approve'
    await wrapper.find("#review-comment").setValue("Verified signed letter.");
    await wrapper.find('[data-testid="approve-appeal-btn"]').trigger("click");
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/serms/penalties/admin/appeals/77/review",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decision: "approve", comment: "Verified signed letter." }),
      }),
    );
  });

  it("issues a manual strike by loading user records and submitting payload", async () => {
    apiFetchMock.mockImplementation(async (url, opts = {}) => {
      if (url.startsWith("/api/serms/penalties/admin/overview")) {
        return { ok: true, json: async () => makeOverviewPayload() };
      }
      if (url.startsWith("/api/serms/penalties/admin/strikes") && !opts.method) {
        return { ok: true, json: async () => makeStrikesPayload() };
      }
      if (url === "/api/serms/penalties/admin/users/10/records") {
        return {
          ok: true,
          json: async () => ({
            data: {
              cash_advances: [
                {
                  id: 55,
                  reference_no: "CA-2026-055",
                  status: "disbursed",
                  amount: 5000,
                  created_at: "2026-11-20T00:00:00Z",
                },
              ],
              liquidations: [],
              reimbursements: [],
            },
          }),
        };
      }
      if (url === "/api/serms/penalties/admin/strikes" && opts.method === "POST") {
        return { ok: true, json: async () => ({ data: { id: 400 } }) };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    const wrapper = mount(AdminPenaltiesView, mountOptions);
    await flushPromises();

    await wrapper.find('[data-testid="open-manual-strike-btn"]').trigger("click");
    expect(wrapper.find("#manual-user").text()).toContain("Maria ZeroStrike");
    await wrapper.find("#manual-user").setValue("10");
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith("/api/serms/penalties/admin/users/10/records");
    expect(wrapper.find("#manual-record").text()).toContain("CA-2026-055");

    await wrapper.find("#manual-record").setValue("55");
    await wrapper.find("#manual-reason").setValue("Repeated late liquidation submission");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/serms/penalties/admin/strikes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          user_id: 10,
          source_module: "cash_advance",
          source_id: 55,
          reason: "Repeated late liquidation submission",
        }),
      }),
    );
  });

  it("requires reason and waives an active strike from Strike History tab", async () => {
    apiFetchMock.mockImplementation(async (url, opts = {}) => {
      if (url.startsWith("/api/serms/penalties/admin/overview")) {
        return { ok: true, json: async () => makeOverviewPayload() };
      }
      if (url.startsWith("/api/serms/penalties/admin/strikes") && !opts.method) {
        return { ok: true, json: async () => makeStrikesPayload() };
      }
      if (url === "/api/serms/penalties/admin/strikes/301/waive") {
        return { ok: true, json: async () => ({ data: { status: "waived" } }) };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    const wrapper = mount(AdminPenaltiesView, mountOptions);
    await flushPromises();

    const historyTab = wrapper
      .findAll("button")
      .find((b) => b.text() === "Strike History");
    await historyTab.trigger("click");

    await wrapper.find('[data-testid="waive-strike-301"]').trigger("click");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.text()).toContain("reason is required");

    await wrapper.find("#action-reason").setValue("Approved exception for medical leave");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/serms/penalties/admin/strikes/301/waive",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "Approved exception for medical leave" }),
      }),
    );
  });
});
