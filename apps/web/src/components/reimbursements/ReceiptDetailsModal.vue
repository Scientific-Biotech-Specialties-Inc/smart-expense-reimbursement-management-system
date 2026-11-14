<script setup>
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { formatAmount, formatDate } from "@/utils/formatters";
import {
  DISCOUNT_TYPE_OPTIONS,
  formatDiscountTypeLabel,
  normalizeDiscountType,
  normalizeVatClassification,
  receiptDiscountAmount,
  receiptFinancials,
} from "@/utils/receiptUtils";
import BaseReceiptDetailModal from "@/components/base/BaseReceiptDetailModal.vue";
import { CheckCircle, XCircle } from "lucide-vue-next";

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  receipt: { type: Object, default: null },
  reviewerNotes: { type: String, default: "" },
  pendingDecisionAction: { type: String, default: null },
  isSubmitting: { type: Boolean, default: false },
});

const emit = defineEmits([
  "close", "update:reviewerNotes",
  "request-decision", "cancel-decision", "confirm-decision",
]);

const auth = useAuthStore();
const selectedVatClassification = ref("vat");
const selectedDiscountType = ref("none");
const selectedDiscountAmount = ref("0.00");
const TAX_CLASSIFICATIONS = [
  { value: "vat", label: "VAT" },
  { value: "non-vat", label: "Non-VAT" },
];

const isProcessing = computed(() => props.receipt?.status === "processing");
const isOwnSubmission = computed(() => {
  const currentUserId = auth.user?.id;
  const ownerId = props.receipt?.reimbursement_user_id ?? props.receipt?.user_id ?? props.receipt?.userId ?? props.receipt?.user?.id;
  return currentUserId != null && ownerId != null && String(currentUserId) === String(ownerId);
});
const isReviewableReceipt = computed(() => ["processing", "pending", "submitted"].includes(props.receipt?.status));
const canEditVatClassification = computed(() => auth.isAdmin && isReviewableReceipt.value && !isProcessing.value && !isOwnSubmission.value);
const hasVatClassification = computed(() => !!selectedVatClassification.value);
const isApproveDisabled = computed(() => isProcessing.value || props.isSubmitting || isOwnSubmission.value || !hasVatClassification.value);
const isConfirmDecisionDisabled = computed(() => isProcessing.value || props.isSubmitting || isOwnSubmission.value || (props.pendingDecisionAction === "Approve" && !hasVatClassification.value));

const effectiveDiscountAmount = computed(() =>
  selectedDiscountType.value === "none" ? 0 : Math.max(0, Number(selectedDiscountAmount.value) || 0),
);

const receiptAmounts = computed(() =>
  receiptFinancials(
    {
      ...props.receipt,
      discount_amount: effectiveDiscountAmount.value,
      discount_type: selectedDiscountType.value,
    },
    selectedVatClassification.value,
  ),
);
const receiptGrossSalesAmount = computed(() => receiptAmounts.value.gross);
const receiptVatAmount = computed(() => receiptAmounts.value.vat);

const localReviewerNotes = computed({
  get: () => props.reviewerNotes,
  set: (val) => emit("update:reviewerNotes", val),
});

watch(
  () => [
    props.receipt?.id,
    props.receipt?.vat_classification,
    props.receipt?.discount_type,
    props.receipt?.discount_amount,
  ],
  ([, vatClassification, discountType, discountAmount]) => {
    selectedVatClassification.value = normalizeVatClassification(vatClassification);
    const parsedDiscount = receiptDiscountAmount(props.receipt);
    selectedDiscountType.value = normalizeDiscountType(discountType, parsedDiscount);
    selectedDiscountAmount.value =
      selectedDiscountType.value === "none" ? "0.00" : parsedDiscount.toFixed(2);
  },
  { immediate: true },
);

function handleDiscountTypeChange() {
  if (selectedDiscountType.value === "none") {
    selectedDiscountAmount.value = "0.00";
  }
}

function handleDiscountAmountInput() {
  const num = Number(selectedDiscountAmount.value) || 0;
  if (num > 0 && selectedDiscountType.value === "none") {
    selectedDiscountType.value = "other";
  }
}

const categoryName = computed(() => {
  const cat = props.receipt?.expense_category ?? props.receipt?.category;
  if (typeof cat === "string") return cat || "Expense";
  if (cat && typeof cat === "object" && cat.name) return cat.name;
  return "Expense";
});

