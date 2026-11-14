import { defineStore } from 'pinia'
import { ref } from 'vue'

// --- MOCK DATABASE ---
const MOCK_EXPENSE_LIMITS = [
  { id: 1, category: 'LAB-SUPPLIES', grade: 'ALL', department: 'ALL', limit: 50000, threshold: 25000, active: true, effectiveDate: '2024-01-01' },
  { id: 2, category: 'CLIENT-FAC', grade: 'ALL', department: 'SALES', limit: 10000, threshold: 5000, active: true, effectiveDate: '2024-01-01' },
  { id: 3, category: 'CLIENT-FAC', grade: 'ALL', department: 'ALL', limit: 5000, threshold: 3000, active: true, effectiveDate: '2024-01-01' },
  { id: 4, category: 'TRANSPORT', grade: 'ALL', department: 'ALL', limit: 3000, threshold: null, active: true, effectiveDate: '2024-01-01' },
  { id: 5, category: 'EQUIP-MAINT', grade: 'ALL', department: 'ALL', limit: 100000, threshold: 50000, active: true, effectiveDate: '2024-01-01' },
  { id: 6, category: 'STAFF-DEV', grade: 'ALL', department: 'ALL', limit: 20000, threshold: null, active: true, effectiveDate: '2024-01-01' },
]

const MOCK_PENALTY_RULES = [
  { id: 1, dailyRate: 1.5, maxCap: 50, capType: 'PERCENTAGE', active: true, effectiveDate: '2024-01-01' }
]

const MOCK_POLICY_LOGS = [
  { id: Date.now() - 86400000 * 5, user: 'Alex Reyes', action: 'CREATE_LIMIT', details: 'Added LAB-SUPPLIES rule' },
  { id: Date.now() - 86400000 * 2, user: 'Alex Reyes', action: 'UPDATE_PENALTY', details: 'Modified max cap to 50%' },
]
// --- END MOCK DATABASE ---

export const usePolicyStore = defineStore('policy', () => {
  const expenseLimits = ref([])
  const penaltyRules = ref([])
  const policyLogs = ref([])
  const isLoading = ref(false)

  // Initialization
  async function fetchAll() {
    isLoading.value = true
    await new Promise(r => setTimeout(r, 600)) // network delay
    expenseLimits.value = JSON.parse(JSON.stringify(MOCK_EXPENSE_LIMITS))
    penaltyRules.value = JSON.parse(JSON.stringify(MOCK_PENALTY_RULES))
    policyLogs.value = JSON.parse(JSON.stringify(MOCK_POLICY_LOGS))
    isLoading.value = false
  }

  // --- ENGINE ---
  /**
   * Finds the most specific valid limit for a given context and date.
   * Specificity fallback: exact grade/dept -> ALL grade/exact dept -> exact grade/ALL dept -> ALL/ALL.
   */
  function getApplicableLimit(category, grade = 'ALL', department = 'ALL', submissionDateStr = null) {
    const targetDate = submissionDateStr ? new Date(submissionDateStr) : new Date()

    const activeRules = expenseLimits.value.filter(rule => {
      // rule must be active
      if (!rule.active) return false
      // check effective date (no retroactive apply)
      const effective = new Date(rule.effectiveDate)
      return targetDate >= effective && rule.category === category
    })

    if (!activeRules.length) return null

    // Find best match based on specificity.
    // 1. Exact match
    const exact = activeRules.find(r => r.grade === grade && r.department === department)
    if (exact) return exact

    // 2. Dept match only
    const deptMatch = activeRules.find(r => r.grade === 'ALL' && r.department === department)
    if (deptMatch) return deptMatch

    // 3. Grade match only
    const gradeMatch = activeRules.find(r => r.grade === grade && r.department === 'ALL')
    if (gradeMatch) return gradeMatch

    // 4. Fallback default
    return activeRules.find(r => r.grade === 'ALL' && r.department === 'ALL') || null
  }

  function getApplicablePenalty(submissionDateStr = null) {
    const targetDate = submissionDateStr ? new Date(submissionDateStr) : new Date()
    // get active rules effective on or before date
    const validRules = penaltyRules.value.filter(rule => {
      if (!rule.active) return false
      const effective = new Date(rule.effectiveDate)
      return targetDate >= effective
    })
    
    // sort by latest effective date to get the most currently applicable rule
    validRules.sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate))
    
    return validRules[0] || null
  }

  // --- MUTATIONS ---
  async function addLimitRule(ruleData, user) {
    await new Promise(r => setTimeout(r, 400))
    const newRule = { id: Date.now(), active: true, ...ruleData }
    expenseLimits.value.push(newRule)
    logAction('CREATE_LIMIT', `Created limit for ${newRule.category}`, user)
    return newRule
  }

  async function updateLimitRule(id, updates, user) {
    await new Promise(r => setTimeout(r, 400))
    const idx = expenseLimits.value.findIndex(r => r.id === id)
    if (idx !== -1) {
      expenseLimits.value[idx] = { ...expenseLimits.value[idx], ...updates }
      logAction('UPDATE_LIMIT', `Updated limit logic for ${expenseLimits.value[idx].category}`, user)
    }
  }

  async function deleteLimitRule(id, user) {
    await new Promise(r => setTimeout(r, 400))
    expenseLimits.value = expenseLimits.value.filter(r => r.id !== id)
    logAction('DELETE_LIMIT', `Deleted an expense limit rule`, user)
  }

  async function addPenaltyRule(ruleData, user) {
    await new Promise(r => setTimeout(r, 400))
    // we only allow 1 active at a time generally, or handle overlapping effective dates.
    // just push it for now.
    const newRule = { id: Date.now(), active: true, ...ruleData }
    penaltyRules.value.push(newRule)
    logAction('CREATE_PENALTY', `Created penalty rule (Rate: ${newRule.dailyRate}%)`, user)
    return newRule
  }

  async function togglePenaltyActive(id, state, user) {
    await new Promise(r => setTimeout(r, 300))
    const rule = penaltyRules.value.find(r => r.id === id)
    if (rule) {
      rule.active = state
      logAction('TOGGLE_PENALTY', `Toggled penalty rule ${id} to ${state ? 'ACTIVE' : 'OFFLINE'}`, user)
    }
  }

  // Internal log helper
  function logAction(action, details, user) {
    const name = user ? user.name : 'System'
    policyLogs.value.unshift({
      id: Date.now(),
      user: name,
      action,
      details,
      timestamp: new Date().toISOString()
    })
  }

  return {
    expenseLimits,
    penaltyRules,
    policyLogs,
    isLoading,
    fetchAll,
    getApplicableLimit,
    getApplicablePenalty,
    addLimitRule,
    updateLimitRule,
    deleteLimitRule,
    addPenaltyRule,
    togglePenaltyActive
  }
})
