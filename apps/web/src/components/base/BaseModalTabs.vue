<script setup>
// Shared accessible tab bar for SERMS detail and settlement modals.
/**
 * @typedef {{ key: string, label: string, count?: number | null }} ModalTab
 * @props {{ tabs: ModalTab[], modelValue: string }}
 * @emits (event: 'update:modelValue', key: string) => void
 */
defineProps({
  tabs: {
    type: Array,
    required: true,
  },
  modelValue: {
    type: String,
    required: true,
  },
});

defineEmits(["update:modelValue"]);
</script>

<template>
  <div
    role="tablist"
    aria-label="Modal sections"
    class="flex w-full sm:w-fit items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 overflow-x-auto max-w-full"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.key"
      :data-testid="'modal-tab-' + tab.key"
      class="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs sm:text-sm transition-all duration-150 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      :class="
        modelValue === tab.key
          ? 'bg-white text-primary shadow-sm font-semibold'
          : 'text-slate-600 hover:text-slate-800 hover:bg-white/60 font-medium'
      "
      @click="$emit('update:modelValue', tab.key)"
    >
      <span>{{ tab.label }}</span>
      <span
        v-if="tab.count !== undefined && tab.count !== null"
        class="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none"
        :class="
          modelValue === tab.key
            ? 'bg-primary/10 text-primary font-semibold'
            : 'bg-slate-200/80 text-slate-600 font-medium'
        "
      >
        {{ tab.count }}
      </span>
    </button>
  </div>
</template>
