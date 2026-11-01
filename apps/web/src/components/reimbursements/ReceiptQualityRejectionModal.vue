<script setup>
import { computed, ref, watch } from "vue";
import {
  AlertTriangle,
  X,
  RefreshCw,
  Layers,
  ArrowRight,
  Sun,
  Camera,
  Maximize2,
  AlertCircle,
} from "lucide-vue-next";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  rejectedFile: {
    type: Object,
    default: null,
  },
  rejectionCode: {
    type: String,
    default: "blurry", // "blurry" | "too_dark" | "too_small"
  },
  rejectionReason: {
    type: String,
    default: "Image quality is too low for accurate OCR data extraction.",
  },
  showSegmentedOption: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits([
  "close",
  "retake",
  "upload-segmented",
  "continue-anyway",
]);

const previewUrl = ref("");

watch(
  () => props.rejectedFile,
  (file) => {
    if (previewUrl.value && previewUrl.value.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl.value);
    }
    if (file && file instanceof File && file.type.startsWith("image/")) {
      previewUrl.value = URL.createObjectURL(file);
    } else {
      previewUrl.value = "";
    }
  },
  { immediate: true },
);

const isDuplicate = computed(() => props.rejectionCode === "duplicate");
const isNotReceipt = computed(() => props.rejectionCode === "not_a_receipt");
const isBlurry = computed(() => props.rejectionCode === "blurry");

const headerTitle = computed(() => {
  if (isDuplicate.value) return "Duplicate Receipt Detected";
  if (isNotReceipt.value) return "Unrecognized Receipt Image";
  if (isBlurry.value) return "Blurry Receipt Image Detected";
  return "Receipt Image Quality Issue";
});

const headerSubtitle = computed(() => {
  if (isDuplicate.value) return "This receipt has already been submitted to the system";
  if (isNotReceipt.value) return "The uploaded image does not appear to be a valid receipt or invoice";
  if (isBlurry.value) return "The receipt image is out of focus and cannot be read accurately";
  return "Action required to ensure accurate OCR data extraction";
});

const badgeLabel = computed(() => {
  switch (props.rejectionCode) {
    case "not_a_receipt":
      return "Not a Receipt";
    case "blurry":
      return "Blurry Image";
    case "too_dark":
      return "Too Dark";
    case "too_small":
      return "Resolution Too Low";
    case "duplicate":
      return "Duplicate Receipt";
    default:
      return "Bad Image Quality";
  }
});

const overrideButtonLabel = computed(() => {
  if (isNotReceipt.value) return "Continue Anyway (Enter Manually)";
  if (isBlurry.value) return "Continue Anyway (Override Warning)";
  return "Continue Anyway (Override Quality)";
});

const tips = computed(() => {
  switch (props.rejectionCode) {
    case "not_a_receipt":
      return [
        "Ensure you are uploading an official receipt, sales invoice, or billing statement",
        "Make sure the merchant name, date, and total amount are clearly visible",
        "Avoid uploading selfies, random photos, or unrelated screenshots",
      ];
    case "blurry":
      return [
        "Hold your device steady with both hands",
        "Tap the screen on the receipt text to focus",
        "Avoid camera shake or fast movement",
      ];
    case "too_dark":
      return [
        "Turn on your camera flash or move to bright light",
        "Avoid casting shadows over the receipt",
        "Ensure contrast between receipt paper and background",
      ];
    case "too_small":
      return [
        "Move closer to capture the receipt full-screen",
        "For very long receipts, try capturing in multiple segments",
        "Avoid zooming in digitally before snapping",
      ];
    case "duplicate":
      return [
        "Check if you or a team member already uploaded this receipt",
        "Ensure you are uploading a new, unique receipt",
        "Contact support if you believe this is a false match",
      ];
    default:
      return [
        "Ensure the receipt text is clear and readable",
        "Keep the full receipt within the photo frame",
      ];
  }
});
</script>

