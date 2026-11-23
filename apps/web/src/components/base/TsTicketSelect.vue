<script setup>
import { computed, onMounted, ref } from "vue";
import { useTsStore } from "@/stores/ts";
import { AlertTriangle, RefreshCw, Ticket, X } from "lucide-vue-next";

const props = defineProps({
  ticketId: {
    type: [Number, String, null],
    default: null,
  },
  ticketNumber: {
    type: String,
    default: "",
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    default: "Support Ticket (TS, Optional)",
  },
});

const emit = defineEmits(["update:ticketId", "update:ticketNumber"]);

let tsStore = null;
try {
  tsStore = useTsStore();
} catch {
  tsStore = null;
}

const searchTerm = ref("");
const fallbackTickets = ref([]);
const fallbackLoading = ref(false);
const fallbackAvailable = ref(true);

const tickets = computed(() =>
  tsStore ? tsStore.tickets : fallbackTickets.value,
);
const isLoading = computed(() =>
  tsStore ? tsStore.loadingTickets : fallbackLoading.value,
);
const isAvailable = computed(() =>
  tsStore ? tsStore.ticketsAvailable : fallbackAvailable.value,
);

const filteredTickets = computed(() => {
  const q = searchTerm.value.trim().toLowerCase();
  if (!q) return tickets.value;
  return tickets.value.filter((t) => {
    const number = String(t.ticket_number || "").toLowerCase();
    const title = String(t.title || "").toLowerCase();
    const dept = String(t.department || "").toLowerCase();
    const assignee = String(t.assignee_name || "").toLowerCase();
    const status = String(t.status || "").toLowerCase();
    return (
      number.includes(q) ||
      title.includes(q) ||
      dept.includes(q) ||
      assignee.includes(q) ||
      status.includes(q)
    );
  });
});

const selectedTicketMatch = computed(() => {
  if (!props.ticketId) return null;
  return (
    tickets.value.find((t) => Number(t.ticket_id) === Number(props.ticketId)) ||
    null
  );
});

const hasUnlistedSelectedTicket = computed(
  () =>
    Boolean(props.ticketId) &&
    !filteredTickets.value.some(
      (t) => Number(t.ticket_id) === Number(props.ticketId),
    ),
);

async function loadTickets(query = "") {
  if (!tsStore) return;
  await tsStore.fetchTickets(query, "", 100);
}

function handleSelect(event) {
  const rawVal = event.target.value;
  if (!rawVal) {
    emit("update:ticketId", null);
    emit("update:ticketNumber", "");
    return;
  }
  const selectedId = Number(rawVal);
  const match = tickets.value.find(
    (t) => Number(t.ticket_id) === selectedId,
  );
  emit("update:ticketId", Number.isFinite(selectedId) ? selectedId : rawVal);
  emit("update:ticketNumber", match?.ticket_number || props.ticketNumber || "");
}

function clearSelection() {
  emit("update:ticketId", null);
  emit("update:ticketNumber", "");
}

onMounted(() => {
  if (tsStore && tsStore.tickets.length === 0) {
    loadTickets();
  }
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <label class="input-label flex items-center gap-1.5 !mb-0" for="ts-ticket-select">
        <Ticket class="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        <span>{{ label }}</span>
      </label>
      <div class="flex items-center gap-2">
        <button
          v-if="ticketId"
          type="button"
          class="text-[11px] font-medium text-slate-500 hover:text-danger inline-flex items-center gap-0.5"
          aria-label="Clear selected TS ticket"
          :disabled="disabled"
          @click="clearSelection"
        >
          <X class="w-3 h-3" aria-hidden="true" /> Clear
        </button>
        <button
          type="button"
          class="text-[11px] font-medium text-slate-500 hover:text-primary inline-flex items-center gap-1"
          aria-label="Refresh TS tickets"
          :disabled="disabled || isLoading"
          @click="loadTickets(searchTerm)"
        >
          <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isLoading }" aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input
        v-model="searchTerm"
        type="text"
        class="input text-sm"
        placeholder="Filter TS tickets by number, title, or assignee..."
        :disabled="disabled || isLoading"
        aria-label="Filter TS tickets"
      />
      <select
        id="ts-ticket-select"
        :value="ticketId ?? ''"
        class="input text-sm bg-white"
        aria-label="Select TS ticket"
        :disabled="disabled || isLoading"
        @change="handleSelect"
      >
        <option value="">No linked TS ticket</option>
        <option
          v-if="hasUnlistedSelectedTicket"
          :value="ticketId"
        >
          {{ ticketNumber ? `${ticketNumber} (Ticket #${ticketId})` : `Ticket #${ticketId}` }}
        </option>
        <option
          v-for="ticket in filteredTickets"
          :key="ticket.ticket_id"
          :value="ticket.ticket_id"
        >
          {{ ticket.ticket_number }} — {{ ticket.title }} ({{ ticket.status }})
        </option>
      </select>
    </div>

    <p v-if="!isAvailable" role="status" class="text-xs text-amber-700 inline-flex items-center gap-1.5">
      <AlertTriangle class="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Ticketing system (TS) is currently unavailable. You can still submit without linking a ticket.</span>
    </p>
    <p v-else-if="ticketId" class="text-xs text-slate-500">
      Linked Ticket:
      <span class="font-medium text-slate-700">
        {{ ticketNumber || selectedTicketMatch?.ticket_number || `#${ticketId}` }}
      </span>
      <span v-if="selectedTicketMatch?.title" class="text-slate-400">
        — {{ selectedTicketMatch.title }}
      </span>
    </p>
  </div>
</template>
