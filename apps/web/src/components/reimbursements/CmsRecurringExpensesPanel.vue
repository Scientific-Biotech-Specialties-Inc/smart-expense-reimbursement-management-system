<script setup>
import { onMounted, reactive, ref } from "vue";
import { useCmsStore } from "@/stores/cms";
import { useToast } from "@/composables/useToast";
import { formatDate, formatPeso } from "@/utils/formatters";
import BaseButton from "@/components/base/BaseButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import { FileCheck2, RefreshCw, Send } from "lucide-vue-next";

const cmsStore = useCmsStore();
const { addToast } = useToast();

const activeCandidate = ref(null);
const forwarding = ref(false);

const forwardForm = reactive({
  service_description: "",
  category: "Service Agreement",
  region: "Luzon",
});

function openForwardModal(candidate) {
  activeCandidate.value = candidate;
  forwardForm.service_description = `Recurring ${candidate.default_category || "service"} purchases (${candidate.occurrence_count}x in SERMS)`;
  forwardForm.category = candidate.default_category || "Service Agreement";
  forwardForm.region = "Luzon";
}

function closeModal() {
  activeCandidate.value = null;
}

async function submitForward() {
  if (!activeCandidate.value || forwarding.value) return;
  forwarding.value = true;
  try {
    const c = activeCandidate.value;
    const created = await cmsStore.forwardContractRequest({
      vendor_name: c.vendor_name,
      tin_number: c.tin_number || null,
      service_description: forwardForm.service_description.trim(),
      category: forwardForm.category.trim(),
      region: forwardForm.region.trim() || null,
      occurrence_count: c.occurrence_count,
      total_spend: c.total_spend,
      period_start: c.period_start,
      period_end: c.period_end,
      source_reference_id: c.source_reference_id,
      expense_items: c.expense_items,
    });
    addToast({
      message: `Forwarded to CMS as Contract Request ${created?.contract_code || ""}`.trim(),
      type: "success",
    });
    closeModal();
  } catch (err) {
    addToast({
      message: err?.message || "Failed to forward contract request to CMS.",
      type: "error",
    });
  } finally {
    forwarding.value = false;
  }
}

onMounted(() => {
  cmsStore.fetchRecurringExpenses().catch((err) => {
    addToast({ message: err?.message || "Failed to load recurring vendors.", type: "error" });
  });
});
</script>

<template>
  <section class="card p-5 space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h2 class="text-base font-bold text-slate-800">
          Recurring Vendor Purchases (CMS Contract Candidates)
        </h2>
        <p class="text-xs text-slate-500">
          Vendors with 3 or more non-rejected reimbursements in the past 12 months. Forward candidates to CMS to establish a formal service contract.
        </p>
      </div>
      <BaseButton
        variant="outline"
        size="sm"
        type="button"
        :disabled="cmsStore.loadingRecurring"
        @click="cmsStore.fetchRecurringExpenses()"
      >
        <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': cmsStore.loadingRecurring }" />
        <span>Refresh</span>
      </BaseButton>
    </div>

    <div v-if="cmsStore.loadingRecurring" class="py-10 text-center text-sm text-slate-400">
      Scanning recurring vendor purchases...
    </div>

    <div v-else-if="cmsStore.recurringVendors.length === 0" class="py-10 text-center text-sm text-slate-400">
      No recurring vendor purchase patterns detected yet (minimum 3 claims per vendor in 12 months).
    </div>

    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-2.5 text-left">Vendor</th>
            <th class="px-4 py-2.5 text-left">Period</th>
            <th class="px-4 py-2.5 text-right">Occurrences</th>
            <th class="px-4 py-2.5 text-right">Total Spend</th>
            <th class="px-4 py-2.5 text-left">CMS Contract Request</th>
            <th class="px-4 py-2.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="vendor in cmsStore.recurringVendors" :key="vendor.source_reference_id">
            <td class="px-4 py-3">
              <p class="font-medium text-slate-800">{{ vendor.vendor_name }}</p>
              <p class="text-xs text-slate-400">TIN: {{ vendor.tin_number || "—" }}</p>
            </td>
            <td class="px-4 py-3 text-slate-600 text-xs">
              {{ formatDate(vendor.period_start) }} — {{ formatDate(vendor.period_end) }}
            </td>
            <td class="px-4 py-3 text-right font-mono text-slate-700">
              {{ vendor.occurrence_count }}x
            </td>
            <td class="px-4 py-3 text-right font-semibold text-primary">
              {{ formatPeso(vendor.total_spend) }}
            </td>
            <td class="px-4 py-3">
              <div v-if="vendor.forwarded_request" class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-xs font-semibold text-primary">
                    {{ vendor.forwarded_request.contract_code || "Pending Code" }}
                  </span>
                  <StatusBadge :status="(vendor.forwarded_request.status || 'pending').toLowerCase()" />
                </div>
                <p v-if="vendor.forwarded_request.supporting_expense_summary" class="text-xs text-slate-500">
                  {{ vendor.forwarded_request.supporting_expense_summary }}
                </p>
              </div>
              <span v-else class="text-xs text-slate-400">Not forwarded</span>
            </td>
            <td class="px-4 py-3 text-right">
              <BaseButton
                v-if="!vendor.forwarded_request"
                variant="primary"
                size="sm"
                type="button"
                @click="openForwardModal(vendor)"
              >
                <Send class="w-3.5 h-3.5" />
                <span>Forward to CMS</span>
              </BaseButton>
              <span v-else class="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <FileCheck2 class="w-3.5 h-3.5" /> Forwarded
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Forward to CMS Modal -->
    <div
      v-if="activeCandidate"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4">
        <div>
          <h3 class="text-base font-bold text-slate-800">Forward Recurring Spend to CMS</h3>
          <p class="text-xs text-slate-500 mt-1">
            {{ activeCandidate.vendor_name }} ({{ activeCandidate.occurrence_count }} purchases totaling {{ formatPeso(activeCandidate.total_spend) }})
          </p>
        </div>

        <div class="space-y-3">
          <div>
            <label class="input-label" for="cms-req-desc">Service Description *</label>
            <textarea
              id="cms-req-desc"
              v-model="forwardForm.service_description"
              class="input min-h-[72px] text-sm"
              maxlength="1000"
            />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="input-label" for="cms-req-category">Category *</label>
              <input id="cms-req-category" v-model="forwardForm.category" type="text" class="input text-sm" />
            </div>
            <div>
              <label class="input-label" for="cms-req-region">Region</label>
              <input id="cms-req-region" v-model="forwardForm.region" type="text" class="input text-sm" />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <BaseButton variant="ghost" size="sm" type="button" :disabled="forwarding" @click="closeModal">
            Cancel
          </BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            type="button"
            :disabled="forwarding || !forwardForm.service_description.trim() || !forwardForm.category.trim()"
            @click="submitForward"
          >
            {{ forwarding ? "Forwarding..." : "Confirm & Forward" }}
          </BaseButton>
        </div>
      </div>
    </div>
  </section>
</template>
