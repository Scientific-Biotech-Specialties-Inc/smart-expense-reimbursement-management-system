<script setup>
import { Eye, Download } from "lucide-vue-next";
import { formatPeso, formatDate } from "@/utils/formatters";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseReceiptImage from "@/components/base/BaseReceiptImage.vue";

defineProps({
  reviewingCase: {
    type: Object,
    required: true,
  },
  reviewStatus: {
    type: String,
    required: true,
  },
  reviewOutstandingBalance: {
    type: [Number, String],
    required: true,
  },
  reviewReceipts: {
    type: Array,
    default: () => [],
  },
  getFileUrl: {
    type: Function,
    required: true,
  },
  formatDateOnly: {
    type: Function,
    default: formatDate,
  },
});

defineEmits(["view-receipt"]);
</script>

<template>
  <div
    class="flex-1 space-y-5 overflow-y-auto bg-slate-50/40 px-4 py-5 sm:px-6"
  >
    <section
      class="grid grid-cols-1 gap-4 p-4 bg-white border rounded-lg border-slate-200 md:grid-cols-4"
    >
      <div>
        <p class="text-xs font-medium text-slate-500 mb-1">Date</p>
        <p class="text-sm font-bold text-slate-800">
          {{ formatDateOnly(reviewingCase.dateOfAdvances) }}
        </p>
      </div>
      <div>
        <p class="text-xs font-medium text-slate-500 mb-1">Name of Employee</p>
        <p class="text-sm font-bold text-slate-800">
          {{ reviewingCase.requestorName }}
        </p>
      </div>
      <div>
        <p class="text-xs font-medium text-slate-500 mb-1">Settlement Due Date</p>
        <p class="text-sm font-bold text-slate-800">
          {{ formatDateOnly(reviewingCase.dueDate) }}
        </p>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="p-5 bg-white border rounded-lg border-accent/20">
        <p class="text-xs font-medium text-slate-500 mb-2">Original Cash Advance Amount</p>
        <p class="text-3xl font-bold font-heading text-primary">
          {{ formatPeso(reviewingCase.cashAdvanceAmount) }}
        </p>
      </div>
      <div class="p-5 bg-white border rounded-lg border-slate-200">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs font-medium text-slate-500">Ending Balance</p>
          <StatusBadge :status="reviewStatus" />
        </div>
        <p class="mt-2 text-3xl font-bold font-heading text-primary">
          {{ formatPeso(reviewOutstandingBalance) }}
        </p>
      </div>
    </section>

    <section class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-slate-700">Receipts</h3>
        </div>
        <span class="kpi-label text-slate-400"
          >{{ reviewReceipts.length }} receipts</span
        >
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article
          v-for="receipt in reviewReceipts"
          :key="receipt.id"
          class="overflow-hidden bg-white border rounded-xl border-slate-200"
        >
          <BaseReceiptImage
            :src="receipt.filePath ? getFileUrl(receipt.filePath) : null"
            :alt="receipt.merchantName || 'Scanned receipt'"
            :file-type="receipt.fileType"
            img-class="object-cover object-top w-full h-full transition-transform duration-500 hover:scale-105"
            container-class="aspect-[4/5] overflow-hidden bg-slate-100"
          />
          <div class="flex flex-col gap-3 p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h4
                  class="text-sm font-bold truncate font-heading text-slate-900"
                >
                  {{ receipt.merchantName }}
                </h4>
                <p class="text-xs truncate text-slate-400">
                  {{ receipt.location }}
                </p>
              </div>
              <StatusBadge :status="receipt.decision === 'accepted' ? 'approved' : receipt.decision" />
            </div>
            <div class="flex items-center justify-between gap-3">
              <span
                class="inline-flex rounded-md bg-accent-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent"
                >{{ receipt.category }}</span
              >
              <span class="text-sm font-bold font-heading text-primary">{{
                formatPeso(receipt.amount || 0)
              }}</span>
            </div>
            <button
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent-50 px-3 py-2.5 text-xs font-bold text-accent transition-colors hover:bg-accent-100"
              type="button"
              @click="$emit('view-receipt', receipt)"
            >
              <Eye class="w-4 h-4" />
              View Receipt Details
            </button>
          </div>
        </article>
      </div>
    </section>



    <section
      v-if="reviewingCase.reportFilePath"
      class="p-5 space-y-4 bg-white border rounded-xl border-slate-200"
    >
      <p class="text-[11px] text-slate-400 mb-2">Report Attachment</p>
      <a
        :href="getFileUrl(reviewingCase.reportFilePath)"
        target="_blank"
        class="inline-flex w-fit items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
      >
        <Download class="w-4 h-4" />
        View / Download Report Letter
      </a>
    </section>
  </div>
</template>
