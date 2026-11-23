<script setup>
import { ref, reactive, onMounted } from 'vue'
import { usePolicyStore } from '@/stores/policy'
import { useAuthStore } from '@/stores/auth'
import BaseButton from '@/components/base/BaseButton.vue'
import SkeletonLoader from '@/components/base/SkeletonLoader.vue'
import { Plus, Trash2, Save, X, Clock } from 'lucide-vue-next'
import { formatDate } from '@/utils/formatters'

const policyStore = usePolicyStore()
const authStore = useAuthStore()

onMounted(() => {
  policyStore.fetchAll()
})

const activeTab = ref('limits') // 'limits', 'penalties', 'logs'
const showAddLimit = ref(false)
const showAddPenalty = ref(false)

const GRADES = ['ALL', 'L1', 'L2', 'L3', 'M1', 'EXEC']
const DEPARTMENTS = ['ALL', 'SALES', 'IT', 'HR', 'FINANCE', 'OPERATIONS']
const CATEGORIES = ['LAB-SUPPLIES', 'TRANSPORT', 'CLIENT-FAC', 'EQUIP-MAINT', 'OFFICE-SYS', 'STAFF-DEV', 'UTIL-OPER', 'OTHER-MISC']

const newPolicy = reactive({
  category: 'CLIENT-FAC',
  grade: 'ALL',
  department: 'ALL',
  limit: '',
  threshold: '',
  effectiveDate: new Date().toISOString().split('T')[0]
})

const newPenalty = reactive({
  dailyRate: '',
  maxCap: '',
  capType: 'PERCENTAGE', // PERCENTAGE or FIXED
  effectiveDate: new Date().toISOString().split('T')[0]
})

const isSubmittingLimit = ref(false)
const isSubmittingPenalty = ref(false)

async function submitLimit() {
  if (isSubmittingLimit.value) return
  isSubmittingLimit.value = true
  try {
    await policyStore.addLimitRule({
      category: newPolicy.category,
      grade: newPolicy.grade,
      department: newPolicy.department,
      limit: Number(newPolicy.limit),
      threshold: newPolicy.threshold ? Number(newPolicy.threshold) : null,
      effectiveDate: newPolicy.effectiveDate
    }, authStore.user)
    showAddLimit.value = false
    Object.assign(newPolicy, { limit: '', threshold: '' })
  } finally {
    isSubmittingLimit.value = false
  }
}

async function submitPenalty() {
  if (isSubmittingPenalty.value) return
  isSubmittingPenalty.value = true
  try {
    await policyStore.addPenaltyRule({
      dailyRate: Number(newPenalty.dailyRate),
      maxCap: Number(newPenalty.maxCap),
      capType: newPenalty.capType,
      effectiveDate: newPenalty.effectiveDate
    }, authStore.user)
    showAddPenalty.value = false
    Object.assign(newPenalty, { dailyRate: '', maxCap: '' })
  } finally {
    isSubmittingPenalty.value = false
  }
}

async function deleteLimit(id) {
  await policyStore.deleteLimitRule(id, authStore.user)
}
</script>

