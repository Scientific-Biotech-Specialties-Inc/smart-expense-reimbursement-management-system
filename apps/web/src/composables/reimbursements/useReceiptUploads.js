import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import {
  buildPrefilledReceiptDraft,
  markOcrReturnedAndGetMissingWarning,
} from "@/utils/receiptUtils";
import { isOcrOfflineFailure } from "@/utils/ocrErrors";

export function useReceiptUploads(options = {}) {
  const authStore = useAuthStore();
  const isDraftMode = options.isDraft ?? true;
  const DRAFT_KEY = options.draftKey || "serms_draft_receipts";
  const initialDrafts = sessionStorage.getItem(DRAFT_KEY);
  const localReceipts = ref(initialDrafts ? JSON.parse(initialDrafts) : []);

  const qualityRejection = ref(null);
  const showSegmentedUpload = ref(false);

  // Safety net: never let an OCR-offline failure open the quality modal,
  // even if a future code path assigns it directly. Toast is enough and the
  // user stays on the reimbursement page with Retry OCR available.
  watch(qualityRejection, (val) => {
    if (
      val &&
      isOcrOfflineFailure({
        rejectionCode: val.rejectionCode,
        rejectionReason: val.rejectionReason,
      })
    ) {
      qualityRejection.value = null;
    }
  });

  watch(
    localReceipts,
    (newVal) => {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(newVal));
    },
    { deep: true },
  );

  function clearDraftReceipts() {
    sessionStorage.removeItem(DRAFT_KEY);
    localReceipts.value = [];
  }

  function clearQualityRejection() {
    qualityRejection.value = null;
  }

  const receiptDrag = ref(false);
  const receiptInput = ref(null);
  const { addToast } = useToast();

  function checkAndNotifyMissingFields(receipt) {
    const warning = markOcrReturnedAndGetMissingWarning(receipt);
    if (warning) {
      addToast({
        message: warning,
        type: "warning",
      });
    }
  }

  const pollTimers = {};

  function cleanupReceiptResources(receipt) {
    if (!receipt) return;
    if (
      receipt.thumbnail?.startsWith("blob:") &&
      typeof URL.revokeObjectURL === "function"
    ) {
      URL.revokeObjectURL(receipt.thumbnail);
    }
    if (Array.isArray(receipt.images)) {
      receipt.images.forEach((img) => {
        const u = typeof img === "string" ? img : img?.url;
        if (u?.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(u);
        }
      });
    }
    if (receipt.id && pollTimers[receipt.id]) {
      clearInterval(pollTimers[receipt.id]);
      delete pollTimers[receipt.id];
    }
  }

  async function deleteDraftFromBackend(id) {
    if (!id || String(id).startsWith("temp-")) return;
    try {
      const headers = { Accept: "application/json" };
      if (authStore.token) headers["Authorization"] = `Bearer ${authStore.token}`;
      await fetch(`/api/serms/reimbursements/receipts/${id}`, {
        method: "DELETE",
        headers,
      });
    } catch {
      // Non-fatal cleanup errors are intentionally ignored for rejected/canceled drafts.
    }
  }

  async function purgeRejectedReceipt(idOrTempId) {
    if (!idOrTempId) return;
    const targetKey = String(idOrTempId);
    const existing = localReceipts.value.find(
      (r) => String(r.id) === targetKey,
    );
    if (existing) {
      cleanupReceiptResources(existing);
      localReceipts.value = localReceipts.value.filter(
        (r) => String(r.id) !== targetKey,
      );
    } else if (pollTimers[idOrTempId]) {
      clearInterval(pollTimers[idOrTempId]);
      delete pollTimers[idOrTempId];
    }

    if (!targetKey.startsWith("temp-") && !existing?.isForwarded) {
      await deleteDraftFromBackend(idOrTempId);
    }
  }

  function handleReceiptRejectionOrFailure({
    index,
    tempId,
    receiptId,
    file,
    payload,
    isHttp422 = false,
    isMultiSegment = false,
    segmentImages = null,
    defaultQualityReason = "Receipt image quality is too low for accurate OCR data extraction.",
    toastPrefix = "Receipt rejected",
  }) {
    const status = String(payload?.status || "").toLowerCase();
    const reason =
      payload?.rejection_reason ||
      payload?.message ||
      payload?.error ||
      "";
    const isOffline =
      status === "failed" ||
      isOcrOfflineFailure({
        status,
        rejectionCode: payload?.rejection_code,
        rejectionReason: reason,
      });

    if (isOffline) {
      const offlineReason =
        reason || "OCR processing failed. You can retry OCR.";
      const offlineCode = payload?.rejection_code || "ocr_failed";
      if (index !== -1) {
        if (!isHttp422 && payload?.id) {
          localReceipts.value[index] = {
            ...buildPrefilledReceiptDraft({
              id: payload.id,
              file,
              receiptData: payload,
              thumbnail: localReceipts.value[index].thumbnail,
            }),
            isUploading: false,
            isProcessing: false,
            isRejected: true,
            ...(isMultiSegment
              ? { isMultiReceipt: true, images: segmentImages }
              : {}),
            rejectionCode: offlineCode,
            rejectionReason: offlineReason,
          };
        } else {
          localReceipts.value[index] = {
            ...localReceipts.value[index],
            isUploading: false,
            isProcessing: false,
            isRejected: true,
            rejectionCode: offlineCode,
            rejectionReason: offlineReason,
          };
        }
      }
      addToast({ message: offlineReason, type: "error" });
      return;
    }

    const resolvedId = payload?.id || receiptId || tempId;
    if (index !== -1 && resolvedId && localReceipts.value[index]) {
      localReceipts.value[index].id = resolvedId;
    }

    if (checkIsDuplicateResponse(payload)) {
      const msg =
        payload?.rejection_reason ||
        payload?.message ||
        (payload?.errors?.file_hash ? payload.errors.file_hash[0] : null) ||
        payload?.error ||
        "Duplicate receipt detected.";
      window.dispatchEvent(
        new CustomEvent("receipt-duplicate-detected", {
          detail: {
            similarityScore: payload?.duplicate_similarity || 1.0,
            receiptId: resolvedId,
            message: msg,
          },
        }),
      );
      purgeRejectedReceipt(resolvedId);
      return;
    }

    const rejectionCode = payload?.rejection_code || "blurry";
    const rejectionReason =
      payload?.rejection_reason ||
      payload?.error ||
      payload?.message ||
      defaultQualityReason;

    qualityRejection.value = {
      receiptId: resolvedId,
      file,
      rejectionCode,
      rejectionReason,
    };
    addToast({
      message: `${toastPrefix}: ${payload?.rejection_reason || payload?.error || payload?.message || "Image quality issue"}`,
      type: "error",
    });
    purgeRejectedReceipt(resolvedId);
  }

  function checkIsDuplicateResponse(data) {
    if (!data) return false;
    if (
      data.rejection_code === "duplicate" ||
      data.rejectionCode === "duplicate" ||
      data.is_duplicate ||
      data.isDuplicate
    ) {
      return true;
    }
    const reason = (
      data.rejection_reason ||
      data.rejectionReason ||
      data.message ||
      data.error ||
      ""
    ).toLowerCase();
    if (reason.includes("duplicate")) return true;
    if (data.errors) {
      const errStr = JSON.stringify(data.errors).toLowerCase();
      if (errStr.includes("duplicate")) return true;
    }
    return false;
  }

  function startPolling(receiptId) {
    if (pollTimers[receiptId]) return;
    pollTimers[receiptId] = setInterval(async () => {
      try {
        const headers = { Accept: "application/json" };
        if (authStore.token)
          headers["Authorization"] = `Bearer ${authStore.token}`;

        const res = await fetch(
          `/api/serms/reimbursements/receipts/${receiptId}`,
          { headers },
        );
        if (!res.ok) return;

        const { data } = await res.json();
        if (data.status !== "processing") {
          clearInterval(pollTimers[receiptId]);
          delete pollTimers[receiptId];

          const index = localReceipts.value.findIndex(
            (r) => String(r.id) === String(receiptId),
          );

          if (data.status === "rejected" || data.status === "failed") {
            const rejectedItem = index !== -1 ? localReceipts.value[index] : null;
            const fileObj = rejectedItem?.sourceFile || rejectedItem?.file || null;
            handleReceiptRejectionOrFailure({
              index,
              receiptId,
              file: fileObj,
              payload: data,
            });
            return;
          }

          if (index !== -1) {
            const currentItem = localReceipts.value[index];
            const oldThumbnail = currentItem.thumbnail;
            const oldImages = currentItem.images;
            const isMulti = currentItem.isMultiReceipt || (Array.isArray(data.file_url) && data.file_url.length > 1);
            const updatedReceipt = buildPrefilledReceiptDraft({
              id: data.id,
              receiptData: data,
              thumbnail: oldThumbnail,
            });
            updatedReceipt.isUploading = false;
            updatedReceipt.isProcessing = false;
            if (isMulti) {
              updatedReceipt.isMultiReceipt = true;
              updatedReceipt.images = oldImages || (Array.isArray(data.file_url) ? data.file_url : []);
            }
            localReceipts.value[index] = updatedReceipt;
            checkAndNotifyMissingFields(localReceipts.value[index]);
          }
        }
      } catch (e) {
        console.error("Polling error for receipt", receiptId, e);
      }
    }, 3000);
  }

  onMounted(() => {
    localReceipts.value.forEach((r) => {
      if (r.isProcessing) {
        startPolling(r.id);
      }
    });
    window.addEventListener('remove-duplicate-receipt', handleRemoveDuplicateEvent);
  });

  onBeforeUnmount(() => {
    Object.values(pollTimers).forEach(clearInterval);
    window.removeEventListener('remove-duplicate-receipt', handleRemoveDuplicateEvent);
  });

  function handleRemoveDuplicateEvent(e) {
    if (e.detail?.receiptId) {
      removeReceipt({ id: e.detail.receiptId });
    }
  }

  function handleReceiptDrop(e) {
    receiptDrag.value = false;
    return addReceiptFiles(e.dataTransfer.files);
  }

  function handleReceiptSelect(e) {
    const res = addReceiptFiles(e.target.files);
    if (e.target) e.target.value = "";
    return res;
  }

  async function addReceiptFiles(fileList) {
    const allowedMimeTypes = ["image/jpeg", "image/png", "application/pdf"];
    const files = Array.from(fileList || []);

    const accepted = files.filter((file) =>
      allowedMimeTypes.includes(file.type),
    );

    files
      .filter((file) => !allowedMimeTypes.includes(file.type))
      .forEach((file) => {
        addToast({
          message: `${file.name} has an invalid file type. Only JPEG, PNG, or PDF files are allowed.`,
          type: "error",
        });
      });

    for (const file of accepted) {
      if (file.size > 2 * 1024 * 1024) {
        addToast({ message: `${file.name} exceeds 2MB limit`, type: "error" });
        continue;
      }

      const tempId = `temp-${Date.now()}`;
      const receiptObj = buildPrefilledReceiptDraft({
        id: tempId,
        file,
        thumbnail: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : "",
      });
      receiptObj.isUploading = true;
      localReceipts.value.push(receiptObj);

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (isDraftMode) {
          formData.append("is_draft", "1");
        }

        const headers = { Accept: "application/json" };
        if (authStore.token)
          headers["Authorization"] = `Bearer ${authStore.token}`;

        const res = await fetch("/api/serms/reimbursements/receipts", {
          method: "POST",
          headers,
          body: formData,
        });

        if (res.status === 422) {
          const errorData = await res.json();
          const index = localReceipts.value.findIndex((r) => r.id === tempId);
          handleReceiptRejectionOrFailure({
            index,
            tempId,
            file,
            payload: errorData,
            isHttp422: true,
            defaultQualityReason:
              "Receipt image quality is too low for OCR processing.",
          });
          return;
        }

        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();

        const index = localReceipts.value.findIndex((r) => r.id === tempId);

        if (data.data?.status === "rejected" || data.data?.status === "failed") {
          handleReceiptRejectionOrFailure({
            index,
            tempId,
            file,
            payload: data.data,
          });
          return;
        }

        if (index !== -1) {
          localReceipts.value[index] = {
            ...buildPrefilledReceiptDraft({
              id: data.data.id,
              file,
              receiptData: data.data,
              thumbnail: localReceipts.value[index].thumbnail,
            }),
            isUploading: false,
            isProcessing: data.data.status === "processing",
          };
          if (data.data.status === "processing") {
            startPolling(data.data.id);
          } else {
            checkAndNotifyMissingFields(localReceipts.value[index]);
          }
        }
      } catch (e) {
        console.error(e);
        addToast({ message: `Failed to upload ${file.name}`, type: "error" });
        const existing = localReceipts.value.find((r) => r.id === tempId);
        cleanupReceiptResources(existing);
        localReceipts.value = localReceipts.value.filter(
          (r) => r.id !== tempId,
        );
      }
    }
  }

  function continueAnyway() {
    clearQualityRejection();
  }

  const submitWithForce = continueAnyway;

  async function submitSegments(files) {
    if (!files || files.length < 2) return;

    const tempId = `temp-seg-${Date.now()}`;
    const firstFile = files[0];
    const segmentImages = files.map((file, idx) => ({
      id: `seg-${tempId}-${idx}`,
      url: URL.createObjectURL(file),
      name: file.name,
      file,
      fileType: file.type,
    }));
    const receiptObj = buildPrefilledReceiptDraft({
      id: tempId,
      file: firstFile,
      thumbnail: segmentImages[0]?.url || URL.createObjectURL(firstFile),
    });
    receiptObj.isUploading = true;
    receiptObj.isMultiReceipt = true;
    receiptObj.images = segmentImages;
    localReceipts.value.push(receiptObj);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files[]", file);
      });
      if (isDraftMode) formData.append("is_draft", "1");

      const headers = { Accept: "application/json" };
      if (authStore.token)
        headers["Authorization"] = `Bearer ${authStore.token}`;

      const res = await fetch("/api/serms/reimbursements/receipts/segmented", {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.status === 422) {
        const errorData = await res.json();
        const index = localReceipts.value.findIndex((r) => r.id === tempId);
        handleReceiptRejectionOrFailure({
          index,
          tempId,
          file: firstFile,
          payload: errorData,
          isHttp422: true,
          isMultiSegment: true,
          segmentImages,
          defaultQualityReason: "One or more segments are too low quality.",
          toastPrefix: "Segmented receipt rejected",
        });
        return;
      }

      if (!res.ok) throw new Error("Segmented upload failed");
      const data = await res.json();

      const index = localReceipts.value.findIndex((r) => r.id === tempId);

      if (data.data?.status === "rejected" || data.data?.status === "failed") {
        handleReceiptRejectionOrFailure({
          index,
          tempId,
          file: firstFile,
          payload: data.data,
          isMultiSegment: true,
          segmentImages,
          defaultQualityReason:
            "One or more segments are too low quality for accurate OCR data extraction.",
          toastPrefix: "Segmented receipt rejected",
        });
        return;
      }

      if (index !== -1) {
        localReceipts.value[index] = {
          ...buildPrefilledReceiptDraft({
            id: data.data.id,
            file: firstFile,
            receiptData: data.data,
            thumbnail: localReceipts.value[index].thumbnail,
          }),
          isUploading: false,
          isProcessing: data.data.status === "processing",
          isMultiReceipt: true,
          images: segmentImages,
        };
        if (data.data.status === "processing") {
          startPolling(data.data.id);
        } else {
          checkAndNotifyMissingFields(localReceipts.value[index]);
        }
      }
    } catch (e) {
      console.error(e);
      addToast({
        message: "Failed to upload segmented receipt",
        type: "error",
      });
      const existing = localReceipts.value.find((r) => r.id === tempId);
      cleanupReceiptResources(existing);
      localReceipts.value = localReceipts.value.filter((r) => r.id !== tempId);
    }
  }

  async function removeReceipt(receipt) {
    const targetId = receipt?.id;
    const existing = targetId
      ? localReceipts.value.find((r) => String(r.id) === String(targetId))
      : null;
    cleanupReceiptResources(existing || receipt);
    if (!targetId || !existing) return;

    localReceipts.value = localReceipts.value.filter(
      (r) => String(r.id) !== String(targetId),
    );

    // If this receipt has a persisted backend ID and was uploaded as a draft, delete it from storage, pgvector and DB
    if (!String(targetId).startsWith("temp-") && !existing.isForwarded) {
      await deleteDraftFromBackend(targetId);
    }
  }

  async function abortSessionReceipts() {
    const receiptsToDelete = localReceipts.value.filter(
      (r) => r.id && !String(r.id).startsWith("temp-") && !r.isForwarded,
    );
    clearDraftReceipts();
    if (receiptsToDelete.length === 0) return;

    await Promise.allSettled(
      receiptsToDelete.map((r) => deleteDraftFromBackend(r.id)),
    );
  }

  return {
    localReceipts,
    receiptDrag,
    receiptInput,
    handleReceiptDrop,
    handleReceiptSelect,
    addReceiptFiles,
    removeReceipt,
    purgeRejectedReceipt,
    clearDraftReceipts,
    abortSessionReceipts,
    qualityRejection,
    clearQualityRejection,
    showSegmentedUpload,
    continueAnyway,
    submitWithForce,
    submitSegments,
  };
}
