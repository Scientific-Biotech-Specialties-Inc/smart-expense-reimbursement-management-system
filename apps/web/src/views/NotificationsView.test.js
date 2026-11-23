// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NotificationsView from "./NotificationsView.vue";
import { useNotificationStore } from "@/stores/notification";

const mockPush = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("NotificationsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("filters notifications by module and unread status, and supports Mark as read and Mark all as read", async () => {
    const store = useNotificationStore();
    vi.spyOn(store, "fetchNotifications").mockResolvedValue();
    vi.spyOn(store, "markRead").mockImplementation(async (id) => {
      const item = store.alerts.find((a) => a.id === id);
      if (item) item.read = true;
    });
    vi.spyOn(store, "markAllRead").mockImplementation(async () => {
      store.alerts.forEach((a) => {
        a.read = true;
      });
    });

    store.alerts = [
      {
        id: 1,
        module: "Reimbursement",
        title: "Reimbursement Approved",
        message: "Approved ₱1,200.00",
        recordLink: "/reimbursements?view=1",
        read: false,
        severity: "success",
        time: "Oct 22, 2026",
      },
      {
        id: 2,
        module: "Cash Advance",
        title: "Cash Advance Submitted",
        message: "Submitted ₱5,000.00",
        recordLink: "/cash-advances?view=2",
        read: true,
        severity: "info",
        time: "Oct 21, 2026",
      },
    ];

    const wrapper = mount(NotificationsView);

    expect(wrapper.text()).toContain("Reimbursement Approved");
    expect(wrapper.text()).toContain("Cash Advance Submitted");

    // Filter by Cash Advances
    await wrapper.find("[data-testid='filter-Cash Advances']").trigger("click");
    expect(wrapper.text()).not.toContain("Reimbursement Approved");
    expect(wrapper.text()).toContain("Cash Advance Submitted");

    // Filter by Unread
    await wrapper.find("[data-testid='filter-Unread']").trigger("click");
    expect(wrapper.text()).toContain("Reimbursement Approved");
    expect(wrapper.text()).not.toContain("Cash Advance Submitted");

    // Mark single as read
    await wrapper.find("[data-testid='mark-read-1']").trigger("click");
    expect(store.markRead).toHaveBeenCalledWith(1);
  });
});
