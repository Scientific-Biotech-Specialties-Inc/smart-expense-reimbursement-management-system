<script setup>
import { ref } from 'vue'

const props = defineProps({
  images: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['select-card', 'click-active'])

const activeIndex = ref(0)

function getImageUrl(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.url || item.src || ''
}

function handleCardClick(item, index) {
  if (index === activeIndex.value) {
    emit('click-active', { index, image: item })
  } else {
    activeIndex.value = index
    emit('select-card', index)
  }
}
</script>

<template>
  <div class="relative flex items-center gap-3 overflow-x-auto py-2">
    <div
      v-for="(img, idx) in images"
      :key="idx"
      data-testid="stacked-receipt-card"
      class="group relative cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
      :class="idx === activeIndex ? 'ring-2 ring-primary border-primary' : 'border-slate-200 opacity-90 hover:opacity-100'"
      @click="handleCardClick(img, idx)"
    >
      <div class="absolute top-2 left-2 z-10 rounded bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        Part {{ idx + 1 }}
      </div>
      <img
        :src="getImageUrl(img)"
        :alt="`Part ${idx + 1}`"
        class="h-32 w-24 object-cover"
        loading="lazy"
      />
    </div>
  </div>
</template>
