import { defineStore } from "pinia";
import { ref } from "vue";
import { apiFetch } from "@/utils/apiFetch";

/**
 * Pinia store for Ticketing System (TS) ticket lookup and availability state.
 */
export const useTsStore = defineStore("ts", () => {
  const tickets = ref([]);
  const ticketsAvailable = ref(true);
  const ticketsError = ref("");
  const loadingTickets = ref(false);

  async function fetchTickets(search = "", status = "", limit = 100) {
    loadingTickets.value = true;
    ticketsError.value = "";
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (search && search.trim()) {
        params.set("search", search.trim());
      }
      if (status && status.trim() && status.trim().toLowerCase() !== "all") {
        params.set("status", status.trim());
      }

      const response = await apiFetch(
        `/api/serms/ts/tickets?${params.toString()}`,
        { credentials: "include" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ticketsAvailable.value = false;
        tickets.value = [];
        ticketsError.value = data.message || data.error || "Unable to fetch TS tickets.";
        return [];
      }

      ticketsAvailable.value = data.available !== false;
      ticketsError.value = data.error || "";
      tickets.value = Array.isArray(data.data) ? data.data : [];
      return tickets.value;
    } catch (err) {
      ticketsAvailable.value = false;
      tickets.value = [];
      ticketsError.value = err?.message || "Ticketing system unavailable.";
      return [];
    } finally {
      loadingTickets.value = false;
    }
  }

  return {
    tickets,
    ticketsAvailable,
    ticketsError,
    loadingTickets,
    fetchTickets,
  };
});
