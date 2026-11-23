import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { apiFetch } from "../utils/apiFetch";
import { withEncryptedPassword } from "../utils/crypto";
export const useCashAdvanceStore = defineStore("cashAdvance", () => {
  const items = ref([]);
  const isLoading = ref(false);

  const totalOutstanding = computed(() =>
    items.value.reduce((s, i) => {
      if (["rejected", "liquidated", "settled"].includes(i.status)) return s;
      const bal =
        i.outstanding_balance !== null && i.outstanding_balance !== undefined
          ? Number(i.outstanding_balance)
          : Number(i.balance ?? i.amount ?? 0);
      return s + (isNaN(bal) ? 0 : Math.max(0, bal));
    }, 0),
  );

  function normalizeAdvance(item = {}) {
    const document = item.document || null;
    const payout = item.payout || null;
    const disbursement = item.disbursement || null;
    const approvalActions = Array.isArray(item.approval_actions)
      ? item.approval_actions
      : Array.isArray(item.approvalActions)
        ? item.approvalActions
        : [];
    const approvedActions = approvalActions.filter(
      (action) => String(action?.action || "").toLowerCase() === "approved",
    );
    const latestApproved = approvedActions.reduce((latest, current) => {
      if (!latest) return current;
      const currentTime = new Date(
        current?.actioned_at || current?.created_at || 0,
      ).getTime();
      const latestTime = new Date(
        latest?.actioned_at || latest?.created_at || 0,
      ).getTime();
      if (!Number.isNaN(currentTime) && !Number.isNaN(latestTime)) {
        return currentTime >= latestTime ? current : latest;
      }
      return current;
    }, null);

    return {
      ...item,
      document,
      payout,
      disbursement,
      // Map backend fields to frontend expected fields
      userId: item.user_id ?? item.userId,
      requestedBy: item.requester?.name || item.requestedBy || "Unknown",
      dueDate: item.expected_liquidation_date ?? item.dueDate,
      date: item.submitted_at || item.date || item.created_at,
      approved_by:
        item.approved_by ||
        item.approvedBy ||
        payout?.approved_by ||
        latestApproved?.approver?.name ||
        null,
      approved_at:
        item.approved_at ||
        item.approvedAt ||
        payout?.approved_at ||
        latestApproved?.actioned_at ||
        latestApproved?.created_at ||
        null,
      granterSignature:
        payout?.granter_signature ||
        disbursement?.granter_signature ||
        item.granterSignature ||
        null,
      payoutMethod:
        payout?.payout_method ||
        disbursement?.payout_method ||
        disbursement?.channel ||
        item.payoutMethod ||
        null,
      // outstanding_balance is DB-authoritative. Fall back to full amount for
      // advances not yet disbursed where balance is still null.
      balance: item.outstanding_balance !== null && item.outstanding_balance !== undefined
        ? Number(item.outstanding_balance)
        : Number(item.balance ?? item.amount ?? 0),
      adminNotes:
        item.adminNotes ??
        (item.approval_actions && item.approval_actions.length
          ? item.approval_actions[item.approval_actions.length - 1].comment
          : null),
      acknowledgedAt:
        item.acknowledged_at ??
        payout?.acknowledged_at ??
        item.acknowledgedAt ??
        null,
      signatureImage:
        item.signature ??
        payout?.employee_signature ??
        item.signatureImage ??
        null,
      documentUrl: document?.file_url || item.documentUrl || null,
      documentFileName: document?.file_name || item.documentFileName || null,
    };
  }

  function upsertAdvance(item) {
    const existingIndex = items.value.findIndex((i) => i.id == item.id);
    const merged = normalizeAdvance(
      existingIndex === -1 ? item : { ...items.value[existingIndex], ...item },
    );

    if (existingIndex === -1) {
      items.value.unshift(merged);
    } else {
      items.value[existingIndex] = merged;
    }

    return merged;
  }

  async function fetchAll() {
    isLoading.value = true;
    try {
      const response = await apiFetch("/api/serms/cash-advances", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        items.value = data.map(normalizeAdvance);
      }
    } catch (err) {
      console.error("Failed to fetch cash advances", err);
    } finally {
      isLoading.value = false;
    }
  }

  async function request(formData) {
    try {
      const response = await apiFetch("/api/serms/cash-advances", {
        method: "POST",
        credentials: "include",
        body: formData, // Send as FormData to handle files
      });
      if (response.ok) {
        const result = await response.json();
        return upsertAdvance(result.data);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create cash advance");
      }
    } catch (err) {
      console.error("Failed to create cash advance", err);
      throw err;
    }
  }

  async function approveRequest(id, comment, password) {
    try {
      const body = await withEncryptedPassword(password, { comment });
      const response = await apiFetch(`/api/serms/cash-advances/${id}/approve`, {
        method: "POST",
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (response.ok) {
        const result = await response.json();
        return upsertAdvance(result.data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errMsg =
          errorData.errors?.password?.[0] ||
          errorData.message ||
          "Failed to approve cash advance";
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error("Failed to approve cash advance", err);
      throw err;
    }
  }

  async function rejectRequest(id, comment, action = "revise", password) {
    // Backwards-compatible overload handling:
    // - New preferred: rejectRequest(id, comment, action, password)
    // - Legacy 3-arg where 3rd was password (reimbursement style): if action is not 'revise'/'reject' treat as password
    let effectiveAction = action;
    let effectivePassword = password;
    if (
      effectivePassword === undefined &&
      typeof effectiveAction === "string" &&
      effectiveAction !== "revise" &&
      effectiveAction !== "reject"
    ) {
      // Caller used (id, comment, password) or (id, comment, password, action) swapped — normalize
      effectivePassword = effectiveAction;
      effectiveAction = "revise";
    }
    try {
      const body = await withEncryptedPassword(effectivePassword, {
        comment,
        action: effectiveAction,
      });
      const response = await apiFetch(`/api/serms/cash-advances/${id}/reject`, {
        method: "POST",
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (response.ok) {
        const result = await response.json();
        return upsertAdvance(result.data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errMsg =
          errorData.errors?.password?.[0] ||
          errorData.message ||
          "Failed to reject cash advance";
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error("Failed to reject cash advance", err);
      throw err;
    }
  }

  async function disburseRequest(id, payload, password) {
    // Support both legacy { channel, reference } and GrantPayoutModal payloads:
    // - disburseRequest(id, { channel, reference }, password)
    // - disburseRequest(id, { granted_by, payout_method, payout_method_other, granter_signature, password })
    const requestBody = {};
    let effectivePassword = password;
    if (payload && typeof payload === "object") {
      for (const key of [
        "channel",
        "reference",
        "granted_by",
        "payout_method",
        "payout_method_other",
        "granter_signature",
      ]) {
        if (payload[key] !== undefined) {
          requestBody[key] = payload[key];
        }
      }
      if (effectivePassword === undefined && typeof payload.password !== "undefined") {
        effectivePassword = payload.password;
      }
    }
    try {
      const body = await withEncryptedPassword(effectivePassword, requestBody);
      const response = await apiFetch(`/api/serms/cash-advances/${id}/disburse`, {
        method: "POST",
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (response.ok) {
        const result = await response.json();
        return upsertAdvance(result.data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errMsg =
          errorData.errors?.password?.[0] ||
          errorData.errors?.granter_signature?.[0] ||
          errorData.errors?.payout_method_other?.[0] ||
          errorData.errors?.payout_method?.[0] ||
          errorData.errors?.granted_by?.[0] ||
          errorData.message ||
          "Failed to disburse cash advance";
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error("Failed to disburse cash advance", err);
      throw err;
    }
  }

  async function acknowledgeRequest(id, signature) {
    try {
      const response = await apiFetch(
        `/api/serms/cash-advances/${id}/acknowledge`,
        {
          method: "POST",
          credentials: "include",
          body: JSON.stringify({ signature }),
        },
      );
      if (response.ok) {
        const result = await response.json();
        return upsertAdvance(result.data);
      } else {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to acknowledge cash advance",
        );
      }
    } catch (err) {
      console.error("Failed to acknowledge cash advance", err);
      throw err;
    }
  }

  async function fetchRequest(id) {
    try {
      const response = await apiFetch(`/api/serms/cash-advances/${id}`, {
        credentials: "include",
      });
      if (response.ok) {
        return normalizeAdvance(await response.json());
      }
      return null;
    } catch (err) {
      console.error("Failed to fetch cash advance details", err);
      return null;
    }
  }

  async function fetchDocument(id) {
    try {
      const response = await apiFetch(`/api/serms/cash-advances/${id}/document`, {
        credentials: "include",
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (err) {
      console.error("Failed to fetch cash advance document", err);
      return null;
    }
  }

  /**
   * Update a pending/rejected cash advance request (employee self-edit).
   */
  async function updateRequest(id, formData) {
    try {
      if (formData instanceof FormData) {
        formData.append("_method", "PUT");
      }
      const response = await apiFetch(`/api/serms/cash-advances/${id}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (response.ok) {
        const result = await response.json();
        return upsertAdvance(result.data);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update cash advance");
      }
    } catch (err) {
      console.error("Failed to update cash advance", err);
      throw err;
    }
  }

  /**
   * Delete a pending cash advance request.
   */
  async function deleteRequest(id, password) {
    try {
      const body = await withEncryptedPassword(password);
      const response = await apiFetch(`/api/serms/cash-advances/${id}`, {
        method: "DELETE",
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (response.ok) {
        items.value = items.value.filter((i) => i.id != id);
        return true;
      } else {
        const errorData = await response.json();
        const errMsg = errorData.errors?.password?.[0] || errorData.message || "Failed to delete";
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error("Failed to delete cash advance", err);
      throw err;
    }
  }

  return {
    items,
    isLoading,
    totalOutstanding,
    fetchAll,
    request,
    fetchRequest,
    fetchDocument,
    approveRequest,
    rejectRequest,
    disburseRequest,
    acknowledgeRequest,
    updateRequest,
    deleteRequest,
  };
});
