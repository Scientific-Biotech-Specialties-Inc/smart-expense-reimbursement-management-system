// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NotificationPanel from "./NotificationPanel.vue";
import { useNotificationStore } from "@/stores/notification";

const mockPush = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe("NotificationPanel (Top-Bar Dropdown)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders latest notifications, highlights unread, routes on click, and supports Mark all as read without an X icon", async () => {
    const store = useNotificationStore();
    store.alerts = [
      {
        id: 1,
        type: "reimbursement_submitted",
        severity: "info",
        module: "Reimbursement",
        title: "Reimbursement Submitted",
        message: "Your reimbursement of ₱4,500.10 was submitted.",
        recordLink: "/reimbursements?view=12",
        read: false,
        time: "Oct 22, 2026",
      },
    ];
    vi.spyOn(store, "markRead").mockResolvedValue();
    vi.spyOn(store, "markAllRead").mockResolvedValue();

    const wrapper = mount(NotificationPanel, {
      props: { open: true },
    });

    expect(wrapper.text()).toContain("Reimbursement Submitted");
    expect(wrapper.text()).toContain("Your reimbursement of ₱4,500.10 was submitted.");
    expect(wrapper.text()).toContain("View all notifications");
    expect(wrapper.text()).toContain("Mark all as read");

    // Verify X button is removed
    expect(wrapper.find(".lucide-x").exists()).toBe(false);

    // Click Mark all as read
    const markAllBtn = wrapper.find("[data-testid='mark-all-read-btn']");
    expect(markAllBtn.attributes("disabled")).toBeUndefined();
    await markAllBtn.trigger("click");
    expect(store.markAllRead).toHaveBeenCalled();

    // Notification click
    await wrapper.find("[data-testid='notif-item-1']").trigger("click");
    expect(store.markRead).toHaveBeenCalledWith(1);
    expect(mockPush).toHaveBeenCalledWith("/reimbursements?view=12");

    // View all click
    await wrapper.find("[data-testid='view-all-notifications']").trigger("click");
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  it("disables Mark all as read when there are no unread notifications", () => {
    const store = useNotificationStore();
    store.alerts = [
      {
        id: 2,
        type: "info",
        module: "General",
        title: "Already Read",
        message: "Old notice",
        read: true,
      },
    ];

    const wrapper = mount(NotificationPanel, {
      props: { open: true },
    });

    const markAllBtn = wrapper.find("[data-testid='mark-all-read-btn']");
    expect(markAllBtn.exists()).toBe(true);
    expect(markAllBtn.attributes("disabled")).toBeDefined();
  });

  it("filters notifications when switching between All and Unread tabs and hides the Settings button", async () => {
    const store = useNotificationStore();
    store.alerts = [
      {
        id: 1,
        type: "info",
        module: "Reimbursement",
        title: "Unread Notice",
        message: "Still unread",
        read: false,
        time: "Nov 15, 2026",
      },
      {
        id: 2,
        type: "success",
        module: "General",
        title: "Read Notice",
        message: "Already seen",
        read: true,
        time: "Nov 14, 2026",
      },
    ];

    const wrapper = mount(NotificationPanel, {
      props: { open: true },
    });

    // Settings button should be removed
    expect(wrapper.find("[data-testid='panel-notification-settings']").exists()).toBe(false);

    const allTab = wrapper.find("[data-testid='notif-tab-all']");
    const unreadTab = wrapper.find("[data-testid='notif-tab-unread']");
    expect(allTab.exists()).toBe(true);
    expect(unreadTab.exists()).toBe(true);
    expect(allTab.attributes("aria-selected")).toBe("true");
    expect(unreadTab.attributes("aria-selected")).toBe("false");

    // All tab shows both
    expect(wrapper.find("[data-testid='notif-item-1']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='notif-item-2']").exists()).toBe(true);

    // Switch to Unread tab
    await unreadTab.trigger("click");
    expect(allTab.attributes("aria-selected")).toBe("false");
    expect(unreadTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.find("[data-testid='notif-item-1']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='notif-item-2']").exists()).toBe(false);
  });

  it("shows empty unread message on the Unread tab when all notifications are read", async () => {
    const store = useNotificationStore();
    store.alerts = [
      {
        id: 10,
        type: "info",
        module: "General",
        title: "Read Notice",
        message: "Already seen",
        read: true,
        time: "Nov 14, 2026",
      },
    ];

    const wrapper = mount(NotificationPanel, {
      props: { open: true },
    });

    await wrapper.find("[data-testid='notif-tab-unread']").trigger("click");
    expect(wrapper.text()).toContain("No unread notifications");
  });
});
