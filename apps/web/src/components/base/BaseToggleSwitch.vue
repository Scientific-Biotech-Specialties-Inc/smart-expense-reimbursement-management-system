<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  activeLabel: { type: String, default: "" },
  inactiveLabel: { type: String, default: "" },
  onLabel: { type: String, default: "" },
  offLabel: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  hint: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue"]);

const isOn = computed(() => Boolean(props.modelValue));
const effectiveOnLabel = computed(() => props.activeLabel || props.onLabel || "Mock OCR");
const effectiveOffLabel = computed(() => props.inactiveLabel || props.offLabel || "Real OCR");

function toggle() {
  if (props.disabled) return;
  emit("update:modelValue", !isOn.value);
}
</script>

<template>
  <div class="flex items-center gap-3">
    <span
      class="text-xs font-bold uppercase tracking-widest"
      :class="isOn ? 'text-slate-400' : 'text-primary'"
    >
      {{ effectiveOffLabel }}
    </span>
    <button
      type="button"
      role="switch"
      :aria-checked="isOn ? 'true' : 'false'"
      :aria-label="isOn ? effectiveOnLabel : effectiveOffLabel"
      :disabled="disabled"
      :class="[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        isOn ? 'bg-accent' : 'bg-slate-300',
      ]"
      @click="toggle"
    >
      <span
        :class="[
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
          isOn ? 'translate-x-6' : 'translate-x-1',
        ]"
        aria-hidden="true"
      />
    </button>
    <span
      class="text-xs font-bold uppercase tracking-widest"
      :class="isOn ? 'text-accent' : 'text-slate-400'"
    >
      {{ effectiveOnLabel }}
    </span>
    <span v-if="hint" class="text-[11px] text-slate-400">{{ hint }}</span>
  </div>
</template>
