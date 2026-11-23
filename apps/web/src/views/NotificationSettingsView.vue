<script setup>
import { reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useNotificationStore } from "@/stores/notification";
import BaseButton from "@/components/base/BaseButton.vue";
import { Bell, Mail, ArrowLeft, ShieldCheck, Save } from "lucide-vue-next";

const auth = useAuthStore();
const notifStore = useNotificationStore();
const router = useRouter();

const form = reactive({
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

const EMPLOYEE_TOGGLES = [
  {
    key: "request_submissions",
    label: "Request submissions",
    description:
      "Receive a confirmation email when you submit a reimbursement, cash advance, or liquidation.",
  },
  {
    key: "status_updates",
    label: "Status updates (approved, rejected, cancelled, granted, revised)",
    description:
      "Receive an email when an admin approves, rejects, cancels, grants, disburses, settles, or returns your request for revision.",
  },
  {
    key: "admin_comments",
    label: "Admin comments and notes",
    description:
      "Receive an email when an admin leaves a comment or note on your reimbursement, receipt, cash advance, or liquidation.",
  },
  {
    key: "near_deadline_reminders",
    label: "Near-deadline reminders",
    description:
      "Receive a reminder email when your liquidation has 3 days or less remaining, and again on the day it is due.",
  },
  {
    key: "overdue_alerts",
    label: "Overdue alerts",
    description:
      "Receive an alert email showing days overdue and accrued penalty when a liquidation passes its deadline.",
  },
];

const ADMIN_TOGGLES = [
  {
    key: "admin_new_requests",
    label: "New requests from employees",
    description:
      "Receive an email whenever an employee submits a new reimbursement, cash advance, or liquidation request.",
  },
  {
    key: "admin_employee_updates",
    label: "Employee notes, signatures and resubmissions",
    description:
      "Receive an email when an employee adds a comment/note, signs an acknowledgement, uploads a new file, or resubmits after revision.",
  },
  {
    key: "admin_overdue_liquidations",
    label: "Overdue liquidations",
    description:
      "Receive a daily alert email when an employee's liquidation becomes overdue, including days overdue and penalty.",
  },
];

const visibleToggles = computed(() =>
  auth.isAdmin ? ADMIN_TOGGLES : EMPLOYEE_TOGGLES,
);

function syncFromStore(data) {
  if (!data) return;
  Object.keys(form).forEach((key) => {
    if (typeof data[key] === "boolean") {
      form[key] = data[key];
    }
  });
}

function toggleMasterSwitch() {
  form.email_enabled = !form.email_enabled;
}

function toggleCategory(key) {
  if (!form.email_enabled) return;
  form[key] = !form[key];
}

async function handleSave() {
  try {
    await notifStore.saveSettings({ ...form });
    syncFromStore(notifStore.settings);
  } catch {
    // Error notification handled by store toast
  }
}

onMounted(async () => {
  const data = await notifStore.fetchSettings();
  syncFromStore(data);
});
</script>

<template>
  <div class="flex flex-col gap-6 max-w-3xl mx-auto font-sans">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <button
            type="button"
            class="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary transition-colors"
            @click="router.push('/notifications')"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>Back to Notifications</span>
          </button>
        </div>
        <h1 class="text-page-title">Notification Settings</h1>
        <p class="mt-1 text-sm text-slate-500">
          Choose which email notifications you want to receive at
          <span class="font-semibold text-slate-700">{{ auth.user?.email || "your registered email" }}</span>.
          In-app notifications (bell and Notifications page) remain active even when emails are turned off.
        </p>
      </div>
    </div>

    <!-- Master Email Switch Card -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center justify-between gap-4">
      <div class="flex items-start gap-3.5">
        <div class="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Mail class="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 class="text-sm font-bold text-slate-800">
            Receive Email Notifications (Master Switch)
          </h2>
          <p class="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Turn all email notifications on or off. When turned off, no emails will be sent to your inbox, while your individual preferences below are preserved.
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        data-testid="toggle-email_enabled"
        :aria-checked="form.email_enabled"
        :class="[
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
          form.email_enabled ? 'bg-primary' : 'bg-slate-300',
        ]"
        @click="toggleMasterSwitch"
      >
        <span
          :class="[
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            form.email_enabled ? 'translate-x-5' : 'translate-x-0',
          ]"
        />
      </button>
    </div>

    <!-- Role-Scoped Email Type Toggles Card -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Bell class="w-4 h-4 text-primary" />
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-700">
            {{ auth.isAdmin ? "Admin Email Notification Types" : "Employee Email Notification Types" }}
          </h3>
        </div>
        <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
          {{ auth.isAdmin ? "Admin Role" : "Employee Role" }}
        </span>
      </div>

      <div class="divide-y divide-slate-100">
        <div
          v-for="item in visibleToggles"
          :key="item.key"
          :class="[
            'px-5 py-4 flex items-center justify-between gap-4 transition-opacity',
            !form.email_enabled ? 'opacity-50' : '',
          ]"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-800">
              {{ item.label }}
            </p>
            <p class="text-xs text-slate-500 mt-0.5 leading-relaxed">
              {{ item.description }}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            :data-testid="`toggle-${item.key}`"
            :disabled="!form.email_enabled"
            :aria-checked="form.email_enabled && form[item.key]"
            :class="[
              'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
              !form.email_enabled ? 'cursor-not-allowed bg-slate-200' : form[item.key] ? 'cursor-pointer bg-primary' : 'cursor-pointer bg-slate-300',
            ]"
            @click="toggleCategory(item.key)"
          >
            <span
              :class="[
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                form.email_enabled && form[item.key] ? 'translate-x-5' : 'translate-x-0',
              ]"
            />
          </button>
        </div>
      </div>

      <!-- Card Footer with Explicit Save Button -->
      <div class="px-5 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck class="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>In-app notifications will continue working regardless of your email preferences.</span>
        </div>

        <BaseButton
          data-testid="save-notification-settings"
          variant="primary"
          size="sm"
          :disabled="notifStore.isSavingSettings"
          @click="handleSave"
        >
          <Save class="w-4 h-4 mr-1.5" />
          {{ notifStore.isSavingSettings ? "Saving..." : "Save Preferences" }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
