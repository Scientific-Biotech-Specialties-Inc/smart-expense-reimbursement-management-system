<script setup>
import { computed, onMounted, ref } from "vue";
import * as vueRouter from "vue-router";
import { useTsStore } from "@/stores/ts";
import { formatAmount, formatDate } from "@/utils/formatters";
import BaseButton from "@/components/base/BaseButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Eye,
  Flag,
  Plus,
  RefreshCw,
  Search,
  Ticket,
} from "lucide-vue-next";

const tsStore = useTsStore();

let router = null;
try {
  router = typeof vueRouter.useRouter === "function" ? vueRouter.useRouter() : null;
} catch {
  router = null;
}

const searchQuery = ref("");
const selectedStatus = ref("");

const BASE_STATUS_OPTIONS = [
  "Open",
  "In Progress",
  "Pending Evaluation",
  "Resolved",
  "Closed",
  "Discarded",
];

const statusOptions = computed(() => {
  const seen = new Set(BASE_STATUS_OPTIONS.map((s) => s.toLowerCase()));
  const options = [...BASE_STATUS_OPTIONS];
  for (const ticket of tsStore.tickets) {
    const s = String(ticket?.status || "").trim();
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      options.push(s);
    }
  }
  return options;
});

function getLinkedReimbursement(ticket) {
  const r = ticket?.reimbursement;
  if (!r) return null;
  const id = r.reimbursement_id ?? r.id ?? null;
  const status = String(r.status ?? r.reimbursement_status ?? "").toLowerCase();
  const amount = r.amount ?? r.reimbursement_amount ?? null;
  const referenceNo = r.reference_no || (id ? `#${id}` : "");
  if (!id && !referenceNo) return null;
  return { id, status, amount, referenceNo };
}

function isReimbursementCreatable(linked) {
  return !linked || linked.status === "rejected";
}

function priorityBadgeClass(priority) {
  const p = String(priority || "").toLowerCase();
  if (p === "urgent" || p === "critical") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (p === "high") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (p === "medium") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

const filteredTickets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const statusFilter = selectedStatus.value.trim().toLowerCase();

  return tsStore.tickets.filter((ticket) => {
    if (statusFilter) {
      const ticketStatus = String(ticket?.status || "").trim().toLowerCase();
      if (ticketStatus !== statusFilter) return false;
    }
    if (!q) return true;

    const linked = getLinkedReimbursement(ticket);
    return [
      ticket.ticket_number,
      ticket.ticket_id,
      ticket.title,
      ticket.status,
      ticket.priority,
      ticket.assignee_name,
      ticket.assignee_email,
      ticket.department,
      linked?.referenceNo,
    ].some((val) =>
      String(val || "")
        .toLowerCase()
        .includes(q),
    );
  });
});

async function refreshTickets() {
  await tsStore.fetchTickets(searchQuery.value, selectedStatus.value, 100);
}

function viewReimbursement(id) {
  if (!id || !router?.push) return;
  router.push({
    path: "/reimbursements",
    query: { view: String(id) },
  });
}

function createReimbursement(ticket) {
  if (!ticket?.ticket_id || !router?.push) return;
  router.push({
    path: "/reimbursements/new",
    query: {
      ticket_id: String(ticket.ticket_id),
      ticket_number: ticket.ticket_number || "",
    },
  });
}

onMounted(() => {
  refreshTickets();
});
</script>

