<script setup>
import { computed } from "vue";
import { formatPeso, formatDate } from "@/utils/formatters";
import BaseReceiptDetailModal from "@/components/base/BaseReceiptDetailModal.vue";
import { CheckCircle, XCircle } from "lucide-vue-next";

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  receipt: { type: Object, default: null },
  pendingDecision: { type: String, default: "" },
  isReviewingOwnLiquidation: { type: Boolean, default: false },
  getFileUrl: { type: Function, required: true },
});

const emit = defineEmits(["close", "close-review", "request-decision", "cancel-decision", "confirm-decision"]);

/** Normalize to shared shape */
const normalizedReceipt = computed(() => {
  if (!props.receipt) return null;
  return {
    imageUrl: props.getFileUrl(props.receipt.filePath) || null,
    invoiceNumber: props.receipt.invoiceNumber || "--",
    date: formatDate(props.receipt.transactionDate || props.receipt.transaction_date || props.receipt.date),
    vendor: props.receipt.merchantName || "Unknown Vendor",
    category: props.receipt.category || "—",
    tin: props.receipt.tinNumber || "—",
    vatClassification: "VAT",
    currency: "PHP",
    items: props.receipt.items || [],
    amount: props.receipt.amount || 0,
    vat: props.receipt.vat || 0,
    discountAmount: props.receipt.discountAmount ?? props.receipt.discount_amount ?? 0,
    discountType: props.receipt.discountType ?? props.receipt.discount_type ?? "none",
    status: props.receipt.decision === "accepted" ? "approved" : props.receipt.decision || "pending",
  };
});
</script>

<template>
  <BaseReceiptDetailModal
    :is-open="isOpen && !!receipt"
    :receipt="normalizedReceipt"
    @close="emit('close')"
  >
    <template #actions>
      <div v-if="!isReviewingOwnLiquidation">
        <!-- Pending Confirmation -->
        <div v-if="pendingDecision" class="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p class="text-sm text-slate-700 capitalize">{{ pendingDecision }} this receipt?</p>
          <div class="flex gap-2 shrink-0">
            <button class="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-100" @click="emit('cancel-decision')">Cancel</button>
            <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90" @click="emit('confirm-decision')">Confirm</button>
          </div>
        </div>

        <!-- Decision Buttons -->
        <div v-else class="flex items-center justify-end gap-2">
          <button
            class="px-4 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 flex items-center justify-center gap-1.5 transition-colors"
            @click="emit('request-decision', 'rejected')"
          >
            <XCircle class="w-3.5 h-3.5" /> Reject
          </button>
          <button
            class="px-5 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            @click="emit('request-decision', 'accepted')"
          >
            <CheckCircle class="w-3.5 h-3.5" /> Accept
          </button>
        </div>
      </div>
      <p v-else class="text-xs text-danger">You cannot process your own liquidation.</p>
    </template>
  </BaseReceiptDetailModal>
</template>
