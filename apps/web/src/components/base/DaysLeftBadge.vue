<script setup>
import { computed } from "vue";
import { Clock } from "lucide-vue-next";

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
});

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

const computedIsOverdue = computed(() => {
  if (typeof props.isOverdue === "boolean") return props.isOverdue;
  if (props.status && String(props.status).toLowerCase().trim() === "overdue") return true;
  return diffDays.value < 0;
});

const daysLeft = computed(() => {
  if (computedIsOverdue.value) return 0;
  return Math.max(0, diffDays.value);
});

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
  if (computedIsOverdue.value || daysLeft.value === 0) return 100;
  const elapsed = Math.max(0, computedTotalDays.value - daysLeft.value);
  return Math.min(100, Math.max(0, Math.round((elapsed / computedTotalDays.value) * 100)));
});

const daysLeftText = computed(() => {
  return `${daysLeft.value} ${daysLeft.value === 1 ? "day" : "days"} left`;
});

const badgeClasses = computed(() => {
  if (computedIsOverdue.value || daysLeft.value <= 3) {
    return "bg-red-50 text-red-700 border-red-200";
  }
  if (daysLeft.value <= 10) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
});

const iconClasses = computed(() => {
  if (computedIsOverdue.value || daysLeft.value <= 3) {
    return "text-red-600";
  }
  if (daysLeft.value <= 10) {
    return "text-amber-600";
  }
  return "text-emerald-600";
});

const trackClasses = computed(() => {
  if (computedIsOverdue.value || daysLeft.value <= 3) {
    return "bg-red-200";
  }
  if (daysLeft.value <= 10) {
    return "bg-amber-200";
  }
  return "bg-emerald-200";
});

const fillClasses = computed(() => {
  if (computedIsOverdue.value || daysLeft.value <= 3) {
    return "bg-red-600";
  }
  if (daysLeft.value <= 10) {
    return "bg-amber-500";
  }
  return "bg-emerald-600";
});

const tooltipTitle = computed(() => {
  if (!parsedDueDate.value) return "";
  const dateStr = parsedDueDate.value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (computedIsOverdue.value) {
    return `Overdue (due date was ${dateStr})`;
  }
  return `Due ${dateStr} (${daysLeft.value} days remaining)`;
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
    <Clock class="w-3.5 h-3.5 shrink-0" :class="iconClasses" />
    <span>{{ daysLeftText }}</span>
    <div
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
