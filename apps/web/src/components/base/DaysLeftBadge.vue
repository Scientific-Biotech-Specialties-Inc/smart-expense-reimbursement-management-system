<script setup>
import { computed } from "vue";
import { AlertTriangle, Clock } from "lucide-vue-next";
import {
  GRACE_PERIOD_DAYS,
  PAUSED_LIQUIDATION_STATUSES,
  TERMINAL_LIQUIDATION_STATUSES,
} from "@/utils/liquidationPenalties";

const props = defineProps({
  dueDate: {
    type: [String, Date, Number],
    required: true,
  },
  startDate: {
    type: [String, Date, Number],
    default: null,
  },
  isOverdue: {
    type: Boolean,
    default: null,
  },
  status: {
    type: String,
    default: "",
  },
  totalDays: {
    type: Number,
    default: 7,
  },
  variant: {
    type: String,
    default: "liquidation",
    validator: (value) => ["liquidation", "signing"].includes(value),
  },
});

const isSigningVariant = computed(() => props.variant === "signing");
const effectiveGraceDays = computed(() =>
  isSigningVariant.value ? 0 : GRACE_PERIOD_DAYS,
);

const parsedDueDate = computed(() => {
  if (!props.dueDate) return null;
  const d = new Date(props.dueDate);
  return Number.isNaN(d.getTime()) ? null : d;
});

const parsedStartDate = computed(() => {
  if (!props.startDate) return null;
  const d = new Date(props.startDate);
  return Number.isNaN(d.getTime()) ? null : d;
});

const diffDays = computed(() => {
  if (!parsedDueDate.value) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(parsedDueDate.value);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
});

const normalizedStatus = computed(() => String(props.status || "").toLowerCase().trim());
const isTerminalStatus = computed(
  () =>
    !isSigningVariant.value &&
    TERMINAL_LIQUIDATION_STATUSES.includes(normalizedStatus.value),
);
const isPausedStatus = computed(
  () =>
    !isSigningVariant.value &&
    PAUSED_LIQUIDATION_STATUSES.includes(normalizedStatus.value),
);

const computedIsOverdue = computed(() => {
  if (!isSigningVariant.value && normalizedStatus.value === "overdue") return true;
  if (typeof props.isOverdue === "boolean") return props.isOverdue;
  if (isTerminalStatus.value || isPausedStatus.value) return false;
  return diffDays.value < -effectiveGraceDays.value;
});

const badgeMode = computed(() => {
  if (computedIsOverdue.value) return "penalty";
  if (isTerminalStatus.value && diffDays.value <= 0) return "closed";
  if (isPausedStatus.value && diffDays.value <= 0) return "under-review";
  if (diffDays.value === 0) return "due-today";
  if (diffDays.value < 0) return "grace";
  return "countdown";
});

const daysLeft = computed(() => {
  if (computedIsOverdue.value) return 0;
  return Math.max(0, diffDays.value);
});

const graceDaysLeft = computed(() => {
  if (badgeMode.value !== "grace") return 0;
  return Math.max(1, GRACE_PERIOD_DAYS + diffDays.value + 1);
});

const showProgressBar = computed(() =>
  ["countdown", "due-today", "grace"].includes(badgeMode.value),
);

