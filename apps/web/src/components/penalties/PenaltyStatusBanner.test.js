// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PenaltyStatusBanner from "@/components/penalties/PenaltyStatusBanner.vue";
import { usePenaltyStore } from "@/stores/penalty";

const pushMock = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("PenaltyStatusBanner", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pushMock.mockReset();
  });

  it("does not render when employee has 0 active strikes", () => {
    const store = usePenaltyStore();
    store.activeStrikesCount = 0;
    store.isPenalized = false;
    store.activeStrikes = [];

    const wrapper = mount(PenaltyStatusBanner);
    expect(wrapper.find('[data-testid="penalty-status-banner"]').exists()).toBe(false);
  });

  it("renders amber warning banner on 1-2 strikes and navigates via Go to Record", async () => {
    const store = usePenaltyStore();
    store.activeStrikesCount = 2;
    store.strikeLimit = 3;
    store.standing = "warning";
    store.isPenalized = false;
    store.activeStrikes = [
      {
        id: 11,
        source_module: "cash_advance",
        source_reference: "CA-2026-011",
        reason: "Unsigned cash advance past 3-day threshold",
        redirect_path: "/cash-advances?view=11",
        created_at: "2026-11-25T08:00:00Z",
      },
    ];

    const wrapper = mount(PenaltyStatusBanner);
    const banner = wrapper.find('[data-testid="penalty-status-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.classes()).toContain("bg-amber-50");
    expect(wrapper.find('[data-testid="banner-strike-counter"]').text()).toBe("2/3");
    expect(wrapper.text()).toContain("Nov 25, 2026");

    await wrapper.find('[data-testid="go-to-record-11"]').trigger("click");
    expect(pushMock).toHaveBeenCalledWith("/cash-advances?view=11");
  });

  it("renders crimson hold banner on 3 strikes with appeal CTA", async () => {
    const store = usePenaltyStore();
    store.activeStrikesCount = 3;
    store.strikeLimit = 3;
    store.standing = "penalized";
    store.isPenalized = true;
    store.pendingAppeal = null;

    const wrapper = mount(PenaltyStatusBanner);
    const banner = wrapper.find('[data-testid="penalty-status-banner"]');
    expect(banner.classes()).toContain("bg-red-50");
    expect(wrapper.find('[data-testid="banner-strike-counter"]').text()).toBe("3/3");
    expect(wrapper.text()).toContain("New Reimbursements and Cash Advances are paused");

    const cta = wrapper.find('[data-testid="banner-appeal-cta"]');
    expect(cta.text()).toContain("Submit Appeal Letter");
    await cta.trigger("click");
    expect(pushMock).toHaveBeenCalledWith("/penalties");
  });

  it("shows View Pending Appeal CTA when an appeal is pending", () => {
    const store = usePenaltyStore();
    store.activeStrikesCount = 3;
    store.isPenalized = true;
    store.pendingAppeal = { id: 4, status: "pending" };

    const wrapper = mount(PenaltyStatusBanner);
    expect(wrapper.find('[data-testid="banner-appeal-cta"]').text()).toContain("View Pending Appeal");
  });
});
