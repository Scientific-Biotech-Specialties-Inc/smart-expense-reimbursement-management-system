import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../utils/apiFetch'

export const useLiquidationStore = defineStore('liquidation', () => {
  const settlements = ref([])
  const isLoading = ref(false)
  const DAILY_PENALTY_PHP = 50

  function upsertSettlement(item) {
    const existingIndex = settlements.value.findIndex((s) => s.id == item.id)
    if (existingIndex === -1) {
      settlements.value.unshift(item)
    } else {
      settlements.value[existingIndex] = {
        ...settlements.value[existingIndex],
        ...item,
      }
    }

    return settlements.value[existingIndex === -1 ? 0 : existingIndex]
  }

  /**
   * Fetch all liquidations from the backend.
   */
  async function fetchSettlements() {
    isLoading.value = true
    try {
      const response = await apiFetch('/api/serms/liquidations', {
        credentials: 'include',
      })
      if (response.ok) {
        settlements.value = await response.json()
      }
    } catch (err) {
      console.error('Failed to fetch liquidations', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Calculates the aging and penalty for a cash advance.
   * Logic: flat 50 PHP penalty per day after due date.
   */
  function calculateAging(advance) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dueDateStr = advance.expected_liquidation_date || advance.dueDate
    const dueDate = dueDateStr ? new Date(dueDateStr) : null
    if (dueDate) {
      dueDate.setHours(0, 0, 0, 0)
    }

    // 1. Calculate sum of penalties from backend
    let penalty = 0
    if (advance.penalties && advance.penalties.length > 0) {
      penalty = advance.penalties.reduce((sum, p) => sum + Number(p.penalty_amount), 0)
    }

    // 2. Overdue calculation
    const isAuditing = advance.status === 'pending' || advance.status === 'under-review' || advance.status === 'approved'
    const isOverdue = (advance.status === 'overdue' || (dueDate && today > dueDate)) && 
                      !['liquidated', 'settled'].includes(advance.status) && 
                      !isAuditing

    // 3. Fallback dynamic penalty if backend did not return any penalties but it is overdue
    if (isOverdue && penalty === 0 && dueDate && today > dueDate) {
      const diffTime = today - dueDate
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      if (diffDays > 0) {
        penalty = diffDays * DAILY_PENALTY_PHP
      }
    }

    // 4. Calculate days since issue
    const issueDateStr = advance.date || advance.created_at
    const issueDate = issueDateStr ? new Date(issueDateStr) : null
    let daysSinceIssue = 0
    if (issueDate) {
      issueDate.setHours(0, 0, 0, 0)
      const diffTime = Math.abs(today - issueDate)
      daysSinceIssue = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    }

    const graceRemaining = dueDate ? Math.max(0, Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))) : 0

    return {
      daysSinceIssue,
      isOverdue,
      penalty,
      graceRemaining
    }
  }

  /**
   * Submit settlement to backend
   */
  async function submitSettlement(advanceId, payload) {
    try {
      const formData = new FormData();
      formData.append('cash_advance_id', advanceId);
      formData.append('total_expense_amount', payload.totalExpenses);
      if (payload.shortfall_explanation) {
        formData.append('shortfall_explanation', payload.shortfall_explanation);
      }
      
      if (payload.reportAttachment) {
        formData.append('report_attachment', payload.reportAttachment);
      }
      if (payload.reportTemplateData) {
        formData.append('report_template_data', JSON.stringify(payload.reportTemplateData));
      }

      const formattedReceipts = payload.receipts.map(r => ({
        id: r.ocrData?.id || r.id, // backend DB ID
        vendor_name: r.merchantName || r.ocrData?.vendor,
        transaction_date: r.date || r.ocrData?.date || r.transactionDate,
        total_amount: r.amount || r.ocrData?.amount,
        vat_amount: r.tax || r.ocrData?.vat || r.vat,
        tin: r.tin || r.ocrData?.tin || r.tinNumber,
        invoice_number: r.invoiceNumber || r.ocrData?.invoiceNumber,
        expense_category_id: r.categoryId ?? r.ocrData?.expense_category_id ?? null,
        location: r.location || r.ocrData?.location || null,
        currency: r.currency || 'PHP',
        vat_classification: r.vatClassification || 'vat',
        items: Array.isArray(r.items) ? r.items : [],
      }));
      formData.append('receipts', JSON.stringify(formattedReceipts));

      const response = await apiFetch('/api/serms/liquidations', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to submit liquidation')
      }

      const result = await response.json()
      return upsertSettlement(result.data)
    } catch (err) {
      console.error('Failed to submit liquidation', err)
      throw err;
    }
  }

  /**
   * Audit settlement (approve or reject)
   */
  async function auditSettlement(id, payload) {
    try {
      const response = await apiFetch(`/api/serms/liquidations/${id}/audit`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(payload), // contains status, password, admin_note
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to audit liquidation')
      }

      const result = await response.json()
      return upsertSettlement(result.data)
    } catch (err) {
      console.error('Failed to audit liquidation', err)
      throw err;
    }
  }

  /**
   * Update a pending/rejected liquidation settlement (employee self-edit).
   */
  async function updateSettlement(id, payload) {
    isLoading.value = true
    try {
      const formData = new FormData();
      formData.append('total_expense_amount', payload.totalExpenses);
      if (payload.shortfall_explanation) {
        formData.append('shortfall_explanation', payload.shortfall_explanation);
      } else {
        formData.append('shortfall_explanation', '');
      }
      
      if (payload.reportAttachment) {
        formData.append('report_attachment', payload.reportAttachment);
      }
      if (payload.reportTemplateData) {
        formData.append('report_template_data', JSON.stringify(payload.reportTemplateData));
      }

      const formattedReceipts = payload.receipts.map(r => ({
        id: r.ocrData?.id || r.id, // backend DB ID
        vendor_name: r.merchantName || r.ocrData?.vendor,
        transaction_date: r.date || r.ocrData?.date || r.transactionDate,
        total_amount: r.amount || r.ocrData?.amount,
        vat_amount: r.tax || r.ocrData?.vat || r.vat,
        tin: r.tin || r.ocrData?.tin || r.tinNumber,
        invoice_number: r.invoiceNumber || r.ocrData?.invoiceNumber,
        expense_category_id: r.categoryId ?? r.ocrData?.expense_category_id ?? null,
        location: r.location || r.ocrData?.location || null,
        currency: r.currency || 'PHP',
        vat_classification: r.vatClassification || 'vat',
        items: Array.isArray(r.items) ? r.items : [],
      }));
      formData.append('receipts', JSON.stringify(formattedReceipts));

      // Laravel file upload via PUT requires POST with _method override
      formData.append('_method', 'PUT');

      const response = await apiFetch(`/api/serms/liquidations/${id}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update liquidation')
      }

      const result = await response.json()
      return upsertSettlement(result.data)
    } catch (err) {
      console.error('Failed to update liquidation', err)
      throw err;
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Delete a pending liquidation settlement.
   */
  async function deleteSettlement(id, password) {
    isLoading.value = true
    try {
      const response = await apiFetch(`/api/serms/liquidations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const errorData = await response.json()
        const errMsg = errorData.errors?.password?.[0] || errorData.message || 'Failed to delete liquidation'
        throw new Error(errMsg)
      }

      await fetchSettlements()
      return true
    } catch (err) {
      console.error('Failed to delete liquidation', err)
      throw err;
    } finally {
      isLoading.value = false
    }
  }

  return {
    settlements,
    isLoading,
    calculateAging,
    fetchSettlements,
    submitSettlement,
    auditSettlement,
    updateSettlement,
    deleteSettlement
  }
})
