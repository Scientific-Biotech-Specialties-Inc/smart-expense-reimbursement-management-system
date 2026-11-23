<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  Info,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-vue-next";
import { useNotificationStore } from "@/stores/notification";

defineProps({ open: Boolean });
const emit = defineEmits(["close"]);

const store = useNotificationStore();
const router = useRouter();

const activeTab = ref("all");
const unread = computed(() => store.unreadCount);
const latestAlerts = computed(() => {
  const list =
    activeTab.value === "unread"
      ? store.alerts.filter((a) => !a.read)
      : store.alerts;
  return list.slice(0, 8);
});

const iconMap = {
  warning: { icon: AlertTriangle, cls: "text-amber-600 border-amber-200 bg-amber-50" },
  success: { icon: CheckCircle, cls: "text-emerald-600 border-emerald-200 bg-emerald-50" },
  danger: { icon: AlertCircle, cls: "text-rose-600 border-rose-200 bg-rose-50" },
  info: { icon: Info, cls: "text-primary border-primary/20 bg-primary/5" },
};

async function handleSelectNotification(alert) {
  try {
    if (!alert.read) {
      await store.markRead(alert.id);
    }
  } catch {
    emit("close");
    return;
  }

  emit("close");
  if (alert.recordLink) {
    router.push(alert.recordLink);
  }
}

function handleViewAll() {
  emit("close");
  router.push("/notifications");
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-40"
      @click="$emit('close')"
    />
  </Transition>

  <Transition name="dropdown">
    <div
      v-if="open"
      role="dialog"
      aria-label="Notifications Dropdown"
      class="fixed top-[68px] right-4 lg:right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-xl border border-slate-200 font-sans overflow-hidden"
    >
      <!-- Dropdown Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
        <div class="flex items-center gap-2">
          <Bell class="w-4 h-4 text-primary" />
          <h2 class="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Notifications
          </h2>
          <span
            v-if="unread > 0"
            class="text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-full"
          >
            {{ unread }}
          </span>
        </div>
        <button
          type="button"
          data-testid="mark-all-read-btn"
          :disabled="unread === 0"
          :class="[
            'text-xs font-semibold transition-colors',
            unread > 0
              ? 'text-primary hover:underline cursor-pointer'
              : 'text-slate-400 cursor-default opacity-60',
          ]"
          @click="unread > 0 && store.markAllRead()"
        >
          Mark all as read
        </button>
      </div>

      <!-- Tabs -->
      <div
        role="tablist"
        aria-label="Notification filter"
        class="flex items-center gap-1 px-4 py-2 border-b border-slate-100 bg-white"
      >
        <button
          type="button"
          role="tab"
          data-testid="notif-tab-all"
          :aria-selected="activeTab === 'all'"
          :class="[
            'px-2.5 py-1 rounded-md text-xs font-semibold transition-colors',
            activeTab === 'all'
              ? 'bg-primary text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100',
          ]"
          @click="activeTab = 'all'"
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          data-testid="notif-tab-unread"
          :aria-selected="activeTab === 'unread'"
          :class="[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors',
            activeTab === 'unread'
              ? 'bg-primary text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100',
          ]"
          @click="activeTab = 'unread'"
        >
          <span>Unread</span>
          <span
            v-if="unread > 0"
            :class="[
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
              activeTab === 'unread' ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
            ]"
          >
            {{ unread }}
          </span>
        </button>
      </div>

      <!-- Notification List -->
      <div class="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
        <div
          v-if="latestAlerts.length === 0"
          class="py-12 px-4 flex flex-col items-center justify-center text-center"
        >
          <Clock class="w-6 h-6 text-slate-300 mb-2" />
          <p class="text-xs font-medium text-slate-400">
            {{ activeTab === "unread" ? "No unread notifications" : "No notifications yet" }}
          </p>
        </div>

        <div
          v-for="alert in latestAlerts"
          :key="alert.id"
          :data-testid="`notif-item-${alert.id}`"
          :class="[
            'flex gap-3 px-4 py-3.5 cursor-pointer transition-colors border-l-2',
            alert.read
              ? 'bg-white border-transparent hover:bg-slate-50'
              : 'bg-primary/[0.04] border-primary hover:bg-primary/[0.07]',
          ]"
          @click="handleSelectNotification(alert)"
        >
          <div
            :class="[
              'w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5',
              (iconMap[alert.severity || alert.type] || iconMap.info).cls,
            ]"
          >
            <component
              :is="(iconMap[alert.severity || alert.type] || iconMap.info).icon"
              class="w-4 h-4"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-0.5">
              <p class="text-xs font-bold text-slate-800 truncate">
                {{ alert.title || alert.module }}
              </p>
              <span class="text-[10px] font-mono text-slate-400 flex-shrink-0">
                {{ alert.time }}
              </span>
            </div>
            <p class="text-xs text-slate-600 leading-snug line-clamp-2">
              {{ alert.message }}
            </p>
          </div>
        </div>
      </div>

      <!-- Footer Link -->
      <div class="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
        <button
          type="button"
          data-testid="view-all-notifications"
          class="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover py-1"
          @click="handleViewAll"
        >
          <span>View all notifications</span>
          <ArrowRight class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
