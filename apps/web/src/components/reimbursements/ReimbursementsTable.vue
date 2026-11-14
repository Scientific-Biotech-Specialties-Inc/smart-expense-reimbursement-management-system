<script setup>
import { computed } from "vue";
import { formatAmount, formatDate } from "@/utils/formatters";
import { normalizeStatus } from "@/composables/reimbursements/useReimbursementFilters";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BasePagination from "@/components/base/BasePagination.vue";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Eye,
  Pencil,
  Trash2,
} from "lucide-vue-next";
import ActionDropdownMenu from "@/components/base/ActionDropdownMenu.vue";

const props = defineProps({
  isLoading: { type: Boolean, default: false },
  rows: { type: Array, required: true },
  totalRows: { type: Number, required: true },
  columns: { type: Array, required: true },
  sortKey: { type: String, default: "dateSubmitted" },
  sortDirection: { type: String, default: "desc" },
  isAdmin: { type: Boolean, default: false },
  currentPage: { type: Number, required: true },
  pageSize: { type: Number, default: 10 },
});

const emit = defineEmits([
  "update:currentPage",
  "toggle-sort",
  "view-details",
  "edit-request",
  "delete-request",
]);

const columnCount = computed(() => props.columns.length);

function isSorted(column) {
  return props.sortKey === (column.sortKey || column.key);
}

function handleToggleSort(column) {
  emit("toggle-sort", column);
}

function getActions(row) {
  const status = normalizeStatus(row.displayStatus);
  const isRevise = status === "revise";
  return [
    {
      label: "Edit",
      icon: Pencil,
      visible: !props.isAdmin && (status === "pending" || isRevise),
      handler: () => emit("edit-request", row),
    },
    {
      label: "View",
      icon: Eye,
      visible: true,
      handler: () => emit("view-details", row),
    },
    {
      label: "Delete",
      icon: Trash2,
      visible: !props.isAdmin && status === "pending",
      variant: "danger",
      handler: () => emit("delete-request", row),
    },
  ];
}

const tableMinWidth = computed(() => "min-w-full");
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
          Reimbursement Requests
        </h2>
        <p class="mt-0.5 text-xs text-slate-400">
          Your reimbursement report records
        </p>
      </div>
      <span class="kpi-label text-slate-400">
        <template v-if="isLoading">Loading...</template>
        <template v-else>Showing {{ totalRows }} records</template>
      </span>
    </div>
    <div class="overflow-x-auto">
      <table
        class="w-full text-left border-collapse table-fixed"
        :class="tableMinWidth"
      >
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
                <ChevronDown v-else-if="isSorted(column)" class="h-3.5 w-3.5" />
                <ChevronsUpDown v-else class="h-3.5 w-3.5 text-slate-300" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <template v-if="isLoading">
            <tr
              v-for="i in pageSize"
              :key="`reimbursement-skeleton-${i}`"
              class="whitespace-nowrap"
            >
              <td v-for="col in columnCount" :key="col" class="px-5 py-5">
                <div
                  v-if="col === columnCount"
                  class="mx-auto flex h-8 w-16 max-w-full animate-pulse items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 sm:h-9 sm:w-20 sm:gap-2"
                >
                  <div
                    class="h-3 w-3 shrink-0 rounded bg-slate-200 sm:h-3.5 sm:w-3.5"
                  ></div>
                  <div class="h-2.5 w-5 rounded bg-slate-200 sm:w-7"></div>
                </div>
                <div
                  v-else
                  class="h-3.5 max-w-full animate-pulse rounded bg-slate-200"
                  :class="[
                    col === columnCount - 1
                      ? 'mx-auto h-5 w-16 rounded-full sm:w-20'
                      : '',
                    col === 1 ? 'w-12 sm:w-14' : '',
                    col === 2 ? 'w-28 sm:w-40' : '',
                    col === 5 ? 'mx-auto w-8 sm:w-10' : '',
                    col === 7 ? 'ml-auto w-20 sm:w-24' : '',
                    ![1, 2, 5, 7, columnCount - 1, columnCount].includes(col)
                      ? 'w-20 sm:w-24'
                      : '',
                  ]"
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
                No reimbursement records found.
              </td>
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="transition-colors duration-200 ease-out group whitespace-nowrap"
            >
              <td class="max-w-[240px] px-5 py-5 text-sm text-slate-600">
                <span class="block truncate font-medium text-slate-800">{{ row.reportDescription }}</span>
                <span
                  v-if="row.user_comment"
                  class="block truncate text-xs text-slate-400 mt-0.5"
                  :title="row.user_comment"
                >
                  {{ row.user_comment }}
                </span>
              </td>

              <td class="px-5 py-5">
                <span
                  class="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"
                >
                  {{ row.category }}
                </span>
              </td>
              <td class="px-5 py-5 text-sm font-bold text-right text-primary">
                {{ formatAmount(row.amount, row.currency || 'PHP') }}
              </td>
              <td class="px-5 py-5 text-sm truncate text-slate-500">
                {{ formatDate(row.dateSubmitted) }}
              </td>
              <td
                v-if="isAdmin"
                class="px-5 py-5 text-sm font-semibold truncate text-slate-600"
              >
                {{ row.submittedBy }}
              </td>
              <td class="px-5 py-5 text-center">
                <StatusBadge :status="row.displayStatus" />
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
