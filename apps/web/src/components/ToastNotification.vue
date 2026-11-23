<template>
  <div class="fixed bottom-6 right-6 z-[1200] pointer-events-none w-80 max-w-full sm:w-96">
    <TransitionGroup name="toast" tag="div" class="flex flex-col gap-3">
      <div 
        v-for="toast in toasts" 
        :key="toast.id"
        class="toast-item pointer-events-auto flex items-start gap-3 p-4 rounded-xl bg-white border border-slate-200/80 shadow-lg text-sm min-w-[300px] max-w-md transform transition-all duration-200 ease-out border-l-4 font-sans"
        :class="getBorderClass(toast.type)"
        @mouseenter="pauseToast(toast.id)"
        @mouseleave="resumeToast(toast.id)"
      >
        <!-- Circular status icon badge per Section VI.8 -->
        <div 
          class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          :class="getIconBadgeClass(toast.type)"
        >
          <component
            :is="getIcon(toast.type)"
            class="w-4 h-4"
          />
        </div>

        <div class="flex-1 min-w-0 flex flex-col pt-0.5">
          <div v-if="toast.title" class="font-bold text-xs uppercase tracking-wider text-slate-800 mb-0.5 font-sans">
            {{ toast.title }}
          </div>
          <div class="text-sm font-semibold text-slate-700 break-words font-sans" :class="{ 'uppercase tracking-wide': !toast.title }">
            {{ toast.message }}
          </div>
        </div>

        <button 
          @click="removeToast(toast.id)"
          class="shrink-0 ml-2 text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-md hover:bg-slate-100"
          aria-label="Close"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'

const { toasts, removeToast, pauseToast, resumeToast } = useToast()

function getBorderClass(type) {
  switch (type) {
    case 'error':
    case 'danger':
      return 'border-l-danger border-l-[#EF4444]'
    case 'warning':
    case 'warn':
      return 'border-l-warning border-l-[#F59E0B]'
    case 'success':
      return 'border-l-success border-l-[#10B981]'
    case 'info':
    default:
      return 'border-l-accent border-l-[#2E85D8]'
  }
}

function getIconBadgeClass(type) {
  switch (type) {
    case 'error':
    case 'danger':
      return 'bg-red-50 text-red-500'
    case 'warning':
    case 'warn':
      return 'bg-amber-50 text-amber-500'
    case 'success':
      return 'bg-emerald-50 text-emerald-500'
    case 'info':
    default:
      return 'bg-blue-50 text-blue-500'
  }
}

function getIcon(type) {
  switch (type) {
    case 'error':
    case 'danger':
      return AlertCircle
    case 'warning':
    case 'warn':
      return AlertTriangle
    case 'success':
      return CheckCircle
    case 'info':
    default:
      return Info
  }
}
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(30px) scale(0.95);
}
</style>