/** Normalize to shared shape */
const normalizedReceipt = computed(() => {
  if (!props.receipt) return null;
  return {
    imageUrl: props.receipt.file_url || null,
    invoiceNumber: props.receipt.invoice_number || "--",
    date: formatDate(props.receipt.transaction_date || props.receipt.transactionDate || props.receipt.date),
    vendor: props.receipt.vendor_name || "Unknown Vendor",
    category: categoryName.value,
    eventType: props.receipt?.event_type || props.receipt?.eventType || "",
    tin: props.receipt.tin || "—",
    vatClassification: selectedVatClassification.value,
    currency: props.receipt.currency || "PHP",
    items: props.receipt.items || [],
    amount: receiptGrossSalesAmount.value || Number(props.receipt.total_amount) || 0,
    vat: receiptVatAmount.value || Number(props.receipt.vat_amount) || 0,
    discountAmount: effectiveDiscountAmount.value,
    discountType: selectedDiscountType.value,
    status: props.receipt.status || "pending",
  };
});
</script>

<template>
  <BaseReceiptDetailModal
    :is-open="isOpen"
    :receipt="normalizedReceipt"
    @close="emit('close')"
  >
    <template #vat-field>
      <select
        v-if="canEditVatClassification"
        v-model="selectedVatClassification"
        class="input !py-1 !text-sm !bg-white"
        :disabled="isSubmitting"
      >
        <option v-for="opt in TAX_CLASSIFICATIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <p v-else class="text-sm text-slate-700 uppercase">{{ selectedVatClassification || "—" }}</p>
    </template>

    <template #discount-type-field>
      <select
        v-if="canEditVatClassification"
        v-model="selectedDiscountType"
        class="input !py-1 !text-sm !bg-white"
        :disabled="isSubmitting"
        @change="handleDiscountTypeChange"
      >
        <option v-for="opt in DISCOUNT_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <p v-else class="text-sm text-slate-700">{{ formatDiscountTypeLabel(selectedDiscountType) }}</p>
    </template>

    <template #discount-amount-field>
      <input
        v-if="canEditVatClassification"
        v-model="selectedDiscountAmount"
        type="number"
        step="0.01"
        min="0"
        class="input !py-1 !text-sm !bg-white disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-slate-50"
        placeholder="0.00"
        :disabled="isSubmitting || selectedDiscountType === 'none'"
        @input="handleDiscountAmountInput"
      />
      <p v-else class="text-sm text-slate-700">{{ formatAmount(effectiveDiscountAmount, receipt?.currency || "PHP") }}</p>
    </template>

    <template #actions>
      <!-- Admin Review Actions -->
      <div v-if="auth.isAdmin && receipt && isReviewableReceipt">
        <p v-if="isOwnSubmission" class="text-xs text-danger mb-2">You cannot process your own receipt.</p>

        <!-- Notes -->
        <div class="mb-3">
          <label class="text-[11px] text-slate-400 uppercase tracking-wide block mb-1">Notes</label>
          <textarea
            v-model="localReviewerNotes"
            class="input min-h-[56px] resize-none text-sm"
            placeholder="Optional notes..."
            :disabled="isProcessing || isSubmitting || isOwnSubmission"
          />
        </div>

        <!-- Pending Confirmation -->
        <div v-if="pendingDecisionAction" class="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p class="text-sm text-slate-700">{{ pendingDecisionAction }} this receipt?</p>
          <div class="flex gap-2 shrink-0">
            <button class="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-100" :disabled="isProcessing || isSubmitting" @click="emit('cancel-decision')">Cancel</button>
            <button class="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50" :disabled="isConfirmDecisionDisabled" @click="emit('confirm-decision', { vat_classification: selectedVatClassification, vat_amount: receiptVatAmount, total_amount: receiptGrossSalesAmount, discount_amount: effectiveDiscountAmount, discount_type: selectedDiscountType })">
              {{ isSubmitting ? "..." : "Confirm" }}
            </button>
          </div>
        </div>

        <!-- Decision Buttons -->
        <div v-else class="flex items-center justify-end gap-2">
          <button
            class="px-4 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            :disabled="isProcessing || isSubmitting || isOwnSubmission"
            @click="emit('request-decision', 'Reject')"
          >
            <XCircle class="w-3.5 h-3.5" /> Reject
          </button>
          <button
            class="px-5 py-2 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm"
            :disabled="isApproveDisabled"
            @click="emit('request-decision', 'Approve')"
          >
            <CheckCircle class="w-3.5 h-3.5" /> Approve
          </button>
        </div>
      </div>

      <!-- Read-only admin notes -->
      <div v-else-if="receipt?.admin_notes">
        <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Reviewer Notes</p>
        <p class="text-sm text-slate-700">{{ receipt.admin_notes }}</p>
      </div>
    </template>
  </BaseReceiptDetailModal>
</template>
