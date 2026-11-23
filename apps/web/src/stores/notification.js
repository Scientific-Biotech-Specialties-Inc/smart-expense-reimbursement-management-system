import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { apiFetch } from "@/utils/apiFetch";
import { useToast } from "@/composables/useToast";
import { formatDate } from "@/utils/formatters";

function inferSeverity(type = "") {
  const lower = String(type || "").toLowerCase();
  if (lower.includes("rejected") || lower.includes("overdue") || lower.includes("cancelled")) {
    return "danger";
  }
  if (
    lower.includes("revised") ||
    lower.includes("due_soon") ||
    lower.includes("due_today") ||
    lower.includes("flagged")
  ) {
    return "warning";
  }
  if (
    lower.includes("approved") ||
    lower.includes("granted") ||
    lower.includes("disbursed") ||
    lower.includes("settled") ||
    lower.includes("acknowledged") ||
    lower.includes("processed")
  ) {
    return "success";
  }
  return "info";
}

const DEFAULT_SETTINGS = () => ({
  email_enabled: true,
  request_submissions: true,
  status_updates: true,
  admin_comments: true,
  near_deadline_reminders: true,
  overdue_alerts: true,
  admin_new_requests: true,
  admin_employee_updates: true,
  admin_overdue_liquidations: true,
});

function normalizeNotification(raw) {
  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? null,
    type: raw.type || "info",
    severity: raw.severity || inferSeverity(raw.type),
    module: raw.module || "General",
    title: raw.title || raw.module || "Notification",
    message: raw.message || "",
    recordType: raw.record_type ?? raw.recordType ?? null,
    recordId: raw.record_id ?? raw.recordId ?? null,
    recordLink: raw.record_link ?? raw.recordLink ?? null,
    read: Boolean(raw.is_read ?? raw.read ?? false),
    time: raw.time || (raw.created_at ? formatDate(raw.created_at) : "Just now"),
    createdAt: raw.created_at || raw.createdAt || null,
    metadata: raw.metadata || null,
  };
}

export const useNotificationStore = defineStore("notification", () => {
  const alerts = ref([]);
  const isLoading = ref(false);
  let pollTimer = null;

  const unreadCount = computed(() => alerts.value.filter((a) => !a.read).length);

  async function fetchNotifications(params = {}) {
    const { addToast } = useToast();
    const query = new URLSearchParams();
    if (params.module && params.module !== "All") {
      query.set("module", params.module);
    }
    if (params.unread) {
      query.set("unread", "1");
    }
    if (params.limit) {
      query.set("limit", String(params.limit));
    }

    const qs = query.toString();
    const url = `/api/serms/notifications${qs ? `?${qs}` : ""}`;

    isLoading.value = true;
    try {
      const res = await apiFetch(url);
      if (res.status === 403) {
        addToast({
          message: "Access denied. You are not allowed to view these notifications.",
          type: "error",
        });
        throw new Error("Forbidden (403)");
      }
      if (!res.ok) {
        return alerts.value;
      }
      const payload = await res.json();
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      alerts.value = rows.map(normalizeNotification);
      return alerts.value;
    } finally {
      isLoading.value = false;
    }
  }

  async function markRead(id) {
    const { addToast } = useToast();
    const target = alerts.value.find((a) => a.id === id);
    if (target) {
      target.read = true;
    }

    const res = await apiFetch(`/api/serms/notifications/${id}/read`, {
      method: "PATCH",
    });

    if (res.status === 403) {
      if (target) target.read = false;
      addToast({
        message: "Access denied. You cannot modify another user's notification.",
        type: "error",
      });
      throw new Error("Forbidden (403)");
    }

    if (res.ok) {
      const payload = await res.json();
      if (payload?.data && target) {
        Object.assign(target, normalizeNotification(payload.data));
      }
    }
  }

  async function markAllRead() {
    alerts.value.forEach((a) => {
      a.read = true;
    });
    try {
      await apiFetch("/api/serms/notifications/read-all", {
        method: "POST",
      });
    } catch {
      // Keep optimistic state
    }
  }

  function clearAll() {
    alerts.value = [];
  }

  function startPolling(intervalMs = 30000) {
    stopPolling();
    pollTimer = setInterval(() => {
      fetchNotifications().catch(() => {});
    }, intervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function push(notification) {
    alerts.value.unshift(
      normalizeNotification({
        id: Date.now(),
        is_read: false,
        time: "Just now",
        ...notification,
      }),
    );
  }

  function info(message) {
    push({ type: "info", severity: "info", message });
  }

  function success(message) {
    push({ type: "success", severity: "success", message });
  }

  function warning(message) {
    push({ type: "warning", severity: "warning", message });
  }

  function error(message) {
    push({ type: "danger", severity: "danger", message });
  }

  const settings = ref(DEFAULT_SETTINGS());
  const isSavingSettings = ref(false);

  async function fetchSettings() {
    const res = await apiFetch("/api/serms/notifications/settings");
    if (!res.ok) {
      return settings.value;
    }
    const payload = await res.json();
    if (payload?.data) {
      settings.value = {
        ...DEFAULT_SETTINGS(),
        ...payload.data,
      };
    }
    return settings.value;
  }

  async function saveSettings(updatedSettings) {
    const { addToast } = useToast();
    isSavingSettings.value = true;
    try {
      const res = await apiFetch("/api/serms/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });
      if (!res.ok) {
        addToast({
          message: "Failed to save notification settings.",
          type: "error",
        });
        throw new Error("Failed to save settings");
      }
      const payload = await res.json();
      if (payload?.data) {
        settings.value = {
          ...DEFAULT_SETTINGS(),
          ...payload.data,
        };
      }
      addToast({
        message: payload?.message || "Notification settings saved successfully.",
        type: "success",
      });
      return settings.value;
    } finally {
      isSavingSettings.value = false;
    }
  }

  return {
    alerts,
    unreadCount,
    isLoading,
    settings,
    isSavingSettings,
    fetchSettings,
    saveSettings,
    fetchNotifications,
    markRead,
    markAllRead,
    clearAll,
    startPolling,
    stopPolling,
    push,
    info,
    success,
    warning,
    error,
  };
});
