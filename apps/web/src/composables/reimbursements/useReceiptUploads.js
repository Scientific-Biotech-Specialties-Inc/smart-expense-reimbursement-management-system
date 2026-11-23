import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import {
  buildPrefilledReceiptDraft,
  formatSplitReceiptsToastMessage,
  hasSplitReceipts,
  isDuplicateOcrResponse,
  markOcrReturnedAndGetMissingWarning,
  resolveSplitSegmentIndices,
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

  function isBlobUrlInUseElsewhere(url, targetReceipt) {
    if (!url) return false;
    return localReceipts.value.some((other) => {
      if (other === targetReceipt) return false;
      if (targetReceipt?.id != null && String(other.id) === String(targetReceipt.id)) {
        return false;
      }
      if (other.thumbnail === url) return true;
      return (
        Array.isArray(other.images) &&
        other.images.some((img) => (typeof img === "string" ? img : img?.url) === url)
      );
    });
  }

  function cleanupReceiptResources(receipt) {
    if (!receipt) return;
    if (
      receipt.thumbnail?.startsWith("blob:") &&
      typeof URL.revokeObjectURL === "function" &&
      !isBlobUrlInUseElsewhere(receipt.thumbnail, receipt)
    ) {
      URL.revokeObjectURL(receipt.thumbnail);
    }
    if (Array.isArray(receipt.images)) {
      receipt.images.forEach((img) => {
        const u = typeof img === "string" ? img : img?.url;
        if (
          u?.startsWith("blob:") &&
          typeof URL.revokeObjectURL === "function" &&
          !isBlobUrlInUseElsewhere(u, receipt)
        ) {
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

  /**
   * Delete backend draft receipts created by an in-flight upload or split
   * that resolved after the user already removed/aborted the draft locally.
   */
  async function deleteOrphanedUploadPayloads(payload) {
    if (!payload) return;
    const ids = [payload.id];
    if (Array.isArray(payload.split_receipts)) {
      for (const child of payload.split_receipts) {
        if (child?.id) ids.push(child.id);
      }
    }
    const uniqueIds = [
      ...new Set(ids.filter((id) => id && !String(id).startsWith("temp-"))),
    ];
    if (uniqueIds.length === 0) return;
    await Promise.allSettled(uniqueIds.map((id) => deleteDraftFromBackend(id)));
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
    return isDuplicateOcrResponse(data);
  }

  function buildSplitReceiptCard(payload, groupImages, currentItem) {
    const firstImg = groupImages[0];
    const firstImgUrl = typeof firstImg === "string" ? firstImg : firstImg?.url;
    const fallbackUrl = Array.isArray(payload?.file_url)
      ? payload.file_url[0]
      : payload?.file_url;
    const sourceFile =
      (firstImg && typeof firstImg === "object" ? firstImg.file : null) ||
      currentItem?.sourceFile ||
      null;
    const thumbnail = firstImgUrl || fallbackUrl || currentItem?.thumbnail || "";

    const card = buildPrefilledReceiptDraft({
      id: payload?.id,
      file: sourceFile,
      receiptData: payload,
      thumbnail,
    });
    card.isUploading = false;
    card.isProcessing = false;
    card.sourceFile = sourceFile;
    card.thumbnail = thumbnail;
    if (groupImages.length > 1) {
      card.isMultiReceipt = true;
      card.images = groupImages;
    } else {
      card.isMultiReceipt = false;
    }
    return card;
  }

  function applySplitReceiptPayloads(index, data) {
    if (index === -1) {
      deleteOrphanedUploadPayloads(data);
      return;
    }

    const allPayloads = [data, ...data.split_receipts];
    addToast({
      message: formatSplitReceiptsToastMessage(allPayloads.length),
      type: "info",
    });

    const currentItem = index !== -1 ? localReceipts.value[index] : null;
    const sourceImages = Array.isArray(currentItem?.images)
      ? currentItem.images
      : [];
    const segmentIndexGroups = resolveSplitSegmentIndices(
      allPayloads,
      sourceImages.length,
    );

    const builtCards = allPayloads.map((payload, groupIdx) => {
      const indices = segmentIndexGroups[groupIdx] || [];
      let groupImages = indices
        .map((imgIdx) => sourceImages[imgIdx])
        .filter(Boolean);
      if (
        groupImages.length === 0 &&
        sourceImages.length === 0 &&
        Array.isArray(payload?.file_url) &&
        payload.file_url.length > 0
      ) {
        groupImages = payload.file_url;
      }
      return buildSplitReceiptCard(payload, groupImages, currentItem);
    });

    if (index !== -1) {
      localReceipts.value.splice(index, 1, ...builtCards);
    }

    allPayloads.forEach((payload, groupIdx) => {
      const targetCard = builtCards[groupIdx];
      // Re-resolve current index by card reference/id because earlier purged rejections shift array indices.
      const cardIdx = localReceipts.value.findIndex(
        (r) =>
          r === targetCard ||
          (payload?.id != null && String(r.id) === String(payload.id)),
      );
      const pStatus = String(payload?.status || "").toLowerCase();
      if (pStatus === "rejected" || pStatus === "failed") {
        handleReceiptRejectionOrFailure({
          index: cardIdx,
          receiptId: payload?.id ?? targetCard.id,
          file: targetCard.sourceFile || null,
          payload,
          isMultiSegment: Boolean(targetCard.isMultiReceipt),
          segmentImages: targetCard.isMultiReceipt ? targetCard.images : null,
        });
      } else if (cardIdx !== -1) {
        checkAndNotifyMissingFields(localReceipts.value[cardIdx]);
      }
    });
  }

  function startPolling(receiptId) {
    if (pollTimers[receiptId]) return;
    const timer = setInterval(async () => {
      try {
        const headers = { Accept: "application/json" };
        if (authStore.token)
          headers["Authorization"] = `Bearer ${authStore.token}`;

        const res = await fetch(
          `/api/serms/reimbursements/receipts/${receiptId}`,
          { headers },
        );
        if (!res.ok || pollTimers[receiptId] !== timer) return;

        const { data } = await res.json();
        if (pollTimers[receiptId] !== timer) return;

        if (data.status !== "processing") {
          clearInterval(pollTimers[receiptId]);
          delete pollTimers[receiptId];

          const index = localReceipts.value.findIndex(
            (r) => String(r.id) === String(receiptId),
          );

          if (hasSplitReceipts(data)) {
            applySplitReceiptPayloads(index, data);
            return;
          }

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
    pollTimers[receiptId] = timer;
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
        } else {
          await deleteOrphanedUploadPayloads(data.data);
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
    const fileArray = Array.from(files || []);
    if (fileArray.length === 0) return;
    if (fileArray.length === 1) {
      return addReceiptFiles(fileArray);
    }

    const selectedFiles = fileArray.slice(0, 6);
    const tempId = `temp-seg-${Date.now()}`;
    const firstFile = selectedFiles[0];
    const segmentImages = selectedFiles.map((file, idx) => ({
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
      selectedFiles.forEach((file) => {
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

      if (hasSplitReceipts(data.data)) {
        applySplitReceiptPayloads(index, data.data);
        return;
      }

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
      } else {
        await deleteOrphanedUploadPayloads(data.data);
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
