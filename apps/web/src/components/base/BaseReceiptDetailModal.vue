<script setup>
import { computed, ref } from "vue";
import { formatAmount } from "@/utils/formatters";
import { formatDiscountTypeLabel, normalizeDiscountType } from "@/utils/receiptUtils";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseModal from "@/components/base/BaseModal.vue";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";
import ImagePreviewModal from "@/components/base/ImagePreviewModal.vue";
import { X, ZoomIn } from "lucide-vue-next";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  /** Normalized receipt object */
  receipt: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close"]);

const isImagePreviewOpen = ref(false);

const isPdf = computed(() => {
  const type = String(props.receipt?.fileType || "").toLowerCase();
  if (type === "application/pdf" || type === "pdf") return true;
  const source = String(props.receipt?.imageUrl || "").toLowerCase();
  return source.endsWith(".pdf") || source.includes(".pdf?");
});

const canPreview = computed(() => {
  return Boolean(props.receipt?.imageUrl) && !isPdf.value;
});

function handleImageClick() {
  if (canPreview.value) {
    isImagePreviewOpen.value = true;
  }
}

const hasItems = computed(() => props.receipt?.items?.length > 0);

const discountAmount = computed(
  () => Number(props.receipt?.discountAmount ?? props.receipt?.discount) || 0,
);

const discountType = computed(() =>
  normalizeDiscountType(
    props.receipt?.discountType ?? props.receipt?.discount_type,
    discountAmount.value,
  ),
);

const discountTypeLabel = computed(() =>
  formatDiscountTypeLabel(discountType.value),
);

const subtotal = computed(() => {
  if (hasItems.value) {
    return props.receipt.items.reduce(
      (sum, item) => sum + (Number(item.price) || 0),
      0,
    );
  }
  return (Number(props.receipt?.amount) || 0) - (Number(props.receipt?.vat) || 0);
});
</script>

