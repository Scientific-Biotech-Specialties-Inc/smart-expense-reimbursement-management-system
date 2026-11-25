import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { apiFetch } from "@/utils/apiFetch";

function unwrapPayload(payload) {
  return payload?.data ?? payload;
}

async function extractErrorMessage(response, fallback) {
  const errJson = await response.json().catch(() => ({}));
  if (errJson?.errors && typeof errJson.errors === "object") {
    const flattened = Object.values(errJson.errors).flat().filter(Boolean);
    if (flattened.length > 0) return flattened.join(" ");
  }
  return errJson?.message || fallback;
}

export const usePenaltyStore = defineStore("penalty", () => {
  const activeStrikesCount = ref(0);
  const strikeLimit = ref(3);
  const standing = ref("clear");
  const isPenalized = ref(false);
  const currentCycle = ref(1);
  const activeStrikes = ref([]);
  const historyStrikes = ref([]);
  const appeals = ref([]);
  const pendingAppeal = ref(null);
  const overdueMonetaryPenalties = ref({ total_amount: 0, records: [] });

  const adminOverview = ref({
    kpis: {
      penalized_count: 0,
      pending_appeals_count: 0,
      warning_count: 0,
      resolved_cycles_count: 0,
    },
    pending_appeals: [],
    standings: [],
    employees: [],
  });
  const adminStrikes = ref([]);

  const isLoading = ref(false);
  const isAdminLoading = ref(false);
  const isSubmitting = ref(false);
  const error = ref(null);

  const hasLoaded = ref(false);

  const latestAppeal = computed(() => {
    if (pendingAppeal.value) return pendingAppeal.value;
    if (!Array.isArray(appeals.value) || appeals.value.length === 0) return null;
    return appeals.value[0];
  });

  function applyMySummary(data = {}) {
    activeStrikesCount.value = Number(data.active_strikes_count ?? 0);
    strikeLimit.value = Number(data.strike_limit ?? 3);
    standing.value = data.standing || "clear";
    isPenalized.value = Boolean(data.is_penalized);
    currentCycle.value = Number(data.current_cycle ?? 1);
    activeStrikes.value = Array.isArray(data.active_strikes) ? data.active_strikes : [];
    historyStrikes.value = Array.isArray(data.history_strikes) ? data.history_strikes : [];
    appeals.value = Array.isArray(data.appeals) ? data.appeals : [];
    pendingAppeal.value = data.pending_appeal ?? null;
    overdueMonetaryPenalties.value = {
      total_amount: Number(data.overdue_monetary_penalties?.total_amount ?? 0),
      records: Array.isArray(data.overdue_monetary_penalties?.records)
        ? data.overdue_monetary_penalties.records
        : [],
    };
    hasLoaded.value = true;
  }

  async function fetchMyPenalties() {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await apiFetch("/api/serms/penalties/me");
      if (!response.ok) {
        const msg = await extractErrorMessage(response, "Failed to load compliance standing.");
        throw new Error(msg);
      }
      const json = await response.json();
      const data = unwrapPayload(json);
      applyMySummary(data);
      return data;
    } catch (err) {
      error.value = err?.message || "Failed to load compliance standing.";
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function submitAppeal(payload) {
    isSubmitting.value = true;
    error.value = null;
    try {
      let formData;
      if (payload instanceof FormData) {
        formData = payload;
      } else {
        formData = new FormData();
        formData.append("explanation", payload.explanation);
        if (payload.letter_file) {
          formData.append("letter_file", payload.letter_file);
        }
      }

      const response = await apiFetch("/api/serms/penalties/appeals", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const msg = await extractErrorMessage(response, "Failed to submit appeal letter.");
        throw new Error(msg);
      }

      const json = await response.json();
      const created = unwrapPayload(json);
      await fetchMyPenalties();
      return created;
    } catch (err) {
      error.value = err?.message || "Failed to submit appeal letter.";
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function fetchAdminOverview({ search = "", standing: standingFilter = "" } = {}) {
    isAdminLoading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams();
      if (search && search.trim()) params.set("search", search.trim());
      if (standingFilter && standingFilter !== "all") {
        params.set("standing", standingFilter);
      } else if (standingFilter === "all") {
        params.set("standing", "all");
      }
      const qs = params.toString();
      const url = `/api/serms/penalties/admin/overview${qs ? `?${qs}` : ""}`;
      const response = await apiFetch(url);
      if (!response.ok) {
        const msg = await extractErrorMessage(response, "Failed to load penalty overview.");
        throw new Error(msg);
      }
      const json = await response.json();
      const data = unwrapPayload(json) || {};
      adminOverview.value = {
        kpis: {
          penalized_count: Number(data.kpis?.penalized_count ?? 0),
          pending_appeals_count: Number(data.kpis?.pending_appeals_count ?? 0),
          warning_count: Number(data.kpis?.warning_count ?? 0),
          resolved_cycles_count: Number(data.kpis?.resolved_cycles_count ?? 0),
        },
        pending_appeals: Array.isArray(data.pending_appeals) ? data.pending_appeals : [],
        standings: Array.isArray(data.standings) ? data.standings : [],
        employees: Array.isArray(data.employees) ? data.employees : [],
      };
      return adminOverview.value;
    } catch (err) {
      error.value = err?.message || "Failed to load penalty overview.";
      throw err;
    } finally {
      isAdminLoading.value = false;
    }
  }

  async function fetchAdminStrikes({ status = "", module = "", search = "" } = {}) {
    isAdminLoading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (module && module !== "all") params.set("module", module);
      if (search && search.trim()) params.set("search", search.trim());
      const qs = params.toString();
      const url = `/api/serms/penalties/admin/strikes${qs ? `?${qs}` : ""}`;
      const response = await apiFetch(url);
      if (!response.ok) {
        const msg = await extractErrorMessage(response, "Failed to load strike history.");
        throw new Error(msg);
      }
      const json = await response.json();
      const data = unwrapPayload(json);
      adminStrikes.value = Array.isArray(data)
        ? data
        : Array.isArray(data?.strikes)
          ? data.strikes
          : [];
      return adminStrikes.value;
    } catch (err) {
      error.value = err?.message || "Failed to load strike history.";
      throw err;
    } finally {
      isAdminLoading.value = false;
    }
  }

  async function fetchUserRecords(userId) {
    const response = await apiFetch(`/api/serms/penalties/admin/users/${userId}/records`);
    if (!response.ok) {
      const msg = await extractErrorMessage(response, "Failed to load employee records.");
      throw new Error(msg);
    }
    const json = await response.json();
    const data = unwrapPayload(json) || {};
    return {
      cash_advances: Array.isArray(data.cash_advances) ? data.cash_advances : [],
      liquidations: Array.isArray(data.liquidations) ? data.liquidations : [],
      reimbursements: Array.isArray(data.reimbursements) ? data.reimbursements : [],
    };
  }

  async function reviewAppeal(appealId, { decision, comment = "" }) {
    isSubmitting.value = true;
    error.value = null;
    try {
      const response = await apiFetch(`/api/serms/penalties/admin/appeals/${appealId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, comment }),
      });
      if (!response.ok) {
        const msg = await extractErrorMessage(response, "Failed to review appeal.");
        throw new Error(msg);
      }
      const json = await response.json();
      return unwrapPayload(json);
    } catch (err) {
      error.value = err?.message || "Failed to review appeal.";
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function issueManualStrike({ user_id, source_module, source_id, reason }) {
    isSubmitting.value = true;
    error.value = null;
    try {
      const response = await apiFetch("/api/serms/penalties/admin/strikes", {
        method: "POST",
        body: JSON.stringify({ user_id, source_module, source_id, reason }),
      });
      if (!response.ok) {
        const msg = await extractErrorMessage(response, "Failed to issue strike.");
        throw new Error(msg);
      }
      const json = await response.json();
      return unwrapPayload(json);
    } catch (err) {
      error.value = err?.message || "Failed to issue strike.";
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function waiveStrike(strikeId, { reason }) {
    isSubmitting.value = true;
    error.value = null;
    try {
      const response = await apiFetch(`/api/serms/penalties/admin/strikes/${strikeId}/waive`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const msg = await extractErrorMessage(response, "Failed to waive strike.");
        throw new Error(msg);
      }
      const json = await response.json();
      return unwrapPayload(json);
    } catch (err) {
      error.value = err?.message || "Failed to waive strike.";
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function resetUserStrikes(userId, { reason }) {
    isSubmitting.value = true;
    error.value = null;
    try {
      const response = await apiFetch(`/api/serms/penalties/admin/users/${userId}/reset`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const msg = await extractErrorMessage(response, "Failed to reset strikes.");
        throw new Error(msg);
      }
      const json = await response.json();
      return unwrapPayload(json);
    } catch (err) {
      error.value = err?.message || "Failed to reset strikes.";
      throw err;
    } finally {
      isSubmitting.value = false;
    }
  }

  return {
    activeStrikesCount,
    strikeLimit,
    standing,
    isPenalized,
    currentCycle,
    activeStrikes,
    historyStrikes,
    appeals,
    pendingAppeal,
    latestAppeal,
    overdueMonetaryPenalties,
    adminOverview,
    adminStrikes,
    isLoading,
    isAdminLoading,
    isSubmitting,
    error,
    hasLoaded,
    fetchMyPenalties,
    submitAppeal,
    fetchAdminOverview,
    fetchAdminStrikes,
    fetchUserRecords,
    reviewAppeal,
    issueManualStrike,
    waiveStrike,
    resetUserStrikes,
  };
});
