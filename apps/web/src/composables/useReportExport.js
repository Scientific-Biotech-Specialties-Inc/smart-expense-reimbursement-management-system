import { ref } from "vue";
import { apiFetch } from "@/utils/apiFetch";
import { useToast } from "@/composables/useToast";

const DEFAULT_PREFIXES = {
  reimbursement: "Reimbursement-Report",
  "cash-advance": "Cash-Advance-Report",
  liquidation: "Liquidation-Report",
};

export function useReportExport() {
  const isExporting = ref(false);
  const { addToast } = useToast();

  async function exportReport(type, id, options = {}) {
    if (!type || id === null || id === undefined || isExporting.value) {
      return false;
    }

    const cleanId = String(id).replace(/^LIQ-0*/i, "");
    const query = options.byCashAdvance ? "?by=cash_advance" : "";
    const url = `/api/serms/reports/${type}/${encodeURIComponent(cleanId)}${query}`;

    isExporting.value = true;
    try {
      const response = await apiFetch(url, {
        headers: {
          Accept: "application/pdf",
        },
      });

      if (!response.ok) {
        let errorMessage = "Failed to export report. Please try again.";
        try {
          const errData = await response.json();
          if (errData?.message) {
            errorMessage = errData.message;
          }
        } catch {
          // Keep default error message if body is not JSON
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const disposition = response.headers?.get?.("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const prefix = DEFAULT_PREFIXES[type] || "SERMS-Report";
      const filename = filenameMatch?.[1] || `${prefix}-#${cleanId}.pdf`;

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      return true;
    } catch (error) {
      addToast({
        message: error?.message || "Failed to export report. Please try again.",
        type: "error",
      });
      return false;
    } finally {
      isExporting.value = false;
    }
  }

  return {
    isExporting,
    exportReport,
  };
}
