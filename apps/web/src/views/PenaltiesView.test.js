// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PenaltiesView from "@/views/PenaltiesView.vue";

const pushMock = vi.fn();
const addToastMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    addToast: addToastMock,
  }),
}));

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => apiFetchMock(...args),
}));

function makeMeResponse(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      data: {
        active_strikes_count: 3,
        strike_limit: 3,
        standing: "penalized",
        is_penalized: true,
        current_cycle: 1,
        active_strikes: [
          {
            id: 21,
            user_id: 5,
            cycle_number: 1,
            source_module: "liquidation",
            source_id: 44,
            source_reference: "LQ-2026-044",
            trigger_type: "liquidation_overdue",
            reason: "Liquidation past expected liquidation date",
            status: "active",
            issued_by_name: "System",
            redirect_path: "/liquidations?view=44",
            created_at: "2026-11-25T10:00:00Z",
          },
        ],
        history_strikes: [
          {
            id: 10,
            cycle_number: 0,
            source_module: "cash_advance",
            trigger_type: "ca_unsigned_overdue",
            reason: "Unsigned CA resolved",
            status: "waived",
            resolution_note: "System delay verified",
            resolved_at: "2026-10-14T09:00:00Z",
            created_at: "2026-10-10T09:00:00Z",
          },
        ],
        appeals: [],
        pending_appeal: null,
        overdue_monetary_penalties: {
          total_amount: 1250,
          records: [
            {
              id: 1,
              cash_advance_id: 18,
              reference_no: "CA-2026-018",
              days_overdue: 25,
              penalty_amount: 1250,
              created_at: "2026-11-20T00:00:00Z",
            },
          ],
        },
        ...overrides,
      },
    }),
  };
}

describe("PenaltiesView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pushMock.mockReset();
    addToastMock.mockReset();
    apiFetchMock.mockReset();
  });

  it("renders standing counter, active strikes redirect, monetary charges, and resolved history with Medium Dates", async () => {
    apiFetchMock.mockResolvedValueOnce(makeMeResponse());

    const wrapper = mount(PenaltiesView);
    await flushPromises();

    expect(wrapper.find('[data-testid="standing-counter"]').text()).toBe("3/3");
    expect(wrapper.find('[data-testid="monetary-total"]').text()).toBe("PHP 1,250.00");
    expect(wrapper.text()).toContain("LQ-2026-044");
    expect(wrapper.text()).toContain("CA-2026-018");
    expect(wrapper.text()).toContain("Nov 25, 2026");
    expect(wrapper.text()).toContain("Oct 14, 2026");

    const redirectButtons = wrapper
      .findAll("button")
      .filter((b) => b.text().includes("Go to Record"));
    expect(redirectButtons.length).toBeGreaterThan(0);
    await redirectButtons[0].trigger("click");
    expect(pushMock).toHaveBeenCalledWith("/liquidations?view=44");
  });

  it("validates appeal form inputs and submits multipart FormData when valid", async () => {
    apiFetchMock
      .mockResolvedValueOnce(makeMeResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 99,
            status: "pending",
          },
        }),
      })
      .mockResolvedValueOnce(
        makeMeResponse({
          pending_appeal: {
            id: 99,
            explanation: "I sincerely apologize and have completed liquidation.",
            letter_file_name: "appeal.pdf",
            status: "pending",
            created_at: "2026-11-25T12:00:00Z",
          },
        }),
      );

    const wrapper = mount(PenaltiesView);
    await flushPromises();

    // Submit empty form to trigger validation
    await wrapper.find("form").trigger("submit");
    expect(wrapper.text()).toContain("Explanation must be at least 10 characters.");
    expect(wrapper.text()).toContain("Supporting letter file");
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    // Enter valid explanation
    await wrapper
      .find("#appeal-explanation")
      .setValue("I sincerely apologize and have completed liquidation.");

    // Reject oversized file (> 2MB)
    const bigFile = new File([new Uint8Array(2 * 1024 * 1024 + 5)], "big.pdf", {
      type: "application/pdf",
    });
    const fileInput = wrapper.find("#appeal-letter-file").element;
    Object.defineProperty(fileInput, "files", { value: [bigFile], configurable: true });
    await wrapper.find("#appeal-letter-file").trigger("change");
    expect(wrapper.text()).toContain("2MB maximum size limit");

    // Provide valid PDF file
    const validFile = new File(["pdf-content"], "appeal.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [validFile], configurable: true });
    await wrapper.find("#appeal-letter-file").trigger("change");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/serms/penalties/appeals",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );

    const submittedBody = apiFetchMock.mock.calls[1][1].body;
    expect(submittedBody.has("letter_type")).toBe(false);
    expect(submittedBody.get("explanation")).toBe(
      "I sincerely apologize and have completed liquidation.",
    );
    expect(wrapper.find('[data-testid="pending-appeal-panel"]').exists()).toBe(true);
  });

  it("shows rejected comment and allows resubmission when previous appeal was rejected", async () => {
    apiFetchMock.mockResolvedValueOnce(
      makeMeResponse({
        pending_appeal: null,
        appeals: [
          {
            id: 50,
            explanation: "Old explanation",
            status: "rejected",
            reviewed_by_name: "Finance Admin",
            reviewed_at: "2026-11-24T10:00:00Z",
            admin_comment: "Please attach the signed supervisor endorsement.",
            created_at: "2026-11-23T10:00:00Z",
          },
        ],
      }),
    );

    const wrapper = mount(PenaltiesView);
    await flushPromises();

    const rejectedNotice = wrapper.find('[data-testid="rejected-appeal-notice"]');
    expect(rejectedNotice.exists()).toBe(true);
    expect(rejectedNotice.text()).toContain("Please attach the signed supervisor endorsement.");
    expect(rejectedNotice.text()).toContain("Nov 24, 2026");
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it("shows empty resolved history message when only a pending appeal exists", async () => {
    apiFetchMock.mockResolvedValueOnce(
      makeMeResponse({
        history_strikes: [],
        pending_appeal: {
          id: 60,
          explanation: "Pending appeal explanation",
          status: "pending",
          created_at: "2026-11-25T10:00:00Z",
        },
        appeals: [
          {
            id: 60,
            explanation: "Pending appeal explanation",
            status: "pending",
            created_at: "2026-11-25T10:00:00Z",
          },
        ],
      }),
    );

    const wrapper = mount(PenaltiesView);
    await flushPromises();

    expect(wrapper.text()).toContain("No resolved strikes or reviewed appeals on record yet.");
  });
});
