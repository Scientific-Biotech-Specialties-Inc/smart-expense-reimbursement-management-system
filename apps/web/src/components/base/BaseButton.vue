<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps({
  variant: { type: String, default: 'primary' }, // primary | secondary | ghost | danger | destructive | outline | cta | icon
  size: { type: String, default: 'md' },          // sm | md | lg | icon
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
  requireHold: { type: Boolean, default: false }, // If true, requires 2s hold to emit click
  holdDuration: { type: Number, default: 2000 }
})

const emit = defineEmits(['click'])

// Map legacy variant names to shadcn Button variants
const mappedVariant = computed(() => {
  if (props.variant === 'danger') return 'destructive'
  if (props.variant === 'cta') return 'primary'
  return props.variant
})

// Map legacy sizes to shadcn Button sizes
const mappedSize = computed(() => {
  if (props.size === 'md') return 'default'
  return props.size
})

const isHolding = ref(false)
const progress = ref(0)
let holdTimer = null
let animationFrame = null
let startTime = null

function cancelHold() {
  isHolding.value = false
  progress.value = 0
  if (holdTimer) clearTimeout(holdTimer)
  if (animationFrame) cancelAnimationFrame(animationFrame)
  holdTimer = null
  animationFrame = null
  startTime = null
}

function updateProgress(timestamp) {
  if (!startTime) startTime = timestamp
  const elapsed = timestamp - startTime
  progress.value = Math.min((elapsed / props.holdDuration) * 100, 100)
  
  if (isHolding.value && progress.value < 100) {
    animationFrame = requestAnimationFrame(updateProgress)
  }
}

let clickEmittedByMouseDown = false
let resetMouseDownTimer = null

function handleClick(e) {
  if (props.disabled || props.loading) return
  if (!props.requireHold) {
    if (clickEmittedByMouseDown) {
      clickEmittedByMouseDown = false
      if (resetMouseDownTimer) clearTimeout(resetMouseDownTimer)
      return
    }
    emit('click', e)
  }
}

function startHold(e) {
  if (props.disabled || props.loading) return
  if (!props.requireHold) {
    clickEmittedByMouseDown = true
    emit('click', e)
    if (resetMouseDownTimer) clearTimeout(resetMouseDownTimer)
    resetMouseDownTimer = setTimeout(() => {
      clickEmittedByMouseDown = false
    }, 1000)
    return
  }
  
  isHolding.value = true
  progress.value = 0
  animationFrame = requestAnimationFrame(updateProgress)
  
  holdTimer = setTimeout(() => {
    cancelHold()
    emit('click', e)
  }, props.holdDuration)
}

onUnmounted(() => {
  cancelHold()
})
</script>

<template>
  <Button
    :type="type"
    :variant="mappedVariant"
    :size="mappedSize"
    :disabled="disabled || loading"
    class="relative overflow-hidden"
    @click="handleClick"
    @mousedown="startHold"
    @mouseup="cancelHold"
    @mouseleave="cancelHold"
    @touchstart.passive="startHold"
    @touchend.passive="cancelHold"
    @touchcancel.passive="cancelHold"
  >
    <!-- Hold Progress Indicator -->
    <div 
      v-if="requireHold && isHolding" 
      class="absolute inset-0 bg-black/20 origin-left"
      :style="{ width: `${progress}%`, transition: 'none' }"
    />
    
    <div class="relative z-10 flex items-center justify-center gap-2">
      <!-- Guardrail #6: Bifurcated Loading Spinner using Lucide Loader2 -->
      <Loader2 v-if="loading" class="animate-spin h-4 w-4" />
      <slot />
      <span v-if="requireHold && !isHolding && !loading" class="text-[9px] opacity-70 ml-1">(HOLD)</span>
    </div>
  </Button>
</template>
