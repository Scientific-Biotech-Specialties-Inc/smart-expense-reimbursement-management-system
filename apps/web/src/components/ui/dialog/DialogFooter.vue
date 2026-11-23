<!--
  ONE UI Dialog Component Guide:
  - Dialog action buttons and selects in footers must size intrinsically to their text
    content plus standard padding (px-4 or px-5), rather than stretching to fill the
    parent container (avoid w-full or flex-1 on desktop viewports).
  - Use sm:justify-end across all modal dialogs (including confirmation dialogs and forms/workflows).
  - See docs/DESIGN.md Section VI.5, VI.6 & VII.
-->
<script setup>
import { cn } from '@/utils/cn'

const props = defineProps({
  class: { type: String, default: '' },
})
</script>

<template>
  <div :class="cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', props.class)">
    <slot />
  </div>
</template>