<template>
  <BaseModal
    :is-open="isOpen && !!receipt"
    max-width-class="max-w-[840px]"
    z-index-class="z-[60]"
    content-class="w-full rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] flex flex-col md:flex-row p-6 gap-6 overflow-hidden min-h-[480px] max-h-[92vh]"
    :title="receipt?.vendor ? `Receipt Details - ${receipt.vendor}` : 'Receipt Details'"
    description="Receipt image and extracted expense details."
    @close="emit('close')"
  >
    <template v-if="receipt">
      <!-- Close Button -->
      <button
        type="button"
        aria-label="Close receipt details"
        @click="emit('close')"
        class="absolute top-2 right-2 text-slate-400 hover:bg-slate-100 transition-colors p-1.5 rounded-full flex items-center justify-center z-10"
      >
        <X class="w-4 h-4" />
      </button>

      <!-- Left Column: Image -->
      <div
        :class="[
          'w-full md:w-5/12 bg-gradient-to-b from-slate-100 to-slate-50 rounded-2xl flex items-center justify-center p-4 shrink-0 relative overflow-hidden min-h-[360px]',
          canPreview ? 'cursor-pointer group' : '',
        ]"
        :title="canPreview ? 'Click to zoom and preview receipt' : ''"
        @click="handleImageClick"
      >
          <BaseReceiptImage
            :src="receipt.imageUrl"
            :alt="receipt.vendor || 'Receipt'"
            :file-type="receipt.fileType"
            img-class="w-full h-full object-contain rounded-md transition-transform duration-200 group-hover:scale-[1.02]"
            icon-size-class="w-10 h-10"
            badge-size-class="w-16 h-16 rounded-2xl"
          />

          <!-- Hover Preview Overlay Badge -->
          <div
            v-if="canPreview"
            class="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/15 transition-all duration-200 rounded-2xl flex items-center justify-center pointer-events-none"
          >
            <span
              class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-medium px-3 py-1.5 rounded-full shadow-md flex items-center gap-1.5"
            >
              <ZoomIn class="w-3.5 h-3.5" />
              Click to preview
            </span>
          </div>
        </div>

        <!-- Right Column: Content -->
        <div class="w-full md:w-7/12 flex flex-col overflow-y-auto">
          <!-- Header -->
          <div class="flex justify-between items-end border-b border-slate-100 pb-4 mb-4">
            <div class="flex flex-col gap-0.5">
              <span class="text-[11px] text-slate-400 uppercase tracking-wide">Invoice</span>
              <span class="text-sm text-slate-700">{{ receipt.invoiceNumber || "--" }}</span>
            </div>
            <div class="flex flex-col gap-0.5 items-end">
              <span class="text-sm text-slate-500">{{ receipt.date || "--" }}</span>
            </div>
          </div>

          <!-- Vendor -->
          <div class="mb-4">
            <span class="text-[11px] text-slate-400 uppercase tracking-wide">Vendor</span>
            <p class="text-base font-medium text-slate-800 mt-0.5">{{ receipt.vendor || "Unknown Vendor" }}</p>
          </div>

          <!-- Details Grid -->
          <div class="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Category</p>
              <p class="text-sm text-slate-700">{{ receipt.category || "—" }}</p>
            </div>
            <div v-if="receipt.eventType">
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Type of Event</p>
              <p class="text-sm text-slate-700">{{ receipt.eventType }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">TIN</p>
              <p class="text-sm text-slate-700">{{ receipt.tin || "—" }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">VAT</p>
              <!-- Slot for editable VAT (admin reimbursement review) -->
              <slot name="vat-field">
                <p class="text-sm text-slate-700 uppercase">{{ receipt.vatClassification || "—" }}</p>
              </slot>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Currency</p>
              <p class="text-sm text-slate-700">{{ receipt.currency || "PHP" }}</p>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Discount Type</p>
              <slot name="discount-type-field">
                <p class="text-sm text-slate-700">{{ discountTypeLabel }}</p>
              </slot>
            </div>
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">Discount Amount</p>
              <slot name="discount-amount-field">
                <p class="text-sm text-slate-700">{{ formatAmount(discountAmount, receipt.currency || "PHP") }}</p>
              </slot>
            </div>
          </div>

          <!-- Items -->
          <div v-if="hasItems" class="mb-4">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Items</p>
            <div class="rounded-lg border border-slate-100 divide-y divide-slate-50 overflow-hidden">
              <div
                v-for="item in receipt.items"
                :key="item.name || item.id"
                class="flex items-center justify-between px-3.5 py-2 text-sm"
              >
                <span class="text-slate-600">{{ item.name }} ({{ item.quantity }}x)</span>
                <span class="text-slate-500 text-xs">{{ formatAmount(item.price, receipt.currency || "PHP") }}</span>
              </div>
            </div>
          </div>

          <!-- Amount Summary -->
          <div class="flex flex-col gap-2 pt-3 border-t border-slate-100 mb-4">
            <div class="flex justify-between text-sm">
              <span class="text-slate-400">Subtotal</span>
              <span class="text-slate-600">{{ formatAmount(subtotal, receipt.currency || "PHP") }}</span>
            </div>
            <div v-if="discountAmount > 0" class="flex justify-between text-sm text-emerald-700">
              <span>Discount ({{ discountTypeLabel }})</span>
              <span>-{{ formatAmount(discountAmount, receipt.currency || "PHP") }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-400">VAT</span>
              <span class="text-slate-600">{{ formatAmount(receipt.vat || 0, receipt.currency || "PHP") }}</span>
            </div>
            <div class="flex justify-between pt-2 border-t border-slate-100">
              <span class="text-sm text-slate-700">Total</span>
              <span class="text-base font-semibold text-primary">
                {{ formatAmount(receipt.amount || 0, receipt.currency || "PHP") }}
              </span>
            </div>
          </div>

          <!-- Status -->
          <div class="flex justify-between items-center mb-4">
            <span class="text-sm text-slate-500">Status</span>
            <StatusBadge :status="receipt.status || 'pending'" />
          </div>

          <!-- Action Footer (slot) -->
          <div v-if="$slots.actions" class="mt-auto pt-3 border-t border-slate-100">
            <slot name="actions" />
          </div>
        </div>
    </template>
  </BaseModal>

  <!-- Reusable Fullscreen Image Preview Lightbox -->
  <ImagePreviewModal
    v-if="canPreview"
    v-model="isImagePreviewOpen"
    :src="receipt?.imageUrl || ''"
    :alt="receipt?.vendor || 'Receipt'"
    :title="receipt?.invoiceNumber ? `Invoice #${receipt.invoiceNumber}` : (receipt?.vendor || 'Receipt Image')"
    z-index-class="z-[110]"
  />
</template>
