<script setup>
import { computed, ref } from "vue";
import { ZoomIn } from "lucide-vue-next";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";

const props = defineProps({
  images: {
    type: Array,
    required: true,
    default: () => [],
  },
  aspectClass: {
    type: String,
    default: "aspect-[3/4]",
  },
  alt: {
    type: String,
    default: "Receipt segment",
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  activeIndex: {
    type: Number,
    default: null,
  },
  modelValue: {
    type: Number,
    default: null,
  },
  enableZoom: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits([
  "click-active",
  "select-card",
  "update:modelValue",
  "update:activeIndex",
]);

const internalActiveIndex = ref(0);

const currentActiveIndex = computed(() => {
  if (props.activeIndex !== null && props.activeIndex !== undefined) {
    return props.activeIndex;
  }
  if (props.modelValue !== null && props.modelValue !== undefined) {
    return props.modelValue;
  }
  return internalActiveIndex.value;
});

const normalizedImages = computed(() => {
  return (props.images || []).map((img, idx) => {
    if (typeof img === "string") {
      return { id: `seg-${idx}`, url: img, name: `Segment ${idx + 1}` };
    }
    return {
      id: img.id || `seg-${idx}`,
      url: img.url || img.thumbnail || img.preview || img.filePath || img.file_url || "",
      name: img.name || img.fileName || `Segment ${idx + 1}`,
      fileType: img.fileType || "",
    };
  });
});

function getImageSrc(item) {
  return item?.url || "";
}

function getCardStyle(idx) {
  const total = normalizedImages.value.length;
  if (total <= 1) {
    return {
      top: "8px",
      bottom: "8px",
      height: "calc(100% - 16px)",
      zIndex: 10,
    };
  }

  const current = currentActiveIndex.value;
  const tabHeight = total > 4 ? 28 : 34; // Dynamic tab height based on count
  const totalTabOffset = (total - 1) * tabHeight;

  let style = {
    height: `calc(100% - 16px - ${totalTabOffset}px)`,
  };

  if (idx < current) {
    // Docked at top
    style.top = `${8 + idx * tabHeight}px`;
    style.zIndex = 10 + idx;
  } else if (idx === current) {
    // Active card: positioned below top tabs
    style.top = `${8 + current * tabHeight}px`;
    style.zIndex = 30;
  } else {
    // Docked at bottom
    const fromBottom = (total - 1 - idx) * tabHeight;
    style.bottom = `${8 + fromBottom}px`;
    style.zIndex = 10 + (total - idx);
  }

  return style;
}

function handleCardClick(idx, item) {
  if (props.disabled) return;

  if (idx === currentActiveIndex.value) {
    emit("click-active", {
      index: idx,
      image: props.images[idx] || item,
      src: getImageSrc(item),
    });
  } else {
    internalActiveIndex.value = idx;
    emit("select-card", idx);
    emit("update:modelValue", idx);
    emit("update:activeIndex", idx);
  }
}
</script>

<template>
  <div
    :class="[
      'relative w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100/70 shadow-inner select-none p-2',
      aspectClass,
    ]"
    role="region"
    aria-label="Stacked multi-receipt photos"
  >
    <div
      v-for="(item, idx) in normalizedImages"
      :key="item.id"
      data-testid="stacked-receipt-card"
      :style="getCardStyle(idx)"
      :class="[
        'absolute inset-x-2.5 rounded-xl border bg-white overflow-hidden cursor-pointer transition-all duration-300 ease-out group',
        'hover:-translate-y-3 hover:shadow-xl',
        idx === currentActiveIndex
          ? 'border-accent/40 shadow-lg ring-2 ring-accent/30'
          : 'border-slate-200/90 shadow-md hover:border-accent/30 opacity-95 hover:opacity-100',
      ]"
      :title="
        idx === currentActiveIndex
          ? 'Click to zoom and preview in fullscreen'
          : `Click to view Part ${idx + 1}`
      "
      @click="handleCardClick(idx, item)"
    >
      <!-- Floating Frosted Tab Badge (Top Left) -->
      <div
        class="absolute top-2 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none"
      >
        <span
          :class="[
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-sm backdrop-blur-md transition-colors duration-200',
            idx === currentActiveIndex
              ? 'bg-primary text-white ring-1 ring-white/20'
              : 'bg-slate-900/65 text-white/90 group-hover:bg-slate-900/85',
          ]"
        >
          Part {{ idx + 1 }}
        </span>
      </div>

      <!-- Receipt Image -->
      <div class="w-full h-full bg-white flex items-center justify-center overflow-hidden">
        <BaseReceiptImage
          :src="getImageSrc(item)"
          :alt="`${alt} - Part ${idx + 1}`"
          :file-type="item.fileType"
          img-class="w-full h-full object-cover object-top"
          icon-size-class="w-10 h-10 opacity-30"
        />
      </div>

      <!-- Hover / Active Preview Overlay for Active Card -->
      <div
        v-if="idx === currentActiveIndex && enableZoom"
        class="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/15 transition-all duration-200 flex items-center justify-center pointer-events-none z-10"
      >
        <span
          class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-900/85 backdrop-blur-sm text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5"
        >
          <ZoomIn class="w-3.5 h-3.5" />
          Click to preview
        </span>
      </div>
    </div>
  </div>
</template>
