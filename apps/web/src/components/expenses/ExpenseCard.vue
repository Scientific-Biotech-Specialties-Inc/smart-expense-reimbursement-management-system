<script setup>
import { ref, computed } from "vue";
import {
  AlertTriangle,
  Eye,
  Pencil,
  Send,
  Trash2,
  MoreVertical,
} from "lucide-vue-next";
import { formatPeso as formatCurrency, formatDate } from "@/utils/formatters";
import { canEditReceipt, canDeleteReceipt } from "@/utils/receiptUtils";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";

const props = defineProps({
  expense: {
    type: Object,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["select", "view", "delete", "edit", "forward-reimbursement"]);

const isMenuOpen = ref(false);
const canEdit = computed(() => canEditReceipt(props.expense));
const canDelete = computed(() => canDeleteReceipt(props.expense));
</script>

<template>
  <div
    class="relative flex flex-col overflow-hidden transition-all bg-white cursor-pointer rounded-xl group hover:shadow-xl"
    :class="
      isSelected
        ? 'border-2 border-primary shadow-md'
        : 'border border-slate-100 shadow-md'
    "
    @click="$emit('select', expense.id)"
  >
    <!-- Selected Badge -->
    <Transition name="pop">
      <div
        v-if="isSelected"
        class="absolute z-10 flex items-center justify-center rounded-full shadow-md top-3 right-3 w-7 h-7 bg-primary"
      >
        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </div>
    </Transition>

    <!-- Expense Image Preview -->
    <div
      class="flex-shrink-0 w-full overflow-hidden border-b aspect-square bg-slate-50 border-slate-100"
    >
      <BaseReceiptImage
        :src="expense.thumbnail"
        :alt="expense.fileName || expense.vendorName || 'Receipt'"
        :file-type="expense.fileType"
        img-class="object-cover w-full h-full transition-transform duration-500 opacity-100 group-hover:scale-105"
      />
    </div>

    <!-- Card Body -->
    <div class="flex flex-col flex-1 p-4">
      <div
        v-if="expense.status === 'automatic-rejected'"
        class="px-3 py-2 mb-3 border rounded-lg border-danger/20 bg-danger/5"
      >
        <div class="flex items-start gap-2">
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p class="text-[11px] font-bold text-danger">Automatic Rejected</p>
            <p class="mt-0.5 text-[10px] leading-snug text-slate-500">
              Update the details or upload a clearer copy.
            </p>
          </div>
        </div>
      </div>

      <!-- File / Merchant Info -->
      <div class="mb-3">
        <h3
          class="font-bold text-slate-800 text-[13px] leading-snug truncate"
        >
          {{ expense.vendorName || "Unknown Vendor" }}
        </h3>
        <p class="text-slate-400 text-[11px] mt-0.5">
          {{ formatDate(expense.date) }}
        </p>
      </div>

      <!-- Category + Amount -->
      <div class="flex items-center justify-between mt-auto mb-3">
        <span
          class="px-2.5 py-1 bg-primary/5 text-primary-600 rounded-md text-[11px] font-semibold border border-primary/10 truncate max-w-[55%]"
        >
          {{ expense.category }}
        </span>
        <span class="font-bold text-[14px] text-success">
          {{ expense.amount > 0 ? formatCurrency(expense.amount) : "—" }}
        </span>
      </div>

      <div class="mb-3">
        <StatusBadge :status="expense.status" />
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-2">
        <button
          class="btn btn-primary flex-1"
          @click.stop="$emit('view', expense)"
        >
          <Eye class="w-3.5 h-3.5" /> View
        </button>

        <div class="relative flex" @click.stop>
          <button
            class="flex items-center justify-center px-3 py-2 transition-all border rounded-lg"
            :class="
              isSelected
                ? 'border-slate-300 bg-slate-100 text-slate-600'
                : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
            "
            @click="isMenuOpen = !isMenuOpen"
            title="Options"
          >
            <MoreVertical class="w-4 h-4" />
          </button>

          <div
            v-if="isMenuOpen"
            class="fixed inset-0 z-10"
            @click="isMenuOpen = false"
          ></div>

          <div
            v-if="isMenuOpen"
            class="absolute right-0 z-20 py-1 mb-2 bg-white border rounded-lg shadow-lg bottom-full w-44 border-slate-100"
          >
            <button
              class="flex items-center w-full gap-2 px-4 py-2 text-sm text-left text-slate-600 hover:bg-slate-50"
              @click="
                isMenuOpen = false;
                $emit('forward-reimbursement', expense);
              "
            >
              <Send class="w-4 h-4" /> To Reimbursement
            </button>
            <button
              v-if="canEdit"
              class="flex items-center w-full gap-2 px-4 py-2 text-sm text-left text-slate-600 hover:bg-slate-50"
              @click="
                isMenuOpen = false;
                $emit('edit', expense);
              "
            >
              <Pencil class="w-4 h-4" /> Edit
            </button>
            <button
              v-if="canDelete"
              class="flex items-center w-full gap-2 px-4 py-2 text-sm text-left text-danger hover:bg-danger/5"
              @click="
                isMenuOpen = false;
                $emit('delete', expense.id);
              "
            >
              <Trash2 class="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
