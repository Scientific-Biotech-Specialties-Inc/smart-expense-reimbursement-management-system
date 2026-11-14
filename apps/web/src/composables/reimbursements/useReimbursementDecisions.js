import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";

export function useReimbursementDecisions(store, addToast, viewingRecord) {
  const auth = useAuthStore();
  const approvingId = ref(null);
  const rejectingId = ref(null);
  const grantingId = ref(null);
  const rejectionComment = ref("");
  const confirmPassword = ref("");
  const isReviewSubmitting = ref(false);

  function isOwnSubmission() {
    const currentUserId = auth.user?.id;
    const ownerId =
      viewingRecord.value?.user?.id ??
      viewingRecord.value?.user_id ??
      viewingRecord.value?.userId ??
      viewingRecord.value?.submitted_by;

    return (
      currentUserId !== null &&
      currentUserId !== undefined &&
      ownerId !== null &&
      ownerId !== undefined &&
      String(currentUserId) === String(ownerId)
    );
  }

  function openApproveModal(id) {
    if (isOwnSubmission()) {
      addToast({
        message: "You cannot process your own request.",
        type: "error",
      });
      return;
    }

    approvingId.value = id;
    confirmPassword.value = "";
  }

  function cancelApprove() {
    approvingId.value = null;
    confirmPassword.value = "";
  }

  async function confirmApprove() {
    if (!approvingId.value || isReviewSubmitting.value) return;
    if (!confirmPassword.value?.trim()) {
      addToast({
        message: "Password is required to approve this request.",
        type: "error",
      });
      return;
    }

    isReviewSubmitting.value = true;
    try {
      const updated = await store.approve(
        approvingId.value,
        confirmPassword.value,
      );
      if (viewingRecord.value?.id === approvingId.value) {
        viewingRecord.value = updated;
      }
      addToast({ message: "Reimbursement approved!", type: "success" });
      cancelApprove();
    } catch (e) {
      addToast({
        message: e.message || "Error approving reimbursement",
        type: "error",
      });
    } finally {
      isReviewSubmitting.value = false;
    }
  }

  const revisionAction = ref("revise"); // 'revise' | 'reject'

  function openRejectModal(id, action = "revise") {
    if (isOwnSubmission()) {
      addToast({
        message: "You cannot process your own request.",
        type: "error",
      });
      return;
    }

    revisionAction.value = action;
    rejectingId.value = id;
    rejectionComment.value = "";
    confirmPassword.value = "";
  }

  function cancelReject() {
    rejectingId.value = null;
    rejectionComment.value = "";
    confirmPassword.value = "";
    revisionAction.value = "revise";
  }

  async function confirmReject() {
    if (!rejectingId.value || isReviewSubmitting.value) return;
    if (!confirmPassword.value?.trim()) {
      addToast({
        message: `Password is required to ${revisionAction.value} this request.`,
        type: "error",
      });
      return;
    }
    if (rejectionComment.value.length < 10) {
      addToast({
        message: `${revisionAction.value === "revise" ? "Revision" : "Rejection"} comment must be at least 10 characters.`,
        type: "error",
      });
      return;
    }

    if (rejectionComment.value.length > 255) {
      addToast({
        message: `${revisionAction.value === "revise" ? "Revision" : "Rejection"} comment cannot exceed 255 characters.`,
        type: "error",
      });
      return;
    }

    isReviewSubmitting.value = true;
    try {
      const updated = await store.reject(
        rejectingId.value,
        rejectionComment.value,
        confirmPassword.value,
        revisionAction.value,
      );
      if (viewingRecord.value?.id === rejectingId.value) {
        viewingRecord.value = updated;
      }
      const isRejected = updated?.status === "rejected";
      addToast({
        message: isRejected
          ? "Reimbursement rejected (exceeded revision limit)."
          : revisionAction.value === "revise"
            ? "Reimbursement returned for revision."
            : "Reimbursement rejected.",
        type: "success",
      });
      cancelReject();
    } catch (e) {
      addToast({
        message: e.message || "Error processing reimbursement",
        type: "error",
      });
    } finally {
      isReviewSubmitting.value = false;
    }
  }

  function openGrantModal(id) {
    if (isOwnSubmission()) {
      addToast({
        message: "You cannot process your own request.",
        type: "error",
      });
      return;
    }

    grantingId.value = id;
    confirmPassword.value = "";
  }

  function cancelGrant() {
    grantingId.value = null;
    confirmPassword.value = "";
  }

  async function confirmGrant(payoutPayload) {
    if (!grantingId.value || isReviewSubmitting.value) return;

    isReviewSubmitting.value = true;
    try {
      const payload = payoutPayload || confirmPassword.value;
      const updated = await store.grant(grantingId.value, payload);
      if (viewingRecord.value?.id === grantingId.value) {
        viewingRecord.value = updated;
      }
      addToast({ message: "Reimbursement granted!", type: "success" });
      cancelGrant();
    } catch (e) {
      addToast({
        message: e.message || "Error granting reimbursement",
        type: "error",
      });
    } finally {
      isReviewSubmitting.value = false;
    }
  }

  return {
    approvingId,
    rejectingId,
    grantingId,
    revisionAction,
    rejectionComment,
    confirmPassword,
    isReviewSubmitting,
    openApproveModal,
    cancelApprove,
    confirmApprove,
    openRejectModal,
    cancelReject,
    confirmReject,
    openGrantModal,
    cancelGrant,
    confirmGrant,
  };
}