<template>
  <div class="flex flex-col gap-6 font-sans">
    <!-- Page Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div class="min-w-0">

        <h1 class="font-heading text-2xl font-bold leading-tight text-slate-800">
          Policy Engine
        </h1>
        <p class="mt-1 text-sm text-slate-400">
          Manage limits, penalties, and thresholds
        </p>
      </div>
      <div v-if="activeTab === 'limits'">
        <BaseButton id="add-policy-btn" variant="primary" @click="showAddLimit = true">
          <Plus class="w-5 h-5 mr-1" /> NEW LIMIT RULE
        </BaseButton>
      </div>
      <div v-else-if="activeTab === 'penalties'">
        <BaseButton id="add-penalty-btn" variant="primary" @click="showAddPenalty = true">
          <Plus class="w-5 h-5 mr-1" /> NEW PENALTY RULE
        </BaseButton>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-6 border-b border-slate-200">
      <button @click="activeTab = 'limits'" :class="['pb-2 text-[11px] font-bold uppercase tracking-widest transition-none border-b-2', activeTab === 'limits' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600']">
        Expense Limits
      </button>
      <button @click="activeTab = 'penalties'" :class="['pb-2 text-[11px] font-bold uppercase tracking-widest transition-none border-b-2', activeTab === 'penalties' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600']">
        Penalty Management
      </button>
      <button @click="activeTab = 'logs'" :class="['pb-2 text-[11px] font-bold uppercase tracking-widest transition-none border-b-2', activeTab === 'logs' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600']">
        Change History
      </button>
    </div>

    <div v-if="policyStore.isLoading" class="space-y-4">
      <div v-if="activeTab !== 'logs'" class="card p-6">
        <div class="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
          <div class="h-4 w-40 animate-pulse rounded bg-slate-200"></div>
          <div class="h-8 w-28 animate-pulse rounded bg-slate-200"></div>
        </div>
        <SkeletonLoader variant="table" :rows="6" :columns="6" />
      </div>
      <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div v-for="i in 3" :key="`policy-log-skeleton-${i}`" class="card p-4">
          <SkeletonLoader variant="card" />
        </div>
      </div>
    </div>

    <template v-else>
      <!-- TAB 1: EXPENSE LIMITS -->
      <div v-if="activeTab === 'limits'" class="space-y-6">
        <!-- New Limit Form -->
        <Transition name="slide">
          <div v-if="showAddLimit" class="card p-6 shadow-md">
            <div class="flex items-center justify-between mb-6 border-b border-slate-50 pb-4">
              <h3 class="text-[11px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <span class="w-1.5 h-1.5 bg-primary" /> New Compliance Limit
              </h3>
              <button class="text-slate-300 hover:text-danger transition-none" @click="showAddLimit = false"><X class="w-4 h-4" /></button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="input-wrapper">
                <label class="input-label">CATEGORY</label>
                <select v-model="newPolicy.category" class="input font-bold uppercase text-[11px]">
                  <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
              <div class="input-wrapper">
                <label class="input-label">EMPLOYEE GRADE</label>
                <select v-model="newPolicy.grade" class="input uppercase text-[11px]">
                  <option v-for="g in GRADES" :key="g" :value="g">{{ g }}</option>
                </select>
              </div>
              <div class="input-wrapper">
                <label class="input-label">DEPARTMENT</label>
                <select v-model="newPolicy.department" class="input uppercase text-[11px]">
                  <option v-for="d in DEPARTMENTS" :key="d" :value="d">{{ d }}</option>
                </select>
              </div>
              <div class="input-wrapper">
                <label class="input-label">MAX LIMIT (PHP)</label>
                <input v-model="newPolicy.limit" type="number" class="input font-mono" placeholder="0.00" />
              </div>
              <div class="input-wrapper">
                <label class="input-label">APPROVAL THRESHOLD (OPTIONAL)</label>
                <input v-model="newPolicy.threshold" type="number" class="input font-mono" placeholder="Amount triggering extra approval" />
              </div>
              <div class="input-wrapper">
                <label class="input-label">EFFECTIVE DATE</label>
                <input v-model="newPolicy.effectiveDate" type="date" class="input font-mono" />
              </div>
            </div>
            <div class="flex justify-end mt-4">
              <BaseButton variant="primary" class="min-h-[42px] w-full sm:w-fit" :loading="isSubmittingLimit" :disabled="isSubmittingLimit || !newPolicy.limit || !newPolicy.effectiveDate" @click="submitLimit">
                <Save class="w-3.5 h-3.5 mr-2" /> DEPLOY LIMIT RULE
              </BaseButton>
            </div>
          </div>
        </Transition>

        <div class="card overflow-hidden shadow-sm">
          <table class="table-base border-0">
            <thead>
              <tr>
                <th class="!border-l-0">CATEGORY</th>
                <th>GROUP (GRADE / DEPT)</th>
                <th>MAX LIMIT (PHP)</th>
                <th>THRESHOLD</th>
                <th>EFFECTIVE</th>
                <th class="!border-r-0">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in policyStore.expenseLimits" :key="p.id" :class="[p.active ? '' : 'opacity-60 grayscale-[0.5]']">
                <td class="!border-l-0 font-bold text-slate-700 text-xs uppercase tracking-tight">
                  <div class="flex items-center gap-2">
                    <div :class="['w-1.5 h-3', p.active ? 'bg-primary' : 'bg-slate-300']" />
                    {{ p.category }}
                  </div>
                </td>
                <td>
                  <div class="flex flex-col">
                    <span class="text-[10px] font-bold text-slate-600">G: {{ p.grade }}</span>
                    <span class="text-[9px] text-slate-400">D: {{ p.department }}</span>
                  </div>
                </td>
                <td class="font-bold text-primary font-mono text-sm">₱{{ p.limit.toLocaleString() }}</td>
                <td>
                  <span v-if="p.threshold" class="font-bold text-warning font-mono text-xs">₱{{ p.threshold.toLocaleString() }}</span>
                  <span v-else class="text-[9px] text-slate-400 font-mono">--</span>
                </td>
                <td class="text-xs font-mono text-slate-500">{{ formatDate(p.effectiveDate) }}</td>
                <td class="!border-r-0">
                  <div class="flex items-center gap-3">
                    <button class="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border transition-none"
                      :class="p.active ? 'bg-success/5 border-success/20 text-success' : 'bg-slate-50 border-slate-200 text-slate-400'"
                      @click="policyStore.updateLimitRule(p.id, { active: !p.active }, authStore.user)">
                      {{ p.active ? 'ACTIVE' : 'OFFLINE' }}
                    </button>
                    <button class="text-slate-300 hover:text-danger transition-none" @click="deleteLimit(p.id)">
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="policyStore.expenseLimits.length === 0">
                <td colspan="6" class="text-center py-8 text-xs text-slate-400 uppercase tracking-widest">No limits configured</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 2: PENALTIES -->
      <div v-if="activeTab === 'penalties'" class="space-y-6">
        <Transition name="slide">
          <div v-if="showAddPenalty" class="card p-6 shadow-md">
            <div class="flex items-center justify-between mb-6 border-b border-slate-50 pb-4">
              <h3 class="text-[11px] font-bold uppercase tracking-widest text-danger flex items-center gap-2">
                <span class="w-1.5 h-1.5 bg-danger" /> New Penalty Config
              </h3>
              <button class="text-slate-300 hover:text-danger transition-none" @click="showAddPenalty = false"><X class="w-4 h-4" /></button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div class="input-wrapper">
                <label class="input-label">DAILY PENALTY RATE (%)</label>
                <input v-model="newPenalty.dailyRate" type="number" step="0.1" class="input font-mono" placeholder="1.5" />
              </div>
              <div class="input-wrapper">
                <label class="input-label">MAXIMUM CAP</label>
                <input v-model="newPenalty.maxCap" type="number" class="input font-mono" placeholder="50" />
              </div>
              <div class="input-wrapper">
                <label class="input-label">CAP TYPE</label>
                <select v-model="newPenalty.capType" class="input uppercase text-[11px]">
                  <option value="PERCENTAGE">% OF ADVANCE</option>
                  <option value="FIXED">FIXED AMOUNT (PHP)</option>
                </select>
              </div>
              <div class="input-wrapper">
                <label class="input-label">EFFECTIVE DATE</label>
                <input v-model="newPenalty.effectiveDate" type="date" class="input font-mono" />
              </div>
            </div>
            <div class="flex justify-end mt-4">
              <BaseButton variant="danger" class="px-4 py-2.5" :loading="isSubmittingPenalty" :disabled="isSubmittingPenalty || !newPenalty.dailyRate || !newPenalty.maxCap" @click="submitPenalty">
                <Save class="w-3.5 h-3.5 mr-2" /> ENFORCE RULE
              </BaseButton>
            </div>
          </div>
        </Transition>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div v-for="r in policyStore.penaltyRules" :key="r.id" class="card border-l-2 relative" :class="r.active ? 'border-l-danger' : 'border-l-slate-300 grayscale opacity-70'">
            <div class="absolute top-4 right-4">
               <button class="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border"
                  :class="r.active ? 'bg-danger/5 border-danger/20 text-danger' : 'bg-slate-50 border-slate-200 text-slate-400'"
                  @click="policyStore.togglePenaltyActive(r.id, !r.active, authStore.user)">
                  {{ r.active ? 'ACTIVE' : 'OFFLINE' }}
                </button>
            </div>
            <div class="flex items-center gap-2 mb-4">
              <Clock class="w-4 h-4 text-slate-400" />
              <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Effective: {{ formatDate(r.effectiveDate) }}</span>
            </div>
            <div class="mb-4">
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DAILY RATE PENALTY</p>
              <p class="text-3xl font-mono font-bold text-primary">{{ r.dailyRate }}%</p>
            </div>
            <div class="border-t border-slate-100 pt-3">
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
                <span>MAXIMUM CAP</span>
                <span class="text-xs font-mono text-slate-800">
                  {{ r.capType === 'PERCENTAGE' ? `${r.maxCap}%` : `₱${r.maxCap.toLocaleString()}` }}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: LOGS -->
      <div v-if="activeTab === 'logs'">
        <div class="card overflow-hidden">
          <table class="table-base border-0">
            <thead>
              <tr>
                <th class="!border-l-0">TIMESTAMP</th>
                <th>OPERATOR</th>
                <th>ACTION</th>
                <th class="!border-r-0">DETAILS</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in policyStore.policyLogs" :key="log.id">
                <td class="!border-l-0 text-xs font-mono text-slate-500">{{ new Date(log.timestamp).toLocaleString() }}</td>
                <td class="text-xs font-bold text-slate-700">{{ log.user }}</td>
                <td>
                  <span class="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 border border-primary/20 bg-primary/5 text-primary">
                    {{ log.action }}
                  </span>
                </td>
                <td class="!border-r-0 text-xs text-slate-600">{{ log.details }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active { transition: opacity 0.15s linear, transform 0.15s linear; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
