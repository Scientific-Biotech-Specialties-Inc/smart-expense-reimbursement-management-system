<script setup>
import { computed } from "vue";
import {
  FileText,
  Image as ImageIcon,
  Trash2,
  MapPin,
  ChevronDown,
  X,
  PlusCircle,
} from "lucide-vue-next";
import {
  itemsGrossAmount,
  receiptFinancials,
  isReceiptFieldMissing,
} from "@/utils/receiptUtils";
import { truncateDecimal } from "@/utils/formatters";
import { REIMBURSEMENT_EVENT_TYPES } from "@/utils/constants";
import CurrencySelect from "@/components/base/CurrencySelect.vue";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";
import ReceiptImagePreview from "@/components/base/ReceiptImagePreview.vue";

const props = defineProps({
  receipts: {
    type: Array,
    required: true,
  },
  categories: {
    type: Array,
    default: () => [],
  },
  allowRemove: {
    type: Boolean,
    default: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove-receipt", "update:receipts"]);

const hasUploadingReceipts = computed(() =>
  props.receipts.some((receipt) => receipt.isUploading || receipt.isProcessing),
);

function getCategoryOptions() {
  return props.categories;
}

function syncCategoryName(receipt) {
  const category = props.categories.find(
    (cat) => String(cat.id) === String(receipt.categoryId),
  );
  receipt.category = category?.name || "";
  if (receipt.ocrData) {
    receipt.ocrData.expense_category_id = receipt.categoryId;
  }
}

function cleanName(fileName) {
  return (fileName || "").replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
}

function formatTinValue(value, { padLastBlock = false } = {}) {
  let digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 12);
  if (padLastBlock && digits.length === 9) {
    digits = `${digits}000`;
  }

  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 9));
  if (digits.length > 9) parts.push(digits.slice(9, 12));
  return parts.join("-");
}

function handleTinInput(receipt) {
  receipt.tin = formatTinValue(receipt.tin);
  if (receipt.ocrData) {
    receipt.ocrData.tin = receipt.tin;
  }
}

function handleTinBlur(receipt) {
  receipt.tin = formatTinValue(receipt.tin, { padLastBlock: true });
  if (receipt.ocrData) {
    receipt.ocrData.tin = receipt.tin;
  }
}

function syncOcrData(receipt) {
  if (receipt.ocrData) {
    receipt.ocrData.vendor = receipt.merchantName;
    receipt.ocrData.date = receipt.date;
    receipt.ocrData.invoiceNumber = receipt.invoiceNumber;
    receipt.ocrData.tin = receipt.tin;
    receipt.ocrData.location = receipt.location;
    receipt.ocrData.amount = receipt.amount;
    receipt.ocrData.subtotal = receipt.subtotal;
    receipt.ocrData.vat = receipt.tax;
    receipt.ocrData.expense_category_id = receipt.categoryId;
    receipt.ocrData.event_type = receipt.eventType;
  }
}

function handleSubtotalChange(receipt) {
  syncOcrData(receipt);
}

function handleTaxChange(receipt) {
  syncOcrData(receipt);
}

function handleAmountInput(receipt, event) {
  const rawValue = event?.target?.value ?? receipt.amount;
  const truncated = truncateDecimal(rawValue, 2);
  receipt.amount = truncated;
  if (event?.target && event.target.value !== truncated) {
    event.target.value = truncated;
  }
  handleAmountChange(receipt);
}

function handleAmountBlur(receipt, event) {
  if (receipt.amount !== null && receipt.amount !== undefined && receipt.amount !== "") {
    let str = String(receipt.amount);
    if (str.endsWith(".")) {
      str = str.slice(0, -1);
    }
    const truncated = truncateDecimal(str, 2);
    receipt.amount = truncated;
    if (event?.target && event.target.value !== truncated) {
      event.target.value = truncated;
    }
    syncOcrData(receipt);
  }
}

function handleAmountChange(receipt) {
  if (receipt.amount !== null && receipt.amount !== undefined && receipt.amount !== "") {
    receipt.amount = truncateDecimal(receipt.amount, 2);
  }
  if (receipt.vatClassification === 'non-vat') {
    receipt.tax = "0.00";
    if (!receipt.subtotal || receipt.subtotal === "" || Number(receipt.subtotal) <= 0) {
      receipt.subtotal = receipt.amount ? Number(receipt.amount).toFixed(2) : "";
    }
  }
  syncOcrData(receipt);
}

