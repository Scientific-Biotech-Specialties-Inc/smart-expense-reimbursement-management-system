import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/composables/useToast";
import {
  buildPrefilledReceiptDraft,
  getMissingReceiptFields,
} from "@/utils/receiptUtils";
import { useOcrMode } from "@/composables/useOcrMode";
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
    if (!receipt) return;
    receipt.hasOcrReturned = true;
    const missing = getMissingReceiptFields(receipt);
    if (missing.length > 0) {
      const fieldNames = missing.map((f) => f.label).join(", ");
      addToast({
        message: `Missing required field(s): ${fieldNames}`,
        type: "warning",
      });
    }
  }

  const pollTimers = {};

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

             // A `failed` receipt means the OCR pipeline errored (AI service
             // unreachable / dispatch failed), NOT a quality rejection. Surface a
             // clear error and leave Retry OCR available instead of opening the
             // quality-rejection modal.
             if (data.status === "failed") {
               if (index !== -1) {
                 localReceipts.value[index] = {
                   ...localReceipts.value[index],
                   isUploading: false,
                   isProcessing: false,
                   isRejected: true,
                   rejectionCode: data.rejection_code || "ocr_failed",
                   rejectionReason:
                     data.rejection_reason ||
                     "OCR processing failed. You can retry OCR.",
                 };
               }
               addToast({
                 message:
                   data.rejection_reason ||
                   "OCR processing failed. You can retry OCR.",
                 type: "error",
               });
               return;
             }

             if (checkIsDuplicateResponse(data)) {
                if (index !== -1) {
                  localReceipts.value[index].isUploading = false;
                  localReceipts.value[index].isProcessing = false;
                  localReceipts.value[index].isRejected = true;
                  localReceipts.value[index].rejectionCode = "duplicate";
                }
                window.dispatchEvent(new CustomEvent('receipt-duplicate-detected', { 
                  detail: { 
                    similarityScore: data.duplicate_similarity || 1.0,
                    receiptId: data.id,
                    message: data.rejection_reason || data.error || "Duplicate receipt detected."
                  } 
                }));
                return;
            }

            // Defensive: a `rejected` payload carrying an OCR-infra code/reason
            // (e.g. `ocr_failed` / "OCR could not be started") is an offline
            // failure, NOT a quality rejection — toast only, no modal.
            if (
              isOcrOfflineFailure({
                status: data.status,
                rejectionCode: data.rejection_code,
                rejectionReason: data.rejection_reason || data.error,
              })
            ) {
              if (index !== -1) {
                localReceipts.value[index] = {
                  ...localReceipts.value[index],
                  isUploading: false,
                  isProcessing: false,
                  isRejected: true,
                  rejectionCode: data.rejection_code || "ocr_failed",
                  rejectionReason:
                    data.rejection_reason ||
                    data.error ||
                    "OCR processing failed. You can retry OCR.",
                };
              }
              addToast({
                message:
                  data.rejection_reason ||
                  data.error ||
                  "OCR processing failed. You can retry OCR.",
                type: "error",
              });
              return;
            }

            if (index !== -1) {
              localReceipts.value[index] = {
                ...localReceipts.value[index],
                isUploading: false,
                isProcessing: false,
                isRejected: true,
                rejectionCode: data.rejection_code || "blurry",
                rejectionReason:
                  data.rejection_reason ||
                  data.error ||
                  "Receipt image quality is too low for accurate OCR data extraction.",
              };
            }
            qualityRejection.value = {
              receiptId: data.id,
              file: fileObj,
              rejectionCode: data.rejection_code || "blurry",
              rejectionReason:
                data.rejection_reason ||
                data.error ||
                "Receipt image quality is too low for accurate OCR data extraction.",
            };
            addToast({
              message: `Receipt rejected: ${data.rejection_reason || data.error || "Image quality issue"}`,
              type: "error",
            });
            return;
          }

          if (index !== -1) {
            const oldThumbnail = localReceipts.value[index].thumbnail;
            const updatedReceipt = buildPrefilledReceiptDraft({
              id: data.id,
              receiptData: data,
              thumbnail: oldThumbnail,
            });
            updatedReceipt.isUploading = false;
            updatedReceipt.isProcessing = false;
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

  async function addReceiptFiles(fileList, forceProcess = false) {
    const allowedMimeTypes = ["image/jpeg", "image/png", "application/pdf"];
    const files = Array.from(fileList || []);

    let isMockMode = false;
    try {
      isMockMode = Boolean(useOcrMode()?.isMockOcr?.value);
    } catch {
      isMockMode = false;
    }

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
        if (forceProcess) {
          formData.append("force_process", "1");
        }
        // Fast mock path — real file upload, instant mock data, skip OCR wait.
        if (isMockMode) {
          formData.append("is_mock", "1");
        }

        const headers = { Accept: "application/json" };
        if (authStore.token)
          headers["Authorization"] = `Bearer ${authStore.token}`;
        if (isMockMode) headers["X-Mock-OCR"] = "1";

        const res = await fetch("/api/serms/reimbursements/receipts", {
          method: "POST",
          headers,
          body: formData,
        });

        if (res.status === 422) {
          const errorData = await res.json();
          const index = localReceipts.value.findIndex((r) => r.id === tempId);
          if (index !== -1) {
            localReceipts.value[index].isUploading = false;
            localReceipts.value[index].isProcessing = false;
            localReceipts.value[index].isRejected = true;
          }
          
          if (checkIsDuplicateResponse(errorData)) {
             if (index !== -1) {
               localReceipts.value[index].rejectionCode = "duplicate";
             }
             const msg = errorData.rejection_reason || errorData.message || (errorData.errors?.file_hash ? errorData.errors.file_hash[0] : null) || "Duplicate receipt detected.";
             window.dispatchEvent(new CustomEvent('receipt-duplicate-detected', {
               detail: {
                 similarityScore: errorData.duplicate_similarity || 1.0,
                 receiptId: tempId,
                 message: msg
               }
             }));
             return;
          }
          // OCR offline / could-not-start must NOT open the quality modal.
          // Toast is enough (caller stays on the reimbursement page).
          if (
            isOcrOfflineFailure({
              rejectionCode: errorData.rejection_code,
              rejectionReason:
                errorData.rejection_reason || errorData.message || errorData.error,
            })
          ) {
            if (index !== -1) {
              localReceipts.value[index].rejectionCode =
                errorData.rejection_code || "ocr_failed";
              localReceipts.value[index].rejectionReason =
                errorData.rejection_reason ||
                errorData.message ||
                "OCR processing failed. You can retry OCR.";
            }
            addToast({
              message:
                errorData.rejection_reason ||
                errorData.message ||
                "OCR processing failed. You can retry OCR.",
              type: "error",
            });
            return;
          }
          qualityRejection.value = {
            receiptId: tempId,
            file,
            rejectionCode: errorData.rejection_code || "blurry",
            rejectionReason:
              errorData.rejection_reason ||
              "Receipt image quality is too low for OCR processing.",
          };
          addToast({
            message: `Receipt rejected: ${errorData.rejection_reason || "Image quality issue"}`,
            type: "error",
          });
          return;
        }

        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();

        const index = localReceipts.value.findIndex((r) => r.id === tempId);

        if (data.data?.status === "rejected" || data.data?.status === "failed") {
          if (checkIsDuplicateResponse(data.data)) {
             if (index !== -1) {
               localReceipts.value[index].isUploading = false;
               localReceipts.value[index].isProcessing = false;
               localReceipts.value[index].isRejected = true;
               localReceipts.value[index].rejectionCode = "duplicate";
             }
             window.dispatchEvent(new CustomEvent('receipt-duplicate-detected', {
               detail: {
                 similarityScore: data.data.duplicate_similarity || 1.0,
                 receiptId: data.data.id || tempId,
                 message: data.data.rejection_reason || data.data.error || "Duplicate receipt detected."
               }
             }));
             return;
          }
          // OCR offline / could-not-start must NOT open the quality modal.
          // Toast is enough — user stays on the reimbursement page with
          // Retry OCR available on the receipt row.
          if (
            isOcrOfflineFailure({
              status: data.data?.status,
              rejectionCode: data.data?.rejection_code,
              rejectionReason:
                data.data?.rejection_reason || data.data?.error,
            })
          ) {
            if (index !== -1) {
              localReceipts.value[index] = {
                ...buildPrefilledReceiptDraft({
                  id: data.data.id,
                  file,
                  receiptData: data.data,
                  thumbnail: localReceipts.value[index].thumbnail,
                }),
                isUploading: false,
                isProcessing: false,
                isRejected: true,
                rejectionCode: data.data.rejection_code || "ocr_failed",
                rejectionReason:
                  data.data.rejection_reason ||
                  data.data.error ||
                  "OCR processing failed. You can retry OCR.",
              };
            }
            addToast({
              message:
                data.data.rejection_reason ||
                data.data.error ||
                "OCR processing failed. You can retry OCR.",
              type: "error",
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
              isProcessing: false,
              isRejected: true,
              rejectionCode: data.data.rejection_code || "blurry",
              rejectionReason:
                data.data.rejection_reason ||
                "Receipt image quality is too low for accurate OCR data extraction.",
            };
          }
          qualityRejection.value = {
            receiptId: data.data.id,
            file,
            rejectionCode: data.data.rejection_code || "blurry",
            rejectionReason:
              data.data.rejection_reason ||
              "Receipt image quality is too low for accurate OCR data extraction.",
          };
          addToast({
            message: `Receipt rejected: ${data.data.rejection_reason || "Image quality issue"}`,
            type: "error",
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
        localReceipts.value = localReceipts.value.filter(
          (r) => r.id !== tempId,
        );
      }
    }
  }

  function continueAnyway() {
    const targetId = qualityRejection.value?.receiptId;
    const rejectionCode = qualityRejection.value?.rejectionCode;

    if (targetId) {
      const target = localReceipts.value.find((r) => r.id === targetId);
      if (target) {
        target.isRejected = false;
        target.isQualityOverridden = true;
        target.hasOcrReturned = true;
      }
    }

    clearQualityRejection();

    if (rejectionCode === "not_a_receipt") {
      addToast({
        message:
          "Warning overridden. Please enter the receipt details manually.",
        type: "info",
      });
    } else {
      addToast({
        message:
          "Quality warning overridden. Please fill in the receipt details manually.",
        type: "info",
      });
    }
  }

  const submitWithForce = continueAnyway;

  async function submitSegments(files) {
    if (!files || files.length < 2) return;

    let isMockMode = false;
    try {
      isMockMode = Boolean(useOcrMode()?.isMockOcr?.value);
    } catch {
      isMockMode = false;
    }

    const tempId = `temp-seg-${Date.now()}`;
    const firstFile = files[0];
    const receiptObj = buildPrefilledReceiptDraft({
      id: tempId,
      file: firstFile,
      thumbnail: URL.createObjectURL(firstFile),
    });
    receiptObj.isUploading = true;
    localReceipts.value.push(receiptObj);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files[]", file);
      });
      if (isDraftMode) formData.append("is_draft", "1");
      if (isMockMode) formData.append("is_mock", "1");

      const headers = { Accept: "application/json" };
      if (authStore.token)
        headers["Authorization"] = `Bearer ${authStore.token}`;
      if (isMockMode) headers["X-Mock-OCR"] = "1";

      const res = await fetch("/api/serms/reimbursements/receipts/segmented", {
        method: "POST",
        headers,
        body: formData,
      });

      if (res.status === 422) {
        const errorData = await res.json();
        const index = localReceipts.value.findIndex((r) => r.id === tempId);
        if (index !== -1) {
          localReceipts.value[index].isUploading = false;
          localReceipts.value[index].isProcessing = false;
          localReceipts.value[index].isRejected = true;
        }
        
        if (checkIsDuplicateResponse(errorData)) {
           if (index !== -1) {
             localReceipts.value[index].rejectionCode = "duplicate";
           }
           const msg = errorData.rejection_reason || errorData.message || (errorData.errors?.file_hash ? errorData.errors.file_hash[0] : null) || "Duplicate receipt detected.";
           window.dispatchEvent(new CustomEvent('receipt-duplicate-detected', {
             detail: {
               similarityScore: errorData.duplicate_similarity || 1.0,
               receiptId: tempId,
               message: msg
             }
           }));
           return;
        }
        // OCR offline / could-not-start must NOT open the quality modal.
        if (
          isOcrOfflineFailure({
            rejectionCode: errorData.rejection_code,
            rejectionReason:
              errorData.rejection_reason || errorData.message || errorData.error,
          })
        ) {
          if (index !== -1) {
            localReceipts.value[index].rejectionCode =
              errorData.rejection_code || "ocr_failed";
            localReceipts.value[index].rejectionReason =
              errorData.rejection_reason ||
              errorData.message ||
              "OCR processing failed. You can retry OCR.";
          }
          addToast({
            message:
              errorData.rejection_reason ||
              errorData.message ||
              "OCR processing failed. You can retry OCR.",
            type: "error",
          });
          return;
        }
        qualityRejection.value = {
          receiptId: tempId,
          file: firstFile,
          rejectionCode: errorData.rejection_code || "blurry",
          rejectionReason:
            errorData.rejection_reason ||
            "One or more segments are too low quality.",
        };
        addToast({
          message: `Segmented receipt rejected: ${errorData.rejection_reason || "Quality issue"}`,
          type: "error",
        });
        return;
      }

      if (!res.ok) throw new Error("Segmented upload failed");
      const data = await res.json();

      const index = localReceipts.value.findIndex((r) => r.id === tempId);

      if (data.data?.status === "rejected" || data.data?.status === "failed") {
        if (checkIsDuplicateResponse(data.data)) {
           if (index !== -1) {
             localReceipts.value[index].isUploading = false;
             localReceipts.value[index].isProcessing = false;
             localReceipts.value[index].isRejected = true;
             localReceipts.value[index].rejectionCode = "duplicate";
           }
           window.dispatchEvent(new CustomEvent('receipt-duplicate-detected', {
             detail: {
               similarityScore: data.data.duplicate_similarity || 1.0,
               receiptId: data.data.id || tempId,
               message: data.data.rejection_reason || data.data.error || "Duplicate receipt detected."
             }
           }));
           return;
        }
        // OCR offline / could-not-start must NOT open the quality modal.
        if (
          isOcrOfflineFailure({
            status: data.data?.status,
            rejectionCode: data.data?.rejection_code,
            rejectionReason:
              data.data?.rejection_reason || data.data?.error,
          })
        ) {
          if (index !== -1) {
            localReceipts.value[index] = {
              ...buildPrefilledReceiptDraft({
                id: data.data.id,
                file: firstFile,
                receiptData: data.data,
                thumbnail: localReceipts.value[index].thumbnail,
              }),
              isUploading: false,
              isProcessing: false,
              isRejected: true,
              rejectionCode: data.data.rejection_code || "ocr_failed",
              rejectionReason:
                data.data.rejection_reason ||
                data.data.error ||
                "OCR processing failed. You can retry OCR.",
            };
          }
          addToast({
            message:
              data.data.rejection_reason ||
              data.data.error ||
              "OCR processing failed. You can retry OCR.",
            type: "error",
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
            isProcessing: false,
            isRejected: true,
            rejectionCode: data.data.rejection_code || "blurry",
            rejectionReason:
              data.data.rejection_reason ||
              "One or more segments are too low quality for accurate OCR data extraction.",
          };
        }
        qualityRejection.value = {
          receiptId: data.data.id,
          file: firstFile,
          rejectionCode: data.data.rejection_code || "blurry",
          rejectionReason:
            data.data.rejection_reason ||
            "One or more segments are too low quality for accurate OCR data extraction.",
        };
        addToast({
          message: `Segmented receipt rejected: ${data.data.rejection_reason || "Quality issue"}`,
          type: "error",
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
      localReceipts.value = localReceipts.value.filter((r) => r.id !== tempId);
    }
  }

  async function removeReceipt(receipt) {
    if (receipt.thumbnail?.startsWith("blob:")) {
      URL.revokeObjectURL(receipt.thumbnail);
    }
    if (receipt.id && pollTimers[receipt.id]) {
      clearInterval(pollTimers[receipt.id]);
      delete pollTimers[receipt.id];
    }
    localReceipts.value = localReceipts.value.filter(
      (r) => r.id !== receipt.id,
    );

    // If this receipt has a persisted backend ID and was uploaded as a draft, delete it from storage, pgvector and DB
    if (receipt.id && !String(receipt.id).startsWith("temp-") && !receipt.isForwarded) {
      try {
        const headers = { Accept: "application/json" };
        if (authStore.token) headers["Authorization"] = `Bearer ${authStore.token}`;
        await fetch(`/api/serms/reimbursements/receipts/${receipt.id}`, {
          method: "DELETE",
          headers,
        });
      } catch (err) {
        console.error("Failed to delete canceled receipt draft:", err);
      }
    }
  }

  async function abortSessionReceipts() {
    const receiptsToDelete = localReceipts.value.filter(
      (r) => r.id && !String(r.id).startsWith("temp-") && !r.isForwarded,
    );
    clearDraftReceipts();
    if (receiptsToDelete.length === 0) return;

    await Promise.allSettled(
      receiptsToDelete.map(async (r) => {
        try {
          const headers = { Accept: "application/json" };
          if (authStore.token) headers["Authorization"] = `Bearer ${authStore.token}`;
          await fetch(`/api/serms/reimbursements/receipts/${r.id}`, {
            method: "DELETE",
            headers,
          });
        } catch (err) {
          console.error(`Failed to delete receipt draft ${r.id}:`, err);
        }
      }),
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
