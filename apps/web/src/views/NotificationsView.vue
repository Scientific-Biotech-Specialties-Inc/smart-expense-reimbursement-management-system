<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useNotificationStore } from "@/stores/notification";
import BaseButton from "@/components/base/BaseButton.vue";
import {
  CheckCheck,
  AlertTriangle,
  CheckCircle,
  Info,
  AlertCircle,
  Clock,
  Settings,
} from "lucide-vue-next";

const store = useNotificationStore();
const router = useRouter();

const FILTERS = [
  { label: "All", value: "All" },
  { label: "Unread", value: "Unread" },
  { label: "Reimbursements", value: "Reimbursement" },
  { label: "Cash Advances", value: "Cash Advance" },
  { label: "Liquidations", value: "Liquidation" },
  { label: "My Expense", value: "My Expense" },
];

const activeFilter = ref("All");
const isMarkingAllRead = ref(false);

async function handleMarkAllRead() {
  if (isMarkingAllRead.value) return;
  isMarkingAllRead.value = true;
  try {
    await store.markAllRead();
  } finally {
    isMarkingAllRead.value = false;
  }
}

const iconMap = {
  warning: { icon: AlertTriangle, cls: "text-amber-600 border-amber-200 bg-amber-50" },
  success: { icon: CheckCircle, cls: "text-emerald-600 border-emerald-200 bg-emerald-50" },
  danger: { icon: AlertCircle, cls: "text-rose-600 border-rose-200 bg-rose-50" },
  info: { icon: Info, cls: "text-primary border-primary/20 bg-primary/5" },
};

const filteredNotifications = computed(() => {
  return store.alerts.filter((item) => {
    if (activeFilter.value === "All") return true;
    if (activeFilter.value === "Unread") return !item.read;
    return String(item.module || "").toLowerCase() === activeFilter.value.toLowerCase();
  });
});

async function handleOpenNotification(alert) {
  try {
    if (!alert.read) {
      await store.markRead(alert.id);
    }
  } catch {
    return;
  }

  if (alert.recordLink) {
    router.push(alert.recordLink);
  }
}

async function handleMarkReadOnly(alert) {
  try {
    await store.markRead(alert.id);
  } catch {
    // Handled by store toast
  }
}

onMounted(() => {
  store.fetchNotifications();
});
</script>

<template>
  <div class="flex flex-col gap-6 max-w-5xl mx-auto font-sans">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-page-title">Notifications</h1>
        <p class="mt-1 text-sm text-slate-500">
          Review your full notification history across all modules.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <BaseButton
          data-testid="page-notification-settings"
          variant="secondary"
          size="sm"
          @click="router.push('/settings/notifications')"
        >
          <Settings class="w-4 h-4 mr-1.5" />
          Notification Settings
        </BaseButton>

        <BaseButton
          v-if="store.unreadCount > 0"
          data-testid="page-mark-all-read"
          variant="secondary"
          size="sm"
          :loading="isMarkingAllRead"
          :disabled="isMarkingAllRead"
          @click="handleMarkAllRead"
        >
          <CheckCheck class="w-4 h-4 mr-1.5" />
          Mark all as read
        </BaseButton>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
      <button
        v-for="tab in FILTERS"
        :key="tab.label"
        type="button"
        :data-testid="`filter-${tab.label}`"
        :class="[
          'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
          activeFilter === tab.value
            ? 'bg-primary text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100',
        ]"
        @click="activeFilter = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Notifications List Card -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
      <div
        v-if="filteredNotifications.length === 0"
        class="py-16 px-4 flex flex-col items-center justify-center text-center"
      >
        <Clock class="w-8 h-8 text-slate-300 mb-3" />
        <p class="text-sm font-semibold text-slate-600">No notifications found</p>
        <p class="text-xs text-slate-400 mt-1">
          There are no notifications matching the selected filter.
        </p>
      </div>

      <div
        v-for="alert in filteredNotifications"
        :key="alert.id"
        :data-testid="`page-notif-${alert.id}`"
        :class="[
          'flex items-start justify-between gap-4 px-5 py-4 cursor-pointer transition-colors border-l-2',
          alert.read
            ? 'bg-white border-transparent hover:bg-slate-50'
            : 'bg-primary/[0.03] border-primary hover:bg-primary/[0.06]',
        ]"
        @click="handleOpenNotification(alert)"
      >
        <div class="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            :class="[
              'w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5',
              (iconMap[alert.severity || alert.type] || iconMap.info).cls,
            ]"
          >
            <component
              :is="(iconMap[alert.severity || alert.type] || iconMap.info).icon"
              class="w-4 h-4"
            />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {{ alert.module }}
              </span>
              <h3 class="text-sm font-bold text-slate-800">
                {{ alert.title }}
              </h3>
              <span
                v-if="!alert.read"
                class="w-2 h-2 rounded-full bg-primary inline-block"
                title="Unread"
              />
            </div>
            <p class="text-sm text-slate-600 leading-relaxed">
              {{ alert.message }}
            </p>
            <span class="text-xs font-mono text-slate-400 mt-1.5 inline-block">
              {{ alert.time }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0" @click.stop>
          <button
            v-if="!alert.read"
            type="button"
            :data-testid="`mark-read-${alert.id}`"
            class="text-xs font-semibold text-primary hover:underline px-2 py-1"
            @click="handleMarkReadOnly(alert)"
          >
            Mark as read
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