function handleVatClassChange(receipt) {
  if (receipt.vatClassification === 'non-vat') {
    receipt.tax = "0.00";
    if (!receipt.subtotal || receipt.subtotal === "" || Number(receipt.subtotal) <= 0) {
      receipt.subtotal = receipt.amount ? Number(receipt.amount).toFixed(2) : "";
    }
  }
  syncOcrData(receipt);
}

function addReceiptItem(receipt) {
  if (!receipt.items) {
    receipt.items = [];
  }
  receipt.items.push({ name: "New Item", qty: 1, price: 0 });
}

function recalculateFromItems(receipt) {
  const newTotal = itemsGrossAmount(receipt.items || []);
  receipt.amount = newTotal > 0 ? newTotal.toFixed(2) : "";
  if (receipt.vatClassification === 'non-vat') {
    receipt.tax = "0.00";
    if (!receipt.subtotal || receipt.subtotal === "" || Number(receipt.subtotal) <= 0) {
      receipt.subtotal = receipt.amount;
    }
  }
  syncOcrData(receipt);
}

function removeReceiptItem(receipt, index) {
  receipt.items.splice(index, 1);
  recalculateFromItems(receipt);
}
</script>

<template>
  <section class="card p-6">
    <div class="flex items-center justify-between mb-5">
      <h2
        class="text-lg font-bold text-primary"
      >
        Scanned Receipts
      </h2>
    </div>

    <div
      v-if="hasUploadingReceipts"
      class="mb-5 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-accent"
    >
      <span
        class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
        aria-hidden="true"
      />
      Uploading and extracting receipt data...
    </div>

    <!-- One block per receipt -->
    <div class="flex flex-col gap-8">
      <div
        v-for="(receipt, idx) in receipts"
        :key="receipt.id"
        class="border border-accent/15 rounded-xl p-6 bg-accent-50/20"
      >
        <!-- Receipt number badge -->
        <div class="flex items-center gap-2 mb-4">
          <span
            class="w-6 h-6 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center"
            >{{ idx + 1 }}</span
          >
          <span
            class="text-xs font-bold text-primary"
            >{{ cleanName(receipt.fileName) }}</span
          >
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <!-- Left: Image Preview -->
          <div class="lg:col-span-4">
            <ReceiptImagePreview
              :src="receipt.thumbnail || receipt.preview || receipt.filePath || receipt.file_url"
              :images="receipt.images"
              :file-name="receipt.fileName || receipt.name"
              :file-type="receipt.fileType"
              :is-uploading="receipt.isUploading"
              :is-processing="receipt.isProcessing"
              :allow-remove="allowRemove"
              :disabled="disabled"
              :show-badge="false"
              :receipt="receipt"
              @remove="$emit('remove-receipt', $event)"
            />
          </div>

          <!-- Right: Extracted Fields -->
          <div class="lg:col-span-8 flex flex-col gap-4">
            <!-- Row 1: Invoice + Date -->
            <div class="grid grid-cols-2 gap-4">
              <div class="input-wrapper">
                <label class="input-label">Invoice Number <span class="text-danger">*</span></label>
                <input
                  class="input disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="{
                    'cursor-not-allowed bg-slate-100 text-slate-500': disabled,
                    'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'invoiceNumber'),
                  }"
                  type="text"
                  v-model="receipt.invoiceNumber"
                  :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                  @input="syncOcrData(receipt)"
                />
                <span v-if="isReceiptFieldMissing(receipt, 'invoiceNumber')" class="text-[10px] text-danger font-medium mt-0.5">
                  Invoice number is required
                </span>
              </div>
              <div class="input-wrapper">
                <label class="input-label">Date <span class="text-danger">*</span></label>
                <div class="relative">
                  <input
                    class="input disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="{
                      'cursor-not-allowed bg-slate-100 text-slate-500': disabled,
                      'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'date'),
                    }"
                    type="date"
                    v-model="receipt.date"
                    :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                    @input="syncOcrData(receipt)"
                  />
                </div>
                <span v-if="isReceiptFieldMissing(receipt, 'date')" class="text-[10px] text-danger font-medium mt-0.5">
                  Date is required
                </span>
              </div>
            </div>

            <!-- Merchant -->
            <div class="input-wrapper">
              <div class="flex items-center justify-between">
                <label class="input-label">TIN Number <span class="text-danger">*</span></label>
              </div>
              <input
                class="input disabled:opacity-50 disabled:cursor-not-allowed"
                :class="{
                  'cursor-not-allowed bg-slate-100 text-slate-500': disabled,
                  'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'tin'),
                }"
                type="text"
                v-model="receipt.tin"
                inputmode="numeric"
                maxlength="15"
                placeholder="000-000-000-000"
                :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                @input="handleTinInput(receipt)"
                @blur="handleTinBlur(receipt)"
              />
              <span v-if="isReceiptFieldMissing(receipt, 'tin')" class="text-[10px] text-danger font-medium mt-0.5">
                TIN number is required
              </span>
            </div>

            <div class="input-wrapper">
              <label class="input-label">Merchant Name <span class="text-danger">*</span></label>
              <input
                class="input disabled:opacity-50 disabled:cursor-not-allowed"
                :class="{
                  'cursor-not-allowed bg-slate-100 text-slate-500': disabled,
                  'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'merchantName'),
                }"
                type="text"
                v-model="receipt.merchantName"
                :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                @input="syncOcrData(receipt)"
              />
              <span v-if="isReceiptFieldMissing(receipt, 'merchantName')" class="text-[10px] text-danger font-medium mt-0.5">
                Merchant name is required
              </span>
            </div>

            <!-- Location -->
            <div class="input-wrapper">
              <label class="input-label">Location <span class="text-danger">*</span></label>
              <div class="relative">
                <input
                  class="input pr-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="{
                    'cursor-not-allowed bg-slate-100 text-slate-500': disabled,
                    'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'location'),
                  }"
                  type="text"
                  v-model="receipt.location"
                  placeholder="Enter location..."
                  :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                  @input="syncOcrData(receipt)"
                />
                <MapPin
                  class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
              <span v-if="isReceiptFieldMissing(receipt, 'location')" class="text-[10px] text-danger font-medium mt-0.5">
                Location is required
              </span>
            </div>

            <!-- Category & Type of Event (2-column layout to save space) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Category with AI badge -->
              <div class="input-wrapper">
                <label class="input-label"
                  >Category (AI Auto-Detected) <span class="text-danger">*</span></label
                >
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <select
                      class="input appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      :class="{
                        'cursor-not-allowed bg-slate-100 text-slate-500': disabled,
                        'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'categoryId'),
                      }"
                      v-model="receipt.categoryId"
                      :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                      @change="syncCategoryName(receipt)"
                    >
                      <option value="" disabled>Select category</option>
                      <option
                        v-for="cat in getCategoryOptions()"
                        :key="cat.id"
                        :value="Number(cat.id)"
                      >
                        {{ cat.name }}
                      </option>
                    </select>
                    <ChevronDown
                      class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                  </div>
                </div>
                <span v-if="isReceiptFieldMissing(receipt, 'categoryId')" class="text-[10px] text-danger font-medium mt-0.5">
                  Category is required
                </span>
              </div>

              <!-- Type of Event -->
              <div class="input-wrapper">
                <label class="input-label"
                  >Type of Event <span class="text-danger">*</span></label
                >
                <div class="relative">
                  <select
                    data-testid="receipt-event-type-select"
                    class="input appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="{
                      'cursor-not-allowed bg-slate-100 text-slate-500': disabled,
                      'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'eventType'),
                    }"
                    v-model="receipt.eventType"
                    :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                    @change="syncOcrData(receipt)"
                  >
                    <option value="" disabled>Select type of event</option>
                    <option
                      v-for="eventType in REIMBURSEMENT_EVENT_TYPES"
                      :key="eventType"
                      :value="eventType"
                    >
                      {{ eventType }}
                    </option>
                  </select>
                  <ChevronDown
                    class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
                <span v-if="isReceiptFieldMissing(receipt, 'eventType')" class="text-[10px] text-danger font-medium mt-0.5">
                  Type of event is required
                </span>
              </div>
            </div>

            <!-- Order Items -->
            <div class="input-wrapper">
              <label class="input-label"
                >Order Items <span class="text-danger">*</span></label
              >
              <div
                class="border border-slate-100 rounded-lg overflow-hidden shadow-sm bg-white"
              >
                <table class="w-full text-left border-collapse table-fixed">
                  <thead
                    class="bg-slate-50 text-[11px] text-slate-500 uppercase"
                  >
                    <tr>
                      <th class="px-4 py-2.5 font-bold" style="width: 45%">Items</th>
                      <th class="px-4 py-2.5 font-bold text-center" style="width: 18%">
                        Qty
                      </th>
                      <th class="px-4 py-2.5 font-bold text-right" style="width: 25%">
                        Price
                      </th>
                      <th v-if="!disabled" style="width: 12%"></th>
                    </tr>
                  </thead>
                  <tbody class="text-sm divide-y divide-slate-50">
                    <tr
                      v-for="(item, itemIdx) in (receipt.items || [])"
                      :key="itemIdx"
                    >
                      <td class="px-4 py-2">
                        <input
                          type="text"
                          class="input !py-1 !text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          :class="{ 'cursor-not-allowed bg-slate-100 text-slate-500': disabled }"
                          v-model="item.name"
                          :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                        />
                      </td>
                      <td class="px-2 py-2">
                        <input
                          type="number"
                          class="input !py-1 !text-sm text-center min-w-[60px] disabled:opacity-50 disabled:cursor-not-allowed"
                          :class="{ 'cursor-not-allowed bg-slate-100 text-slate-500': disabled }"
                          v-model="item.qty"
                          :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                        />
                      </td>
                      <td class="px-4 py-2">
                        <input
                          type="number"
                          class="input !py-1 !text-sm text-right text-primary font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                          :class="{ 'cursor-not-allowed bg-slate-100 text-slate-500': disabled }"
                          v-model.number="item.price"
                          :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                          @input="recalculateFromItems(receipt)"
                        />
                      </td>
                      <td v-if="!disabled" class="py-2 text-center">
                        <button
                          class="text-slate-400 hover:text-danger transition-colors p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          :disabled="receipt.isUploading || receipt.isProcessing"
                          @click="removeReceiptItem(receipt, itemIdx)"
                        >
                          <X class="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div
                  v-if="!disabled"
                  class="px-4 py-2 bg-slate-50/50 border-t border-slate-50"
                >
                  <button
                    class="text-xs font-bold text-accent flex items-center gap-1 hover:text-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="receipt.isUploading || receipt.isProcessing"
                    @click="addReceiptItem(receipt)"
                  >
                    <PlusCircle class="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>
              </div>
            </div>

            <!-- Financials for this receipt -->
            <div
              class="flex flex-col gap-4 pt-2 border-t border-slate-100"
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div class="input-wrapper">
                  <label class="input-label">Currency</label>
                  <CurrencySelect
                    v-model="receipt.currency"
                    :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                    select-class="!bg-white"
                  />
                </div>
                <div class="input-wrapper">
                  <label class="input-label">VAT Classification <span class="text-danger">*</span></label>
                  <div class="relative">
                    <select
                      class="input !bg-white appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      :class="{ 'cursor-not-allowed bg-slate-100 text-slate-500': disabled }"
                      v-model="receipt.vatClassification"
                      :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                      @change="handleVatClassChange(receipt)"
                    >
                      <option value="vat">VAT</option>
                      <option value="non-vat">NON-VAT</option>
                    </select>
                    <ChevronDown class="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div class="input-wrapper">
                  <label class="input-label">Subtotal <span class="text-danger">*</span></label>
                  <input
                    class="input !bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="{
                      'cursor-not-allowed bg-slate-100 text-slate-500': disabled,
                      'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'subtotal'),
                    }"
                    type="number"
                    step="0.01"
                    min="0"
                    v-model="receipt.subtotal"
                    :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                    @input="handleSubtotalChange(receipt)"
                  />
                  <span v-if="isReceiptFieldMissing(receipt, 'subtotal')" class="text-[10px] text-danger font-medium mt-0.5">
                    Subtotal is required
                  </span>
                </div>
                <div class="input-wrapper">
                  <label class="input-label">Tax (VAT 12%) <span class="text-danger">*</span></label>
                  <input
                    class="input !bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="{ 'cursor-not-allowed bg-slate-100 text-slate-500': disabled }"
                    type="number"
                    step="0.01"
                    min="0"
                    v-model="receipt.tax"
                    :disabled="disabled || receipt.vatClassification === 'non-vat' || receipt.isUploading || receipt.isProcessing"
                    @input="handleTaxChange(receipt)"
                  />
                </div>
                <div class="input-wrapper">
                  <label class="input-label text-accent">Total <span class="text-danger">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    class="input !bg-white text-lg font-bold text-accent text-right disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="{
                      'cursor-not-allowed !bg-slate-100 !text-slate-500': disabled,
                      'input-error !border-danger focus:!border-danger': isReceiptFieldMissing(receipt, 'amount'),
                    }"
                    v-model="receipt.amount"
                    :disabled="disabled || receipt.isUploading || receipt.isProcessing"
                    @input="handleAmountInput(receipt, $event)"
                    @blur="handleAmountBlur(receipt, $event)"
                  />
                  <span v-if="isReceiptFieldMissing(receipt, 'amount')" class="text-[10px] text-danger font-medium mt-0.5">
                    Total amount is required
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
