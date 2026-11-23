import { ref, onUnmounted } from "vue";
import { apiFetch } from "@/utils/apiFetch";

export function useReimbursementDetails(store, addToast) {
  const viewingRecord = ref(null);
  const receiptDetailsOpen = ref(false);
  const selectedReceipt = ref(null);
  const reviewerNotes = ref("");
  const pendingReceiptDecision = ref(null);
  const isReceiptReviewSubmitting = ref(false);
  const modalLoading = ref(false);
  let pollingInterval = null;
  let pollingInFlight = false;

  function hasProcessingReceipts(record) {
    return (record?.receipts || []).some(
      (r) => String(r.status || "").toLowerCase() === "processing",
    );
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    pollingInFlight = false;
  }

  function startPolling(id) {
    stopPolling();
    pollingInterval = setInterval(async () => {
      if (pollingInFlight) return;
      pollingInFlight = true;

      try {
        const response = await apiFetch(`/api/serms/reimbursements/${id}`);
        if (response.ok) {
          const fullRecord = await response.json();
          viewingRecord.value = fullRecord;

          if (selectedReceipt.value) {
            const updatedReceipt = fullRecord.receipts.find(
              (r) => r.id === selectedReceipt.value.id
            );
            if (updatedReceipt) {
              selectedReceipt.value = {
                ...selectedReceipt.value,
                ...updatedReceipt,
              };
            }
          }

          // Update store items to keep main table fresh
          const itemIndex = store.items.findIndex((i) => i.id === fullRecord.id);
          if (itemIndex > -1) {
            store.items[itemIndex] = fullRecord;
          }

          const stillProcessing = hasProcessingReceipts(fullRecord);
          if (!stillProcessing) {
            stopPolling();
          }
        }
      } catch (error) {
        console.error("Failed to poll reimbursement details:", error);
      } finally {
        pollingInFlight = false;
      }
    }, 3000);
  }

  function closeDetails() {
    stopPolling();
    viewingRecord.value = null;
    receiptDetailsOpen.value = false;
    selectedReceipt.value = null;
    reviewerNotes.value = "";
    pendingReceiptDecision.value = null;
    isReceiptReviewSubmitting.value = false;
  }

  function viewReceiptDetails(receipt) {
    selectedReceipt.value = {
      ...receipt,
      reimbursement_user_id:
        viewingRecord.value?.user?.id ??
        viewingRecord.value?.user_id ??
        viewingRecord.value?.userId ??
        viewingRecord.value?.submitted_by,
    };
    reviewerNotes.value = receipt.admin_notes || "";
    pendingReceiptDecision.value = null;
    receiptDetailsOpen.value = true;
  }

  async function openDetails(row) {
    viewingRecord.value = { ...row, receipts: row.receipts || [] };
    selectedReceipt.value = null;
    reviewerNotes.value = "";
    pendingReceiptDecision.value = null;
    isReceiptReviewSubmitting.value = false;
    receiptDetailsOpen.value = false;
    modalLoading.value = true;

    try {
      const response = await apiFetch(`/api/serms/reimbursements/${row.id}`);
      if (!response.ok) throw new Error("Failed to fetch reimbursement details");
      const fullRecord = await response.json();
      viewingRecord.value = fullRecord;
      reviewerNotes.value = fullRecord.admin_notes || "";

      const needsPolling = hasProcessingReceipts(fullRecord);
      if (needsPolling) {
        startPolling(fullRecord.id);
      }
    } catch (error) {
      addToast({
        message: "Failed to load reimbursement details",
        type: "error",
      });
      console.error("Failed to load reimbursement details:", error);
      viewingRecord.value = null;
    } finally {
      modalLoading.value = false;
    }
  }

  function requestReceiptDecision(receipt, action) {
    pendingReceiptDecision.value = {
      receiptId: receipt.id,
      action,
    };
  }

  function cancelReceiptDecision() {
    pendingReceiptDecision.value = null;
  }

  function isReceiptDecisionPending(receipt) {
    if (!receipt) return false;
    return pendingReceiptDecision.value?.receiptId === receipt.id;
  }

  async function confirmReceiptDecision(receiptUpdates = {}) {
    if (!viewingRecord.value || !pendingReceiptDecision.value) return;

    isReceiptReviewSubmitting.value = true;
    const { receiptId, action } = pendingReceiptDecision.value;
    const status = action === "Approve" ? "approved" : "rejected";
    const vatClassification =
      receiptUpdates.vat_classification ||
      selectedReceipt.value?.vat_classification ||
      "vat";
    const vatAmount =
      vatClassification === "non-vat"
        ? 0
        : receiptUpdates.vat_amount ?? selectedReceipt.value?.vat_amount ?? 0;
    const totalAmount =
      receiptUpdates.total_amount ?? selectedReceipt.value?.total_amount ?? 0;
    const discountAmount =
      receiptUpdates.discount_amount ?? selectedReceipt.value?.discount_amount ?? 0;
    const discountType =
      receiptUpdates.discount_type ?? selectedReceipt.value?.discount_type ?? "none";

    try {
      const res = await apiFetch(
        `/api/serms/reimbursements/receipts/${receiptId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            admin_notes: reviewerNotes.value,
            total_amount: totalAmount,
            vat_amount: vatAmount,
            vat_classification: vatClassification,
            discount_amount: discountAmount,
            discount_type: discountType,
          }),
        },
      );

      if (!res.ok) throw new Error("Failed to update receipt decision");
      const json = await res.json();
      const updatedReceipt = json.data;

      // Update the receipt in viewingRecord
      const rIndex = viewingRecord.value.receipts.findIndex(
        (r) => r.id === receiptId,
      );
      if (rIndex > -1) {
        viewingRecord.value.receipts[rIndex] = updatedReceipt;
      }

      // If the selected receipt is the one that got updated, update it too
      if (selectedReceipt.value?.id === receiptId) {
        selectedReceipt.value = {
          ...selectedReceipt.value,
          ...updatedReceipt,
        };
      }

      // Refetch reimbursement to reflect automatic status updates
      const refetchRes = await apiFetch(
        `/api/serms/reimbursements/${viewingRecord.value.id}`,
      );
      if (refetchRes.ok) {
        const fullRecord = await refetchRes.json();
        viewingRecord.value = fullRecord;

        // Update in store.items
        const itemIndex = store.items.findIndex((i) => i.id === fullRecord.id);
        if (itemIndex > -1) {
          store.items[itemIndex] = fullRecord;
        }
      }

      addToast({
        message: `Receipt ${status === "approved" ? "approved" : "rejected"} successfully`,
        type: "success",
      });
      pendingReceiptDecision.value = null;
    } catch (error) {
      addToast({ message: "Failed to update receipt decision", type: "error" });
      console.error(error);
    } finally {
      isReceiptReviewSubmitting.value = false;
    }
  }

  onUnmounted(() => {
    stopPolling();
  });

  return {
    viewingRecord,
    receiptDetailsOpen,
    selectedReceipt,
    reviewerNotes,
    pendingReceiptDecision,
    isReceiptReviewSubmitting,
    modalLoading,
    closeDetails,
    viewReceiptDetails,
    openDetails,
    requestReceiptDecision,
    cancelReceiptDecision,
    isReceiptDecisionPending,
    confirmReceiptDecision,
  };
}
