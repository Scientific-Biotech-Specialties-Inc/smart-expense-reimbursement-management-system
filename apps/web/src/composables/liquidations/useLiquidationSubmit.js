import { ref } from "vue";
import { useToast } from "@/composables/useToast";
import { useLiquidationStore } from "@/stores/liquidation";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { numberOrZero } from "@/utils/numbers";
import { createSbsiReportPdfFile } from "@/utils/sbsiPdfGenerator";
import { buildTemplateParagraphs, formatPhp } from "@/utils/sbsiReportTemplateUtils";

export function useLiquidationSubmit() {
  const liqStore = useLiquidationStore();
  const store = useCashAdvanceStore();
  const { addToast } = useToast();
  
  const submitting = ref(false);

  async function submitLiquidation({
    receipts,
    selectedAdvance,
    reportAttachment,
    reportTemplateData = null,
    isManualMode = false,
    totalExpenses,
    variance,
    shortfallExplanation,
    existingLiquidation,
  }) {
    if (submitting.value) return false;
    submitting.value = true;

    try {
      let resolvedAttachment = reportAttachment;
      let resolvedTemplateData = null;

      if (!isManualMode && reportTemplateData) {
        resolvedAttachment = createSbsiReportPdfFile(reportTemplateData);
        resolvedTemplateData = reportTemplateData;
      }

      let resolvedShortfall = (shortfallExplanation || "").trim();
      if (!isManualMode && numberOrZero(variance) > 0 && !resolvedShortfall) {
        const p3 = resolvedTemplateData
          ? buildTemplateParagraphs(resolvedTemplateData).paragraphs?.[2]?.text
          : "";
        resolvedShortfall = (
          p3 ||
          `The excess unexpended cash balance of ${formatPhp(variance)} is being returned and remitted to Treasury/Finance alongside this submission.`
        ).slice(0, 255);
      }

      const payload = {
        items: receipts.map((receipt, index) => ({
          id: `${selectedAdvance.id}-receipt-${index + 1}`,
          category: "Receipt",
          description: receipt.name || receipt.file?.name || `Receipt ${index + 1}`,
          amount: numberOrZero(receipt.ocrData?.amount),
        })),
        receipts: receipts,
        reportAttachment: resolvedAttachment,
        reportTemplateData: resolvedTemplateData,
        totalExpenses: totalExpenses,
        variance: variance,
        shortfall_explanation: resolvedShortfall,
      };

      if (existingLiquidation) {
        await liqStore.updateSettlement(existingLiquidation.id, payload);
      } else {
        await liqStore.submitSettlement(selectedAdvance.id, payload);
      }

      const item = store.items.find((i) => i.id === selectedAdvance.id);
      if (item) {
        item.status = "under-review"; // matches backend lock transition
        item.balance = Math.max(variance, 0);
      }

      return true;
    } catch (err) {
      addToast({
        title: "Submission Failed",
        message: err.message || "Failed to submit liquidation settlement.",
        type: "danger",
      });
      return false;
    } finally {
      submitting.value = false;
    }
  }

  return {
    submitting,
    submitLiquidation,
  };
}
