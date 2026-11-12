<script setup>
import {
  Check,
  Clock,
  X,
  AlertTriangle,
} from "lucide-vue-next";
import { formatPeso, formatDate } from "@/utils/formatters";

const props = defineProps({
  step: {
    type: Object,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  sublabel: {
    type: String,
    required: true,
  },
  historyEntry: {
    type: Object,
    default: null,
  },
  revisionCount: {
    type: Number,
    default: 0,
  },
  isOverdue: {
    type: Boolean,
    default: false,
  },
  totalPenalty: {
    type: Number,
    default: 0,
  },
  overdueDays: {
    type: Number,
    default: 0,
  },
  overpaymentAmount: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(["click"]);

function isClickable(state) {
  return state !== "future";
}

function formatDateOnly(value) {
  if (!value) return null;
  const formatted = formatDate(value);
  return formatted === "—" ? null : formatted;
}

function circleClasses(state, step) {
  const base =
    "h-8 w-8 rounded-full flex items-center justify-center ring-4 ring-white z-10 shrink-0 transition-colors";
  if (state === "completed") return `${base} bg-emerald-500 text-white`;
  if (state === "current") {
    if (props.isOverdue && step.idx >= 3)
      return `${base} bg-orange-500 text-white animate-pulse`;
    return `${base} bg-amber-400 text-white animate-pulse`;
  }
  if (state === "rejected") return `${base} bg-red-500 text-white`;
  if (state === "revise") return `${base} bg-orange-500 text-white animate-pulse`;
  if (props.isOverdue && step.idx >= 3) {
    return `${base} bg-slate-200 text-slate-400 border border-orange-200`;
  }
  return `${base} bg-slate-200 text-slate-400`;
}

function handleClick() {
  if (!isClickable(props.state)) return;
  emit("click", props.step, props.state);
}
</script>

<template>
  <div class="relative flex flex-row items-start gap-3 w-full sm:flex-col sm:items-center sm:text-center sm:gap-0">
    <!-- Circle Button -->
    <button
      type="button"
      :disabled="!isClickable(state)"
      :class="[
        circleClasses(state, step),
        isClickable(state)
          ? 'cursor-pointer hover:ring-slate-100 hover:scale-105'
          : 'cursor-not-allowed',
        'mb-0 sm:mb-2',
      ]"
      :aria-current="state === 'current' ? 'step' : undefined"
      :title="state === 'future' ? 'Not yet available' : `Go to ${step.label}`"
      @click="handleClick"
    >
      <Check
        v-if="state === 'completed'"
        class="h-3.5 w-3.5"
        :stroke-width="2.5"
      />
      <X
        v-else-if="state === 'rejected'"
        class="h-3.5 w-3.5"
        :stroke-width="2.5"
      />
      <AlertTriangle
        v-else-if="state === 'revise'"
        class="h-3.5 w-3.5"
      />
      <Clock
        v-else-if="state === 'current'"
        class="h-3.5 w-3.5"
      />
      <span
        v-else-if="step.key === 'overpayment'"
        class="text-[10px] font-bold"
        >9</span
      >
      <span v-else class="text-[10px] font-bold">{{ step.id }}</span>
    </button>

    <!-- Label Block -->
    <div
      :class="[
        'flex-1 min-w-0 sm:flex-none sm:w-full sm:px-1',
        isClickable(state) ? 'cursor-pointer' : 'cursor-not-allowed',
      ]"
      @click="handleClick"
    >
      <p class="text-[10px] leading-none tracking-wide uppercase text-slate-400">
        {{ step.label }}
      </p>
      <p
        :class="[
          'mt-0.5 text-xs font-medium truncate',
          state === 'completed'
            ? 'text-emerald-700'
            : state === 'current'
              ? 'text-amber-600'
              : state === 'rejected'
                ? 'text-red-600'
                : state === 'revise'
                  ? 'text-orange-600'
                  : 'text-slate-400',
        ]"
      >
        {{ sublabel }}
      </p>

      <!-- Meta Date + Actor -->
      <template v-if="state !== 'future' && (historyEntry?.date || historyEntry?.actor)">
        <p class="mt-0.5 text-[10px] leading-tight text-slate-400 truncate">
          <span v-if="formatDateOnly(historyEntry?.date)">
            {{ formatDateOnly(historyEntry?.date) }}
          </span>
          <span v-if="historyEntry?.actor" class="hidden sm:inline">
            <template v-if="formatDateOnly(historyEntry?.date)"> • </template>{{ historyEntry?.actor }}
          </span>
        </p>
        <p
          v-if="historyEntry?.actor"
          class="text-[10px] leading-tight text-slate-400 truncate sm:hidden"
        >
          {{ historyEntry?.actor }}
        </p>
      </template>

      <!-- Revision Attempt Badge -->
      <span
        v-if="(state === 'revise' || state === 'current') && revisionCount > 0"
        class="mt-1 inline-flex items-center rounded-full bg-orange-50 px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wide text-orange-700 ring-1 ring-orange-200"
      >
        {{ revisionCount }}/3
      </span>

      <!-- Penalty Badge on Overdue Steps 4-6 -->
      <span
        v-if="isOverdue && step.idx >= 3 && step.idx <= 5 && totalPenalty > 0 && (state === 'current' || state === 'completed')"
        class="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-red-700 ring-1 ring-red-200"
      >
        <AlertTriangle class="h-2.5 w-2.5 shrink-0" />
        PHP {{ totalPenalty.toLocaleString() }}
      </span>

      <!-- Overpayment Amount Badge on Step 8 or Step 9 -->
      <span
        v-if="(step.key === 'overpayment' || step.key === 'settled') && Number(overpaymentAmount) > 0"
        class="mt-1 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-blue-700 ring-1 ring-blue-200"
      >
        {{ formatPeso(overpaymentAmount) }} → Reimbursement
      </span>
    </div>
  </div>
</template>
