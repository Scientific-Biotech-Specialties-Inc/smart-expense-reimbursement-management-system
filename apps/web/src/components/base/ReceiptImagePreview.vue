<script setup>
import { computed, ref } from "vue";
import { Trash2, ZoomIn } from "lucide-vue-next";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";
import StackedReceiptDeck from "@/components/base/StackedReceiptDeck.vue";
import ImagePreviewModal from "@/components/base/ImagePreviewModal.vue";
import { cleanName } from "@/utils/receiptUtils";

const props = defineProps({
  src: {
    type: String,
    default: null,
  },
  images: {
    type: Array,
    default: () => [],
  },
  fileName: {
    type: String,
    default: "",
  },
  index: {
    type: [Number, String],
    default: null,
  },
  fileType: {
    type: String,
    default: "",
  },
  isUploading: {
    type: Boolean,
    default: false,
  },
  isProcessing: {
    type: Boolean,
    default: false,
  },
  allowRemove: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  enableZoom: {
    type: Boolean,
    default: true,
  },
  aspectClass: {
    type: String,
    default: "aspect-[3/4]",
  },
  frameClass: {
    type: String,
    default: "rounded-xl border border-slate-200 bg-white shadow-sm",
  },
  imgClass: {
    type: String,
    default: "w-full h-full object-contain",
  },
  alt: {
    type: String,
    default: "",
  },
  showBadge: {
    type: Boolean,
    default: true,
  },
  showDeleteButton: {
    type: Boolean,
    default: true,
  },
  deleteLabel: {
    type: String,
    default: "Delete Receipt",
  },
  receipt: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["remove", "click-image"]);

const isPreviewModalOpen = ref(false);
const activeDeckIndex = ref(0);

const displayTitle = computed(() => {
  const raw =
    props.fileName ||
    props.receipt?.fileName ||
    props.receipt?.name ||
    props.receipt?.merchantName ||
    props.receipt?.vendor_name ||
    "";
  return cleanName(raw);
});

const resolvedImages = computed(() => {
  if (Array.isArray(props.images) && props.images.length > 0) {
    return props.images;
  }
  if (Array.isArray(props.receipt?.images) && props.receipt.images.length > 0) {
    return props.receipt.images;
  }
  if (Array.isArray(props.receipt?.file_url) && props.receipt.file_url.length > 1) {
    return props.receipt.file_url;
  }
  if (Array.isArray(props.receipt?.file_path) && props.receipt.file_path.length > 1) {
    return props.receipt.file_path;
  }
  return [];
});

const isMultiReceipt = computed(() => {
  return resolvedImages.value.length > 1;
});

const isPdf = computed(() => {
  const type = String(props.fileType || props.receipt?.fileType || "").toLowerCase();
  if (type === "application/pdf" || type === "pdf") return true;
  const source = String(props.src || "").toLowerCase();
  return source.endsWith(".pdf") || source.includes(".pdf?");
});

const canPreview = computed(() => {
  if (!props.enableZoom || props.isUploading || props.isProcessing) return false;
  if (isMultiReceipt.value) return true;
  return Boolean(props.src) && !isPdf.value;
});

function handleImageClick(event) {
  emit("click-image", { event, receipt: props.receipt, src: props.src });
  if (canPreview.value) {
    isPreviewModalOpen.value = true;
  }
}

function handleDeckActiveClick(payload) {
  activeDeckIndex.value = payload.index;
  emit("click-image", {
    receipt: props.receipt,
    src: payload.src,
    index: payload.index,
  });
  if (canPreview.value) {
    isPreviewModalOpen.value = true;
  }
}

function handleRemove() {
  emit("remove", props.receipt);
}
</script>

<template>
  <div
    :class="[
      'flex flex-col',
      (showBadge && (index !== null || displayTitle)) ||
      $slots.actions ||
      (showDeleteButton && allowRemove && !disabled)
        ? 'gap-4'
        : '',
    ]"
  >
    <!-- Receipt Number Badge & Filename -->
    <div
      v-if="showBadge && (index !== null || displayTitle)"
      class="flex items-center gap-2 mb-0"
    >
      <span
        v-if="index !== null"
        class="w-6 h-6 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center shrink-0"
      >
        {{ index }}
      </span>
      <span
        v-if="displayTitle"
        class="text-xs font-bold text-primary truncate"
        :title="displayTitle"
      >
        {{ displayTitle }}
      </span>
    </div>

    <!-- Multi-Receipt Stacked Deck (when merged images are considered one receipt) -->
    <div v-if="isMultiReceipt" class="relative h-full">
      <StackedReceiptDeck
        :images="resolvedImages"
        :aspect-class="aspectClass"
        :alt="alt || displayTitle || 'Receipt segment'"
        :disabled="disabled || isUploading || isProcessing"
        :enable-zoom="canPreview"
        v-model:active-index="activeDeckIndex"
        @click-active="handleDeckActiveClick"
      />

      <!-- Uploading / Processing State Overlay -->
      <div
        v-if="isUploading || isProcessing"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 text-accent backdrop-blur-[1px] z-40 rounded-xl"
      >
        <span
          class="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
        <span class="text-[10px] font-bold uppercase tracking-widest text-center px-2">
          {{ isProcessing ? "Extracting OCR Data..." : "Uploading..." }}
        </span>
      </div>
    </div>

    <!-- Single Image Preview Frame (standard single receipt) -->
    <div
      v-else
      :class="[
        'relative overflow-hidden flex items-center justify-center',
        frameClass,
        aspectClass,
        canPreview ? 'cursor-pointer group' : '',
      ]"
      :title="canPreview ? 'Click to zoom and preview receipt' : ''"
      @click="handleImageClick"
    >
      <BaseReceiptImage
        :src="src"
        :alt="alt || displayTitle || 'Receipt Image'"
        :file-type="fileType"
        :img-class="imgClass"
        icon-size-class="w-12 h-12 opacity-40"
      />

      <!-- Uploading / Processing State Overlay -->
      <div
        v-if="isUploading || isProcessing"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/80 text-accent backdrop-blur-[1px] z-10"
      >
        <span
          class="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
        <span class="text-[10px] font-bold uppercase tracking-widest text-center px-2">
          {{ isProcessing ? "Extracting OCR Data..." : "Uploading..." }}
        </span>
      </div>

      <!-- Hover Preview Overlay Indicator -->
      <div
        v-else-if="canPreview"
        class="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/15 transition-all duration-200 flex items-center justify-center pointer-events-none z-10"
      >
        <span
          class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5"
        >
          <ZoomIn class="w-3.5 h-3.5" />
          Click to preview
        </span>
      </div>
    </div>

    <!-- Actions Area (Delete Receipt or Custom Slot) -->
    <div v-if="$slots.actions || (showDeleteButton && allowRemove && !disabled)">
      <slot name="actions">
        <button
          v-if="showDeleteButton && allowRemove && !disabled"
          class="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 text-xs font-bold text-danger transition-colors hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="isUploading || isProcessing || disabled"
          @click="handleRemove"
        >
          <Trash2 class="w-3.5 h-3.5" /> {{ deleteLabel }}
        </button>
      </slot>
    </div>

    <!-- Fullscreen Lightbox Zoom Modal -->
    <ImagePreviewModal
      v-if="canPreview"
      v-model="isPreviewModalOpen"
      :src="isMultiReceipt ? (resolvedImages[activeDeckIndex]?.url || resolvedImages[activeDeckIndex]) : src"
      :images="isMultiReceipt ? resolvedImages : []"
      :initial-index="activeDeckIndex"
      :alt="alt || displayTitle || 'Receipt Image'"
      :title="displayTitle ? `Receipt - ${displayTitle}` : 'Receipt Preview'"
    />
  </div>
</template>
