<script setup>
import { cva } from 'class-variance-authority'
import { Primitive } from 'radix-vue'
import { cn } from '@/utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-sans text-xs font-semibold transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.98]',
        secondary: 'bg-white text-slate-800 border shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive-hover active:bg-destructive-pressed active:scale-[0.98]',
        outline: 'border bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        link: 'text-secondary underline-offset-4 hover:underline',
        cta: 'bg-primary text-primary-foreground shadow-md hover:bg-primary-hover active:bg-primary-pressed active:scale-[0.98]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 rounded-md px-2.5 text-[10px]',
        lg: 'h-11 rounded-md px-6 text-sm',
        icon: 'h-8 w-8 p-1.5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
)

const props = defineProps({
  as: { type: String, default: 'button' },
  asChild: { type: Boolean, default: false },
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'default' },
  class: { type: String, default: '' },
})
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
