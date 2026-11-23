<script setup>
import { computed, onMounted, ref } from "vue";
import { useCmsStore } from "@/stores/cms";
import { Building2, RefreshCw, X } from "lucide-vue-next";

const props = defineProps({
  contractId: {
    type: [Number, String, null],
    default: null,
  },
  clientName: {
    type: String,
    default: "",
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    default: "Project / Client Contract (Optional)",
  },
});

const emit = defineEmits(["update:contractId", "update:clientName"]);

let cmsStore = null;
try {
  cmsStore = useCmsStore();
} catch {
  cmsStore = null;
}

const searchTerm = ref("");
const fallbackContracts = ref([]);
const fallbackLoading = ref(false);
const fallbackAvailable = ref(true);

const contracts = computed(() =>
  cmsStore ? cmsStore.contracts : fallbackContracts.value,
);
const isLoading = computed(() =>
  cmsStore ? cmsStore.loadingContracts : fallbackLoading.value,
);
const isAvailable = computed(() =>
  cmsStore ? cmsStore.contractsAvailable : fallbackAvailable.value,
);

const filteredContracts = computed(() => {
  const q = searchTerm.value.trim().toLowerCase();
  if (!q) return contracts.value;
  return contracts.value.filter((c) => {
    const code = String(c.contract_code || "").toLowerCase();
    const client = String(c.client_name || "").toLowerCase();
    const cat = String(c.category || "").toLowerCase();
    return code.includes(q) || client.includes(q) || cat.includes(q);
  });
});

async function loadContracts(query = "") {
  if (!cmsStore) return;
  await cmsStore.fetchActiveContracts(query, 100);
}

function handleSelect(event) {
  const rawVal = event.target.value;
  if (!rawVal) {
    emit("update:contractId", null);
    emit("update:clientName", "");
    return;
  }
  const selectedId = Number(rawVal);
  const match = contracts.value.find(
    (c) => Number(c.contract_id) === selectedId,
  );
  emit("update:contractId", selectedId);
  emit("update:clientName", match?.client_name || props.clientName || "");
}

function clearSelection() {
  emit("update:contractId", null);
  emit("update:clientName", "");
}

onMounted(() => {
  if (cmsStore && cmsStore.contracts.length === 0) {
    loadContracts();
  }
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <label class="input-label flex items-center gap-1.5 !mb-0" for="cms-contract-select">
        <Building2 class="w-3.5 h-3.5 text-slate-400" />
        <span>{{ label }}</span>
      </label>
      <div class="flex items-center gap-2">
        <button
          v-if="contractId"
          type="button"
          class="text-[11px] font-medium text-slate-500 hover:text-danger inline-flex items-center gap-0.5"
          :disabled="disabled"
          @click="clearSelection"
        >
          <X class="w-3 h-3" /> Clear
        </button>
        <button
          type="button"
          class="text-[11px] font-medium text-slate-500 hover:text-primary inline-flex items-center gap-1"
          :disabled="disabled || isLoading"
          @click="loadContracts(searchTerm)"
        >
          <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isLoading }" />
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input
        v-model="searchTerm"
        type="text"
        class="input text-sm"
        placeholder="Filter CMS contracts by client or code..."
        :disabled="disabled || isLoading"
        aria-label="Filter CMS contracts"
      />
      <select
        id="cms-contract-select"
        :value="contractId ?? ''"
        class="input text-sm bg-white"
        :disabled="disabled || isLoading"
        @change="handleSelect"
      >
        <option value="">No linked CMS contract</option>
        <option
          v-if="contractId && !contracts.some((c) => Number(c.contract_id) === Number(contractId))"
          :value="contractId"
        >
          Contract #{{ contractId }}{{ clientName ? ` — ${clientName}` : "" }}
        </option>
        <option
          v-for="contract in filteredContracts"
          :key="contract.contract_id"
          :value="contract.contract_id"
        >
          {{ contract.contract_code }} — {{ contract.client_name }}
        </option>
      </select>
    </div>

    <p v-if="!isAvailable" class="text-xs text-amber-700">
      CMS contract catalog is currently unavailable. You can still submit without linking a contract.
    </p>
    <p v-else-if="contractId && clientName" class="text-xs text-slate-500">
      Linked Client: <span class="font-medium text-slate-700">{{ clientName }}</span>
    </p>
  </div>
</template>
