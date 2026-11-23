<script setup>
import { formatAmount } from "@/utils/formatters";

const props = defineProps({
  receiptCount: {
    type: Number,
    required: true,
  },
  reportFile: {
    type: File,
    default: null,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: "PHP",
  },
});
</script>

<template>
  <section
    class="bg-accent-50 border border-accent/15 rounded-xl p-6 space-y-4"
  >
    <div class="flex justify-between items-center">
      <h3
        class="text-base font-bold text-primary"
        style="font-family: 'Poppins', sans-serif"
      >
        Summary
      </h3>
    </div>
    <div class="space-y-3">
      <div class="flex justify-between items-center text-sm">
        <span class="text-slate-500">Uploaded Receipts</span>
        <span class="font-bold text-accent">
          {{ receiptCount }} - ready
        </span>
      </div>
      <div
        class="flex justify-between items-center text-sm pb-4 border-b border-accent/20"
      >
        <span class="text-slate-500">Report Attached</span>
        <span class="text-slate-400">{{
          reportFile ? reportFile.name : "None"
        }}</span>
      </div>
      <div class="flex justify-between items-center pt-2">
        <span
          class="text-base font-bold text-primary"
          style="font-family: 'Poppins', sans-serif"
          >Total Amount</span
        >
        <span class="text-2xl font-bold text-accent">{{
          formatAmount(totalAmount, currency || "PHP")
        }}</span>
      </div>
    </div>
  </section>
</template>
