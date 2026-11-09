<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useNotificationStore } from "@/stores/notification";
import { useToast } from "@/composables/useToast";
import { buildNavLinks } from "@/composables/useNavLinks";
import NotificationPanel from "@/components/base/NotificationPanel.vue";
import ToastNotification from "@/components/ToastNotification.vue";
import DuplicateReceiptModal from "@/components/expenses/DuplicateReceiptModal.vue";
const sbsiLogo = `${import.meta.env.BASE_URL}sbsi-logo.webp`;
import sbsiLogoShort from "@/assets/sbsi_logo_short.png";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Bell, LogOut, PanelLeft, User } from "lucide-vue-next";

const auth = useAuthStore();
const notif = useNotificationStore();
const router = useRouter();
const route = useRoute();
const { addToast } = useToast();

onMounted(() => {
  notif.fetchNotifications().catch(() => {});
  notif.startPolling(30000);

  if (route.query.message) {
    addToast({
      message: route.query.message,
      type: "success",
      duration: 4000,
    });

    const query = { ...route.query };
    delete query.message;
    router.replace({ query });
  }
});

onUnmounted(() => {
  notif.stopPolling();
});

const sidebarOpen = ref(true);
const notifOpen = ref(false);
const mobileOpen = ref(false);

const navLinks = buildNavLinks();

const unreadCount = computed(() => notif.unreadCount);

const pageTitle = computed(() => route.meta?.title || "SERMS");

const userInitials = computed(() => {
  if (!auth.user?.name) return "US";
  return auth.user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
});

function isActive(path) {
  return route.path === path || route.path.startsWith(path + "/");
}

async function logout() {
  auth.logout();
}
</script>

