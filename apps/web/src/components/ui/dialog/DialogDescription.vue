<!--
  ONE UI Dialog Component Guide:
  - Dialog action buttons and selects in footers must size intrinsically to their text
    content plus standard padding (px-4 or px-5), rather than stretching to fill the
    parent container (avoid w-full or flex-1 on desktop viewports).
  - Use sm:justify-end (forms/workflows) or justify-center (confirmation dialogs).
  - See docs/DESIGN.md Section VI.5, VI.6 & VII.
-->
<script setup>
import { DialogDescription } from 'radix-vue'
import { cn } from '@/utils/cn'

const props = defineProps({
  asChild: { type: Boolean, default: false },
  as: { type: String, default: undefined },
  class: { type: String, default: '' },
})
</script>

<template>
  <DialogDescription
    v-bind="props"
    :class="cn('text-sm text-slate-500 font-sans', props.class)"
  >
    <slot />
  </DialogDescription>
</template>