const computedTotalDays = computed(() => {
  if (parsedStartDate.value && parsedDueDate.value) {
    const start = new Date(parsedStartDate.value);
    start.setHours(0, 0, 0, 0);
    const due = new Date(parsedDueDate.value);
    due.setHours(0, 0, 0, 0);
    const span = Math.round((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (span > 0) return span;
  }
  return Number(props.totalDays) > 0 ? Number(props.totalDays) : 7;
});

const progressPercent = computed(() => {
  if (badgeMode.value !== "countdown") return 100;
  const elapsed = Math.max(0, computedTotalDays.value - daysLeft.value);
  return Math.min(100, Math.max(0, Math.round((elapsed / computedTotalDays.value) * 100)));
});

const badgeText = computed(() => {
  if (badgeMode.value === "penalty") return "PENALTY";
  if (badgeMode.value === "closed") return "Closed";
  if (badgeMode.value === "under-review") return "Under review";
  if (badgeMode.value === "due-today") return "Due today";
  if (badgeMode.value === "grace") {
    return `${graceDaysLeft.value} ${graceDaysLeft.value === 1 ? "grace day" : "grace days"} left`;
  }
  return `${daysLeft.value} ${daysLeft.value === 1 ? "day" : "days"} left`;
});

const tone = computed(() => {
  if (badgeMode.value === "closed") return "slate";
  if (badgeMode.value === "under-review") return "violet";
  if (isSigningVariant.value) {
    if (badgeMode.value !== "countdown" || daysLeft.value <= 1) return "red";
    if (daysLeft.value === 2) return "amber";
    return "emerald";
  }
  if (badgeMode.value !== "countdown" || daysLeft.value <= 3) return "red";
  if (daysLeft.value <= 10) return "amber";
  return "emerald";
});

const TONE_STYLES = {
  red: {
    badge: "bg-red-50 text-red-700 border-red-200",
    icon: "text-red-600",
    track: "bg-red-200",
    fill: "bg-red-600",
  },
  amber: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    icon: "text-amber-600",
    track: "bg-amber-200",
    fill: "bg-amber-500",
  },
  emerald: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: "text-emerald-600",
    track: "bg-emerald-200",
    fill: "bg-emerald-600",
  },
  slate: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    icon: "text-slate-500",
    track: "bg-slate-200",
    fill: "bg-slate-500",
  },
  violet: {
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    icon: "text-violet-600",
    track: "bg-violet-200",
    fill: "bg-violet-600",
  },
};

const badgeClasses = computed(() => TONE_STYLES[tone.value].badge);
const iconClasses = computed(() => TONE_STYLES[tone.value].icon);
const trackClasses = computed(() => TONE_STYLES[tone.value].track);
const fillClasses = computed(() => TONE_STYLES[tone.value].fill);

const tooltipTitle = computed(() => {
  if (!parsedDueDate.value) return "";
  const dateStr = parsedDueDate.value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (isSigningVariant.value) {
    if (badgeMode.value === "penalty") {
      return `Signing deadline exceeded (${dateStr}) — 3-day signing grace period passed; triggers a compliance strike`;
    }
    if (badgeMode.value === "due-today") {
      return `Must sign today (${dateStr}) — last day before compliance strike`;
    }
    return `Must sign by ${dateStr} (${daysLeft.value} ${daysLeft.value === 1 ? "day" : "days"} remaining)`;
  }
  if (badgeMode.value === "penalty") {
    return `Penalty active — past ${GRACE_PERIOD_DAYS}-day grace period (due ${dateStr})`;
  }
  if (badgeMode.value === "closed") {
    return `Closed (due date was ${dateStr})`;
  }
  if (badgeMode.value === "under-review") {
    return `Under review — penalty paused (due ${dateStr})`;
  }
  if (badgeMode.value === "due-today") {
    return `Due today (${dateStr}) — ${GRACE_PERIOD_DAYS}-day grace period applies before penalty`;
  }
  if (badgeMode.value === "grace") {
    return `Grace period: ${graceDaysLeft.value} ${graceDaysLeft.value === 1 ? "day" : "days"} left before penalty (due ${dateStr})`;
  }
  return `Due ${dateStr} (${daysLeft.value} ${daysLeft.value === 1 ? "day" : "days"} remaining)`;
});
</script>

<template>
  <div
    v-if="parsedDueDate"
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold font-sans transition-colors"
    :class="badgeClasses"
    :title="tooltipTitle"
    data-testid="days-left-badge"
  >
    <AlertTriangle
      v-if="badgeMode === 'penalty'"
      class="w-3.5 h-3.5 shrink-0"
      :class="iconClasses"
      data-testid="days-left-penalty-icon"
    />
    <Clock v-else class="w-3.5 h-3.5 shrink-0" :class="iconClasses" />
    <span>{{ badgeText }}</span>
    <div
      v-if="showProgressBar"
      class="w-12 h-1.5 rounded-full overflow-hidden shrink-0"
      :class="trackClasses"
      role="progressbar"
      :aria-valuenow="progressPercent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div
        class="h-full rounded-full transition-all duration-300"
        :class="fillClasses"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>
  </div>
</template>
