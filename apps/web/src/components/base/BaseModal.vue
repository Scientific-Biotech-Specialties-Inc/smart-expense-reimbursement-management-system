<script setup>
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DialogTitle, DialogDescription, VisuallyHidden } from 'radix-vue'
import { cn } from '@/utils/cn'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  maxWidthClass: {
    type: String,
    default: "max-w-md",
  },
  zIndexClass: {
    type: String,
    default: "z-50",
  },
  contentClass: {
    type: String,
    default: "",
  },
  title: {
    type: String,
    default: "Modal Window",
  },
  description: {
    type: String,
    default: "Modal Window Content",
  }
})

const emit = defineEmits(["close"])

function onOpenChange(open) {
  if (!open) {
    emit("close")
  }
}

function handleOutsideInteraction(event) {
  if (
    event?.target?.closest?.("[data-image-preview-modal]") ||
    document.querySelector("[data-image-preview-modal]")
  ) {
    event.preventDefault()
  }
}

function handleEscapeKeyDown(event) {
  if (document.querySelector("[data-image-preview-modal]")) {
    event.preventDefault()
  }
}
</script>

<template>
  <Dialog :open="isOpen" @update:open="onOpenChange">
    <DialogContent
      :show-close="false"
      :overlay-class="zIndexClass"
      :class="cn('p-0 overflow-hidden rounded-2xl border-none shadow-2xl bg-white', zIndexClass, maxWidthClass, contentClass)"
      @pointer-down-outside="handleOutsideInteraction"
      @interact-outside="handleOutsideInteraction"
      @focus-outside="handleOutsideInteraction"
      @escape-key-down="handleEscapeKeyDown"
    >
      <!-- VisuallyHidden fallback for Radix Dialog Accessibility -->
      <VisuallyHidden as-child>
        <DialogTitle>{{ title }}</DialogTitle>
      </VisuallyHidden>
      <VisuallyHidden as-child>
        <DialogDescription>{{ description }}</DialogDescription>
      </VisuallyHidden>

      <slot />
    </DialogContent>
  </Dialog>
</template>
