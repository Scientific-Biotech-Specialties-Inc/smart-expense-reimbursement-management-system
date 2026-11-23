<script setup>
import { computed } from "vue";
import { formatAmount, formatDate } from "@/utils/formatters";
import {
  getPayoutTypeLabel,
  getPayoutTypeBadgeClass,
} from "@/composables/payouts/usePayoutFilters";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BasePagination from "@/components/base/BasePagination.vue";
import ActionDropdownMenu from "@/components/base/ActionDropdownMenu.vue";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
} from "lucide-vue-next";

const props = defineProps({
  isLoading: { type: Boolean, default: false },
  rows: { type: Array, required: true },
  totalRows: { type: Number, required: true },
  columns: { type: Array, required: true },
  sortKey: { type: String, default: "grantedDate" },
  sortDirection: { type: String, default: "desc" },
  currentPage: { type: Number, required: true },
  pageSize: { type: Number, default: 10 },
  isAdmin: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:currentPage",
  "toggle-sort",
  "view-details",
]);

const columnCount = computed(() => props.columns.length);
const hasTypeColumn = computed(() =>
  props.columns.some(
    (col) => col.key === "typeLabel" || col.key === "type",
  ),
);
const hasEmployeeColumn = computed(() =>
  props.columns.some(
    (col) => col.key === "employeeName" || col.key === "employee",
  ),
);

function isSorted(column) {
  return props.sortKey === (column.sortKey || column.key);
}

function handleToggleSort(column) {
  emit("toggle-sort", column);
}

function getActions(row) {
  return [
    {
      label: "View",
      icon: Eye,
      visible: true,
      handler: () => emit("view-details", row),
    },
  ];
}
</script>

<template>
  <section
    class="overflow-hidden bg-white border shadow-sm rounded-xl border-slate-200"
  >
    <div
      class="flex flex-col gap-1 px-5 py-4 bg-white border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2
          class="text-base font-bold leading-tight font-heading text-slate-800"
        >
          Granted Payouts
        </h2>
        <p class="mt-0.5 text-xs text-slate-400">
          {{ isAdmin ? "All released reimbursement and cash advance payout records across employees" : "Your released reimbursement and cash advance payout records" }}
        </p>
      </div>
      <span class="kpi-label text-slate-400">
        <template v-if="isLoading">Loading...</template>
        <template v-else>Showing {{ totalRows }} records</template>
      </span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-full text-left border-collapse table-fixed">
        <thead>
          <tr class="border-b border-slate-200 bg-slate-50">
            <th
              v-for="column in columns"
              :key="column.key"
              class="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.08em]"
              :class="[
                column.align === 'right'
                  ? 'text-right'
                  : column.align === 'center'
                    ? 'text-center'
                    : 'text-left',
                isSorted(column) ? 'text-accent' : 'text-slate-500',
              ]"
            >
              <button
                class="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
                :class="
                  column.align === 'right'
                    ? 'justify-end'
                    : column.align === 'center'
                      ? 'justify-center'
                      : 'justify-start'
                "
                type="button"
                @click="handleToggleSort(column)"
              >
                <span>{{ column.label }}</span>
                <ChevronUp
                  v-if="isSorted(column) && sortDirection === 'asc'"
                  class="h-3.5 w-3.5"
                />
                <ChevronDown
                  v-else-if="isSorted(column)"
                  class="h-3.5 w-3.5"
                />
                <ChevronsUpDown v-else class="h-3.5 w-3.5 text-slate-300" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <template v-if="isLoading">
            <tr
              v-for="i in pageSize"
              :key="`payout-skeleton-${i}`"
              class="whitespace-nowrap"
            >
              <td v-for="col in columnCount" :key="col" class="px-5 py-5">
                <div
                  class="h-3.5 max-w-full animate-pulse rounded bg-slate-200 w-20 sm:w-24"
                />
              </td>
            </tr>
          </template>
          <template v-else-if="totalRows === 0">
            <tr>
              <td
                :colspan="columnCount"
                class="px-5 py-8 text-sm text-center text-slate-500"
              >
                No granted payout records found.
              </td>
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="row in rows"
              :key="row.uid || `${row.type || 'reimbursement'}-${row.id}`"
              class="transition-colors duration-200 ease-out group whitespace-nowrap hover:bg-slate-50/70"
            >
              <td class="px-5 py-5 text-sm font-semibold text-slate-800">
                <span>{{ row.referenceNumber }}</span>
                <span
                  v-if="row.description"
                  class="block truncate text-xs font-normal text-slate-400 mt-0.5"
                >
                  {{ row.description }}
                </span>
              </td>
              <td v-if="hasTypeColumn" class="px-5 py-5">
                <span
                  class="inline-flex whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                  :class="getPayoutTypeBadgeClass(row)"
                >
                  {{ getPayoutTypeLabel(row) }}
                </span>
              </td>
              <td
                v-if="hasEmployeeColumn"
                class="px-5 py-5 text-sm font-medium text-slate-700"
              >
                {{ row.employeeName || "Employee" }}
              </td>
              <td class="px-5 py-5 text-sm font-bold text-right text-primary">
                {{ formatAmount(row.amount, row.currency || "PHP") }}
              </td>
              <td class="px-5 py-5">
                <span
                  class="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600"
                >
                  {{ row.payoutMethod }}
                </span>
              </td>
              <td class="px-5 py-5 text-sm truncate text-slate-500">
                {{ formatDate(row.grantedDate) }}
              </td>
              <td class="px-5 py-5 text-center">
                <StatusBadge :status="row.acknowledgementStatus" />
              </td>
              <td class="px-5 py-5 text-center">
                <ActionDropdownMenu :actions="getActions(row)" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <BasePagination
      v-if="!isLoading && totalRows > pageSize"
      :page="currentPage"
      @update:page="(val) => emit('update:currentPage', val)"
      :page-size="pageSize"
      :total="totalRows"
      label="records"
    />
  </section>
</template>
