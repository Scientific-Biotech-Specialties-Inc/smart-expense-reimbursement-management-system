<script setup>
import { computed, ref } from "vue";
import { formatAmount, formatDate } from "@/utils/formatters";
import { canEditReceipt, canDeleteReceipt } from "@/utils/receiptUtils";
import BaseReceiptDetailModal from "@/components/base/BaseReceiptDetailModal.vue";
import { Pencil, Trash2 } from "lucide-vue-next";

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  receipt: { type: Object, default: null },
});

const emit = defineEmits(["update:modelValue", "delete", "edit"]);

const canEdit = computed(() => canEditReceipt(props.receipt));
const canDelete = computed(() => canDeleteReceipt(props.receipt));

function close() {
  emit("update:modelValue", false);
}

function editReceipt() {
  emit("edit", props.receipt);
  close();
}

/** Normalize receipt to the shared shape */
const normalizedReceipt = computed(() => {
  if (!props.receipt) return null;
  return {
    imageUrl: props.receipt.thumbnail || null,
    invoiceNumber: props.receipt.invoiceNumber || props.receipt.fileName,
    date: formatDate(props.receipt.date || props.receipt.transaction_date || props.receipt.transactionDate),
    vendor: props.receipt.vendorName || "Unknown Vendor",
    category: props.receipt.category || "—",
    tin: props.receipt.tin || "—",
    vatClassification: props.receipt.vatClassification || "—",
    currency: props.receipt.currency || "PHP",
    items: props.receipt.items || [],
    amount: props.receipt.amount || 0,
    vat: props.receipt.vatAmount || 0,
    discountAmount: props.receipt.discountAmount ?? props.receipt.discount_amount ?? 0,
    discountType: props.receipt.discountType ?? props.receipt.discount_type ?? "none",
    status: props.receipt.status || "pending",
  };
});
</script>

<template>
  <BaseReceiptDetailModal
    :is-open="modelValue && !!receipt"
    :receipt="normalizedReceipt"
    @close="close"
  >
    <template #actions>
      <div class="flex items-center justify-end gap-2">
        <button
          v-if="canEdit"
          @click="editReceipt"
          class="btn btn-secondary px-4 py-2"
        >
          <Pencil class="w-4 h-4" /> Edit
        </button>
        <button
          v-if="canDelete"
          @click="emit('delete', receipt.id); close();"
          class="btn btn-danger !px-3 py-2"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </template>
  </BaseReceiptDetailModal>
</template>