<template>
  <section class="card p-5 space-y-4" aria-label="Ticketing System tickets">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
          <Ticket class="w-4 h-4 text-primary" aria-hidden="true" />
          <span>Support Tickets (TS)</span>
        </h2>
        <p class="text-xs text-slate-500 mt-0.5">
          View current Ticketing System tickets and check or create linked expense reimbursements.
        </p>
      </div>
      <BaseButton
        variant="outline"
        size="sm"
        type="button"
        aria-label="Refresh TS tickets"
        :disabled="tsStore.loadingTickets"
        @click="refreshTickets"
      >
        <RefreshCw
          class="w-3.5 h-3.5"
          :class="{ 'animate-spin': tsStore.loadingTickets }"
          aria-hidden="true"
        />
        <span>Refresh</span>
      </BaseButton>
    </div>

    <!-- Search & Status Filter -->
    <div class="flex flex-col sm:flex-row gap-2.5 sm:items-center">
      <div class="relative flex-1 min-w-0">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          v-model="searchQuery"
          type="search"
          class="input min-h-[40px] pl-9 text-sm"
          placeholder="Search by ticket #, title, assignee, department, or RMB ref..."
          aria-label="Search TS tickets"
          @keydown.enter.prevent="refreshTickets"
        />
      </div>
      <div class="sm:w-56 shrink-0">
        <select
          id="ts-status-filter"
          v-model="selectedStatus"
          class="input min-h-[40px] text-sm bg-white"
          aria-label="Filter tickets by status"
        >
          <option value="">All Statuses</option>
          <option
            v-for="statusOpt in statusOptions"
            :key="statusOpt"
            :value="statusOpt"
          >
            {{ statusOpt }}
          </option>
        </select>
      </div>
    </div>

    <!-- TS Unavailable Banner -->
    <div
      v-if="!tsStore.loadingTickets && !tsStore.ticketsAvailable"
      role="alert"
      class="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-amber-900"
    >
      <AlertTriangle class="w-5 h-5 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
      <div class="space-y-1 text-xs">
        <p class="font-bold uppercase tracking-wide text-amber-800">
          Ticketing System (TS) Unavailable
        </p>
        <p>
          {{ tsStore.ticketsError || "Unable to fetch tickets from TS right now. Please try refreshing." }}
        </p>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div
      v-if="tsStore.loadingTickets"
      data-testid="ts-tickets-skeleton"
      aria-busy="true"
      aria-label="Loading TS tickets"
      class="space-y-3 py-2"
    >
      <span class="sr-only">Loading TS tickets...</span>
      <div
        v-for="rowIdx in 4"
        :key="`ts-skeleton-${rowIdx}`"
        class="grid grid-cols-1 sm:grid-cols-6 gap-3 items-center rounded-lg border border-slate-100 p-3"
      >
        <Skeleton class="h-4 w-28 sm:col-span-2" />
        <Skeleton class="h-4 w-24" />
        <Skeleton class="h-6 w-24 rounded-full" />
        <Skeleton class="h-4 w-20" />
        <Skeleton class="h-8 w-32 ml-auto" />
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="tsStore.ticketsAvailable && filteredTickets.length === 0"
      class="py-10 text-center space-y-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50"
    >
      <Ticket class="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
      <p class="text-sm font-medium text-slate-600">
        {{
          tsStore.tickets.length === 0
            ? "No support tickets found."
            : "No tickets match your current search or status filter."
        }}
      </p>
      <p class="text-xs text-slate-400">
        {{
          tsStore.tickets.length === 0
            ? "Tickets from the Ticketing System will appear here once created."
            : "Try clearing the search query or selecting All Statuses."
        }}
      </p>
    </div>

    <!-- Tickets Table -->
    <div v-else-if="filteredTickets.length > 0" class="overflow-x-auto">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-2.5 text-left">Ticket</th>
            <th class="px-4 py-2.5 text-left">Assignee &amp; Dept</th>
            <th class="px-4 py-2.5 text-left">Ticket Status</th>
            <th class="px-4 py-2.5 text-left">Date</th>
            <th class="px-4 py-2.5 text-left">Linked Reimbursement</th>
            <th class="px-4 py-2.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr
            v-for="ticket in filteredTickets"
            :key="ticket.ticket_id"
            :data-testid="`ts-ticket-row-${ticket.ticket_id}`"
          >
            <td class="px-4 py-3 align-top">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs font-bold text-primary">
                  {{ ticket.ticket_number || `#${ticket.ticket_id}` }}
                </span>
                <span
                  v-if="ticket.priority"
                  class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  :class="priorityBadgeClass(ticket.priority)"
                >
                  <Flag class="w-2.5 h-2.5" aria-hidden="true" />
                  <span>Priority: {{ ticket.priority }}</span>
                </span>
              </div>
              <p class="font-medium text-slate-800 mt-1">
                {{ ticket.title }}
              </p>
            </td>

            <td class="px-4 py-3 align-top text-xs">
              <p class="font-medium text-slate-700">
                {{ ticket.assignee_name || "Unassigned" }}
              </p>
              <p v-if="ticket.department" class="text-slate-500">
                {{ ticket.department }}
              </p>
              <p v-if="ticket.assignee_email" class="text-slate-400">
                {{ ticket.assignee_email }}
              </p>
            </td>

            <td class="px-4 py-3 align-top">
              <StatusBadge :status="ticket.status || 'open'" />
            </td>

            <td class="px-4 py-3 align-top text-xs text-slate-600 whitespace-nowrap">
              <p>{{ formatDate(ticket.created_at) }}</p>
              <p v-if="ticket.updated_at" class="text-[11px] text-slate-400">
                Updated {{ formatDate(ticket.updated_at) }}
              </p>
            </td>

            <td class="px-4 py-3 align-top">
              <template v-if="getLinkedReimbursement(ticket)">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="font-mono text-xs font-semibold text-primary">
                      {{ getLinkedReimbursement(ticket).referenceNo }}
                    </span>
                    <StatusBadge
                      v-if="getLinkedReimbursement(ticket).status"
                      :status="getLinkedReimbursement(ticket).status"
                    />
                  </div>
                  <p
                    v-if="getLinkedReimbursement(ticket).amount !== null"
                    class="text-xs font-semibold text-slate-700"
                  >
                    {{ formatAmount(getLinkedReimbursement(ticket).amount, "PHP") }}
                  </p>
                </div>
              </template>
              <span v-else class="text-xs text-slate-400">No linked claim</span>
            </td>

            <td class="px-4 py-3 align-top text-right whitespace-nowrap">
              <div class="inline-flex items-center justify-end gap-2">
                <BaseButton
                  v-if="isReimbursementCreatable(getLinkedReimbursement(ticket))"
                  variant="primary"
                  size="sm"
                  type="button"
                  :aria-label="`Create reimbursement for ${ticket.ticket_number || ticket.ticket_id}`"
                  @click="createReimbursement(ticket)"
                >
                  <Plus class="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Create Reimbursement</span>
                </BaseButton>
                <BaseButton
                  v-if="getLinkedReimbursement(ticket)?.id"
                  :variant="isReimbursementCreatable(getLinkedReimbursement(ticket)) ? 'ghost' : 'outline'"
                  size="sm"
                  type="button"
                  :aria-label="`View reimbursement ${getLinkedReimbursement(ticket).referenceNo} for ${ticket.ticket_number || ticket.ticket_id}`"
                  @click="viewReimbursement(getLinkedReimbursement(ticket).id)"
                >
                  <Eye class="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{{ isReimbursementCreatable(getLinkedReimbursement(ticket)) ? "View" : "View Reimbursement" }}</span>
                </BaseButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
