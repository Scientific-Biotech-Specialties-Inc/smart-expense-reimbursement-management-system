<script setup>
import { ArrowLeft } from "lucide-vue-next";

defineProps({
  isEdit: {
    type: Boolean,
    default: false,
  },
  isRevise: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["dismiss"]);
</script>

<template>
  <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div class="flex items-start gap-3">
      <button
        @click="$emit('dismiss')"
        class="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 hover:text-primary shadow-sm text-slate-500 transition-all"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>
      <div class="min-w-0">
        <h1 class="font-heading text-2xl font-bold leading-tight text-slate-800">
          {{ isEdit ? (isRevise ? "Revise Reimbursement" : "Edit Reimbursement") : "New Reimbursement" }}
        </h1>
        <p class="mt-1 text-sm text-slate-400">
          {{ isEdit ? (isRevise ? "Update and resubmit your expense reimbursement request" : "Update your expense reimbursement request") : "Submit your expense reimbursement request" }}
        </p>
      </div>
    </div>
  </div>
</template>
