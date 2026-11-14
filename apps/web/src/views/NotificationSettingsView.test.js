// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NotificationSettingsView from "./NotificationSettingsView.vue";
import { useAuthStore } from "@/stores/auth";

const mockPush = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ path: "/settings/notifications", query: {} }),
}));

const mockAddToast = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/utils/apiFetch";

describe("NotificationSettingsView.vue (G2-078, G2-079)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders only the 5 employee email toggles when logged in as an employee", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Juan Dela Cruz", role: "employee", is_admin: false };

    apiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        role_scope: "employee",
        data: {
          email_enabled: true,
          request_submissions: true,
          status_updates: true,
          admin_comments: true,
          near_deadline_reminders: true,
          overdue_alerts: true,
          admin_new_requests: true,
          admin_employee_updates: true,
          admin_overdue_liquidations: true,
        },
      }),
    });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    // Employee toggles visible
    expect(wrapper.find('[data-testid="toggle-request_submissions"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-status_updates"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-admin_comments"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-near_deadline_reminders"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-overdue_alerts"]').exists()).toBe(true);

    // Admin toggles NOT visible for employee (G2-078 Criterion 1)
    expect(wrapper.find('[data-testid="toggle-admin_new_requests"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="toggle-admin_employee_updates"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="toggle-admin_overdue_liquidations"]').exists()).toBe(false);
  });

  it("renders only the 3 admin email toggles when logged in as an admin", async () => {
    const auth = useAuthStore();
    auth.user = { id: 2, name: "Maria Admin", role: "admin", department: "Accounting", is_admin: true };

    apiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        role_scope: "admin",
        data: {
          email_enabled: true,
          request_submissions: true,
          status_updates: true,
          admin_comments: true,
          near_deadline_reminders: true,
          overdue_alerts: true,
          admin_new_requests: true,
          admin_employee_updates: true,
          admin_overdue_liquidations: true,
        },
      }),
    });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    // Admin toggles visible
    expect(wrapper.find('[data-testid="toggle-admin_new_requests"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-admin_employee_updates"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-admin_overdue_liquidations"]').exists()).toBe(true);

    // Employee toggles NOT visible for admin
    expect(wrapper.find('[data-testid="toggle-request_submissions"]').exists()).toBe(false);
  });

  it("allows toggling preferences and saving via Save Preferences button with confirmation toast", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Juan Dela Cruz", role: "employee", is_admin: false };

    apiFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          role_scope: "employee",
          data: {
            email_enabled: true,
            request_submissions: true,
            status_updates: true,
            admin_comments: true,
            near_deadline_reminders: true,
            overdue_alerts: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          message: "Notification settings saved successfully.",
          role_scope: "employee",
          data: {
            email_enabled: true,
            request_submissions: false,
            status_updates: true,
            admin_comments: true,
            near_deadline_reminders: true,
            overdue_alerts: true,
          },
        }),
      });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    await wrapper.find('[data-testid="toggle-request_submissions"]').trigger("click");
    await wrapper.find('[data-testid="save-notification-settings"]').trigger("click");
    await flushPromises();

    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/serms/notifications/settings",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"request_submissions":false'),
      }),
    );

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Notification settings saved successfully.",
        type: "success",
      }),
    );
  });

  it("disables individual toggles when master switch is off and preserves their value", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Juan Dela Cruz", role: "employee", is_admin: false };

    apiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        role_scope: "employee",
        data: {
          email_enabled: true,
          request_submissions: true,
          status_updates: true,
          admin_comments: true,
          near_deadline_reminders: true,
          overdue_alerts: true,
        },
      }),
    });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    // Turn master switch off
    await wrapper.find('[data-testid="toggle-email_enabled"]').trigger("click");

    const reqToggle = wrapper.find('[data-testid="toggle-request_submissions"]');
    expect(reqToggle.attributes("disabled")).toBeDefined();

    // Clicking individual toggle while master switch is off does NOT alter its value
    await reqToggle.trigger("click");
    expect(reqToggle.attributes("aria-checked")).toBe("false"); // disabled master switch means inactive

    // Turn master switch back on
    await wrapper.find('[data-testid="toggle-email_enabled"]').trigger("click");
    expect(reqToggle.attributes("aria-checked")).toBe("true"); // preserved state
  });

  it("navigates back to /notifications when back button is clicked", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Juan Dela Cruz", role: "employee", is_admin: false };

    apiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        role_scope: "employee",
        data: { email_enabled: true },
      }),
    });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    const backBtn = wrapper.find("button");
    await backBtn.trigger("click");
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  it("handles save failure gracefully with error toast", async () => {
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Juan Dela Cruz", role: "employee", is_admin: false };

    apiFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          role_scope: "employee",
          data: { email_enabled: true },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: "Internal Server Error" }),
      });

    const wrapper = mount(NotificationSettingsView);
    await flushPromises();

    await wrapper.find('[data-testid="save-notification-settings"]').trigger("click");
    await flushPromises();

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
      }),
    );
  });
});