<template>
  <div
    class="flex h-screen overflow-hidden font-sans select-none bg-clinical text-slate-800"
  >
    <!-- Mobile overlay -->
    <Transition name="fade">
      <div
        v-if="mobileOpen"
        class="fixed inset-0 z-20 bg-slate-900/50 backdrop-blur-sm lg:hidden"
        @click="mobileOpen = false"
      />
    </Transition>

    <!-- ======================== SIDEBAR (Section VI.1) ======================== -->
    <aside
      :class="[
        'flex flex-col z-30 transition-[width,transform] duration-300 ease-out flex-shrink-0',
        'fixed lg:relative inset-y-0 left-0 bg-primary select-none',
        sidebarOpen ? 'w-[260px]' : 'w-[70px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <!-- Branding & Subsystem Lockup -->
      <RouterLink
        to="/dashboard"
        data-testid="sidebar-brand-link"
        :class="[
          'flex items-center px-4 py-4 border-b border-white/10 min-h-[70px] cursor-pointer transition-opacity hover:opacity-90 outline-none focus:outline-none',
          sidebarOpen ? 'justify-start gap-3' : 'justify-center',
        ]"
        title="Dashboard"
        @click="mobileOpen = false"
      >
        <img
          :src="sidebarOpen ? sbsiLogo : sbsiLogoShort"
          alt="SBSI"
          :class="[
            'object-contain transition-all duration-300 ease-out',
            sidebarOpen ? 'h-9 w-auto max-w-[140px]' : 'h-8 w-8',
          ]"
        />
        <div v-if="sidebarOpen" class="flex flex-col leading-tight">
          <span class="font-sans font-bold text-xs text-white uppercase tracking-wider">
            SMART EXPENSE
          </span>
          <span class="font-sans font-bold text-xs text-white uppercase tracking-wider">
            REIMBURSEMENT
          </span>
          <span class="font-sans font-normal text-[9px] text-white/70 uppercase tracking-normal mt-0.5">
            MANAGEMENT SYSTEM
          </span>
        </div>
      </RouterLink>

      <!-- Navigation Links -->
      <nav class="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin space-y-1">
        <template v-for="(link, i) in navLinks" :key="i">
          <div v-if="link.divider" class="mx-2 my-3 border-t border-white/10" />
          <div v-else-if="link.header" class="px-3 pt-3 pb-1">
            <Transition name="fade">
              <span
                v-if="sidebarOpen"
                class="text-[10px] font-sans font-bold uppercase tracking-wider text-white/60 flex items-center gap-2"
              >
                {{ link.header }}
              </span>
            </Transition>
          </div>
          <RouterLink
            v-else
            :to="link.to"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans transition-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 border border-transparent',
              isActive(link.to)
                ? 'bg-brand-deep text-white font-semibold shadow-sm border-brand-deep-border'
                : 'text-white/60 hover:bg-white/10 hover:text-white',
              !sidebarOpen ? 'justify-center px-0' : '',
            ]"
            :title="!sidebarOpen ? link.name : undefined"
            @click="mobileOpen = false"
          >
            <component
              :is="link.icon"
              :class="[
                'w-4 h-4 flex-shrink-0',
                isActive(link.to) ? 'text-white' : 'text-white/60',
              ]"
            />
            <span
              v-if="sidebarOpen"
              class="flex-1 truncate"
            >
              {{ link.name }}
            </span>
          </RouterLink>
        </template>
      </nav>

      <!-- Pinned Sidebar Footer: Logout Action -->
      <div class="p-3 border-t border-white/10">
        <button
          type="button"
          :class="[
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white hover:bg-white/10 transition-colors duration-150',
            sidebarOpen ? 'justify-start' : 'justify-center px-0',
          ]"
          :title="!sidebarOpen ? 'Logout' : undefined"
          @click="logout"
        >
          <LogOut class="w-4 h-4 text-white flex-shrink-0" />
          <span
            v-if="sidebarOpen"
            class="text-sm font-sans font-bold text-white tracking-wide truncate"
          >
            Logout
          </span>
        </button>
      </div>
    </aside>

    <!-- ======================== MAIN AREA ======================== -->
    <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
      <!-- Top Header Component (Section VI.2) -->
      <header
        class="flex items-center justify-between px-4 lg:px-6 py-3 bg-white/90 border-b border-slate-100 shadow-sm backdrop-blur-md z-10 min-h-[70px]"
      >
        <!-- Left Section: Sidebar Toggle & Page Title -->
        <div class="flex items-center gap-4">
          <button
            class="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            title="Toggle Sidebar"
            @click="sidebarOpen = !sidebarOpen; mobileOpen = !mobileOpen"
          >
            <PanelLeft class="w-5 h-5" />
          </button>

          <div class="h-6 w-px bg-slate-200 hidden sm:block" />

          <h1 class="font-sans font-bold text-lg text-slate-700 tracking-tight">
            {{ pageTitle }}
          </h1>
        </div>

        <!-- Right Section: Utilities & User Dropdown -->
        <div class="flex items-center gap-3">
          <!-- Notification Bell -->
          <button
            id="notif-bell"
            class="relative p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            title="Notifications"
            @click="notifOpen = !notifOpen"
          >
            <span class="relative inline-flex items-center justify-center">
              <Bell class="w-5 h-5" />
              <span
                v-if="unreadCount > 0"
                data-testid="notif-badge"
                class="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-secondary text-white text-[10px] font-bold leading-none flex items-center justify-center rounded-full border-2 border-white shadow-sm pointer-events-none"
              >
                {{ unreadCount > 99 ? "99+" : unreadCount }}
              </span>
            </span>
          </button>

          <div class="h-6 w-px bg-slate-200" />

          <!-- User Profile Dropdown Trigger (Section VI.2) -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <div
                class="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl cursor-pointer hover:bg-slate-100/80 transition-colors"
              >
                <div
                  class="w-8 h-8 rounded-full bg-avatar flex items-center justify-center text-white text-xs font-bold font-sans shadow-sm"
                >
                  {{ userInitials }}
                </div>
                <div class="hidden md:flex flex-col text-left">
                  <span class="text-xs font-semibold font-sans text-slate-700 leading-tight">
                    {{ auth.user?.name || "User Profile" }}
                  </span>
                  <span class="text-[10px] font-normal font-sans text-slate-500 leading-tight">
                    {{ auth.user?.role || "Staff" }}
                  </span>
                </div>
              </div>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" class="w-52">
              <div class="px-3 py-2 border-b border-slate-100">
                <p class="text-xs font-bold text-slate-700 truncate font-sans">
                  {{ auth.user?.name }}
                </p>
                <p class="text-[11px] text-slate-500 truncate font-sans">
                  {{ auth.user?.email || auth.user?.role }}
                </p>
              </div>

              <DropdownMenuItem class="mt-1" @select="router.push('/profile')">
                <User class="w-4 h-4 text-slate-500 mr-2" />
                <span>My Profile</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                data-testid="menu-notification-settings"
                @select="router.push('/settings/notifications')"
              >
                <Bell class="w-4 h-4 text-slate-500 mr-2" />
                <span>Notification Settings</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                class="text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-700"
                @select="logout"
              >
                <LogOut class="w-4 h-4 text-red-500 mr-2" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <!-- Active Workspace Canvas -->
      <main class="flex-1 p-6 overflow-y-auto scrollbar-thin bg-clinical">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <div :key="viewRoute.path" class="animate-fade-in">
            <component :is="Component" />
          </div>
        </RouterView>
      </main>
    </div>

    <!-- Notification Sidebar -->
    <NotificationPanel :open="notifOpen" @close="notifOpen = false" />

    <!-- Global Toast Notifications -->
    <ToastNotification />

    <!-- Global Duplicate Receipt Modal -->
    <DuplicateReceiptModal />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease-out;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.animate-fade-in {
  animation: fadeIn 0.2s linear;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
