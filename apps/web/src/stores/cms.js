import { defineStore } from "pinia";
import { ref } from "vue";
import { apiFetch } from "@/utils/apiFetch";

export const useCmsStore = defineStore("cms", () => {
  const contracts = ref([]);
  const contractsAvailable = ref(true);
  const contractsError = ref("");
  const loadingContracts = ref(false);

  const recurringVendors = ref([]);
  const loadingRecurring = ref(false);

  async function fetchActiveContracts(search = "", limit = 100) {
    loadingContracts.value = true;
    contractsError.value = "";
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (search && search.trim()) {
        params.set("search", search.trim());
      }
      const response = await apiFetch(
        `/api/serms/cms/contracts/active?${params.toString()}`,
        { credentials: "include" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        contractsAvailable.value = false;
        contracts.value = [];
        contractsError.value = data.message || "Unable to fetch CMS contracts.";
        return [];
      }
      contractsAvailable.value = data.available !== false;
      contractsError.value = data.error || "";
      contracts.value = Array.isArray(data.data) ? data.data : [];
      return contracts.value;
    } catch (err) {
      contractsAvailable.value = false;
      contracts.value = [];
      contractsError.value = err?.message || "CMS unavailable.";
      return [];
    } finally {
      loadingContracts.value = false;
    }
  }

  async function suggestVendor(payload) {
    const response = await apiFetch("/api/serms/cms/vendors/suggest", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      data: data.data ?? null,
      message: data.message || "Vendor suggestion processed.",
      vendor_suggested_at: data.vendor_suggested_at || null,
    };
  }

  async function fetchRecurringExpenses() {
    loadingRecurring.value = true;
    try {
      const response = await apiFetch("/api/serms/cms/recurring-expenses", {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to load recurring expenses.");
      }
      recurringVendors.value = Array.isArray(data.data) ? data.data : [];
      return recurringVendors.value;
    } finally {
      loadingRecurring.value = false;
    }
  }

  async function forwardContractRequest(payload) {
    const response = await apiFetch("/api/serms/cms/contract-requests", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Failed to forward contract request to CMS.");
    }
    const created = data.data;
    if (created?.source_reference_id) {
      recurringVendors.value = recurringVendors.value.map((item) =>
        item.source_reference_id === created.source_reference_id
          ? {
              ...item,
              forwarded_request: {
                id: created.id,
                contract_code: created.contract_code,
                status: created.status,
                supporting_expense_summary: created.supporting_expense_summary,
                forwarded_at: created.forwarded_at,
              },
            }
          : item,
      );
    }
    return created;
  }

  return {
    contracts,
    contractsAvailable,
    contractsError,
    loadingContracts,
    recurringVendors,
    loadingRecurring,
    fetchActiveContracts,
    suggestVendor,
    fetchRecurringExpenses,
    forwardContractRequest,
  };
});