<template>
  <Transition name="modal">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
    >
      <div
        class="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl animate-fade-up"
      >
        <!-- Modal Header -->
        <header
          class="flex items-center justify-between border-b border-red-100 bg-red-50/70 px-6 py-4 text-red-950"
        >
          <div class="flex items-center gap-3">
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-danger shadow-sm"
            >
              <AlertTriangle class="h-5 w-5" />
            </span>
            <div>
              <h3 class="font-heading text-base font-bold text-slate-900">
                {{ headerTitle }}
              </h3>
              <p class="text-xs font-medium text-slate-500">
                {{ headerSubtitle }}
              </p>
            </div>
          </div>
        </header>

        <!-- Modal Content Grid -->
        <div class="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div class="grid grid-cols-1 gap-6 md:grid-cols-12">
            <!-- Left: Image Preview with Overlay Badge -->
            <div class="md:col-span-5 flex flex-col items-center">
              <div
                class="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-red-200 bg-slate-100 shadow-inner flex items-center justify-center"
              >
                <img
                  v-if="previewUrl"
                  :src="previewUrl"
                  alt="Rejected receipt preview"
                  class="h-full w-full object-contain filter contrast-90 brightness-90"
                />
                <div
                  v-else
                  class="flex flex-col items-center gap-2 text-slate-400 p-4 text-center"
                >
                  <Camera class="h-10 w-10 stroke-1" />
                  <span class="text-xs font-semibold">Image Preview</span>
                </div>

                <!-- Rejection Code Badge Overlay -->
                <div
                  class="absolute top-3 left-3 right-3 flex items-center justify-between rounded-lg bg-red-600/90 px-3 py-1.5 text-white backdrop-blur-md shadow-md"
                >
                  <span class="text-[11px] font-bold uppercase tracking-wider">
                    {{ badgeLabel }}
                  </span>
                  <AlertCircle class="h-3.5 w-3.5 shrink-0" />
                </div>
              </div>
            </div>

            <!-- Right: Reason & Recommendation Tips -->
            <div class="md:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <div
                  class="rounded-xl border border-red-100 bg-red-50/50 p-4 mb-4"
                >
                  <p
                    class="text-xs font-bold uppercase tracking-wider text-danger mb-1"
                  >
                    Rejection Reason
                  </p>
                  <p class="text-sm font-semibold text-slate-800">
                    {{ rejectionReason }}
                  </p>
                </div>

                <div>
                  <h4
                    class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2"
                  >
                    {{ isDuplicate ? "Recommendations" : "Tips for a Better Scan" }}
                  </h4>
                  <ul class="space-y-2 text-xs font-medium text-slate-600">
                    <li
                      v-for="(tip, idx) in tips"
                      :key="idx"
                      class="flex items-start gap-2"
                    >
                      <span
                        class="h-4 w-4 shrink-0 rounded-full bg-accent-50 text-accent font-bold text-[10px] flex items-center justify-center mt-0.5"
                      >
                        {{ idx + 1 }}
                      </span>
                      <span>{{ tip }}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- Segment suggestion banner if resolution is low/long receipt -->
              <div
                v-if="(rejectionCode === 'too_small' || showSegmentedOption) && !isDuplicate && !isNotReceipt"
                class="rounded-xl border border-accent/20 bg-accent-50 p-3 flex items-start gap-3"
              >
                <Layers class="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <p class="text-xs font-bold text-accent">Long Receipt?</p>
                  <p class="text-[11px] font-medium text-slate-600">
                    If this receipt is too long or texts are too small, upload
                    it in 2–4 zoomed-in photo segments.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <footer
          class="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4"
        >
          <button
            v-if="!isDuplicate"
            type="button"
            class="text-xs font-semibold text-slate-500 hover:text-slate-800 underline underline-offset-4 transition-colors"
            @click="emit('continue-anyway')"
          >
            {{ overrideButtonLabel }}
          </button>
          <div v-else class="text-xs text-slate-400 font-medium">
            Duplicate receipts cannot be overridden.
          </div>

          <div
            class="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto"
          >
            <button
              v-if="showSegmentedOption && !isDuplicate && !isNotReceipt"
              type="button"
              class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-accent/30 bg-white px-3.5 text-xs font-bold text-accent shadow-sm hover:bg-accent-50 transition-colors"
              @click="emit('upload-segmented')"
            >
              <Layers class="h-3.5 w-3.5" />
              Upload in Segments
            </button>

            <button
              type="button"
              class="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-danger px-4 text-xs font-bold text-white shadow-md hover:bg-red-700 transition-colors"
              @click="emit('retake')"
            >
              <RefreshCw class="h-3.5 w-3.5" />
              Upload New Receipt
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease-out;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
