<script setup>
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps({
  status: { type: String, required: true },
  tier: { type: String, default: 'medium' }, // high | medium | low
})

// Canonical ONE UI Semantic Mappings
const statusConfig = {
  approved: {
    label: 'Approved',
    high: 'bg-emerald-600 text-white',
    medium: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
    low: 'bg-emerald-50/70 text-emerald-700',
  },
  granted: {
    label: 'Granted',
    high: 'bg-emerald-600 text-white',
    medium: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
    low: 'bg-emerald-50/70 text-emerald-700',
  },
  paid: {
    label: 'Paid',
    high: 'bg-emerald-600 text-white',
    medium: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
    low: 'bg-emerald-50/70 text-emerald-700',
  },
  liquidated: {
    label: 'Liquidated',
    high: 'bg-emerald-600 text-white',
    medium: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
    low: 'bg-emerald-50/70 text-emerald-700',
  },
  settled: {
    label: 'Settled',
    high: 'bg-emerald-600 text-white',
    medium: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
    low: 'bg-emerald-50/70 text-emerald-700',
  },
  disbursed: {
    label: 'Disbursed',
    high: 'bg-blue-600 text-white',
    medium: 'bg-blue-50 text-blue-700 border border-blue-300',
    low: 'bg-blue-50/70 text-blue-700',
  },
  signed: {
    label: 'Signed',
    high: 'bg-blue-600 text-white',
    medium: 'bg-blue-50 text-blue-700 border border-blue-300',
    low: 'bg-blue-50/70 text-blue-700',
  },
  processing: {
    label: 'Processing',
    high: 'bg-blue-600 text-white',
    medium: 'bg-blue-50 text-blue-700 border border-blue-300',
    low: 'bg-blue-50/70 text-blue-700',
  },
  processed: {
    label: 'Processed',
    high: 'bg-primary text-white',
    medium: 'bg-blue-50 text-primary border border-primary/30',
    low: 'bg-blue-50/70 text-primary',
  },
  'under-review': {
    label: 'Under Review',
    high: 'bg-violet-600 text-white',
    medium: 'bg-violet-50 text-violet-700 border border-violet-300',
    low: 'bg-violet-50/70 text-violet-700',
  },
  pending: {
    label: 'Pending',
    high: 'bg-amber-500 text-white',
    medium: 'bg-amber-50 text-amber-700 border border-amber-300',
    low: 'bg-amber-50/70 text-amber-700',
  },
  incomplete: {
    label: 'Incomplete',
    high: 'bg-amber-500 text-white',
    medium: 'bg-amber-50 text-amber-700 border border-amber-300',
    low: 'bg-amber-50/70 text-amber-700',
  },
  unliquidated: {
    label: 'Unliquidated',
    high: 'bg-amber-500 text-white',
    medium: 'bg-amber-50 text-amber-700 border border-amber-300',
    low: 'bg-amber-50/70 text-amber-700',
  },
  overpayment: {
    label: 'Overpayment',
    high: 'bg-blue-500 text-white',
    medium: 'bg-blue-50 text-blue-700 border border-blue-300',
    low: 'bg-blue-50/70 text-blue-700',
  },
  overdue: {
    label: 'Overdue',
    high: 'bg-red-600 text-white',
    medium: 'bg-red-50 text-red-700 border border-red-300',
    low: 'bg-red-50/70 text-red-700',
  },
  revise: {
    label: 'Needs Revision',
    high: 'bg-amber-600 text-white',
    medium: 'bg-amber-50 text-amber-700 border border-amber-300',
    low: 'bg-amber-50/70 text-amber-700',
  },
  rejected: {
    label: 'Rejected',
    high: 'bg-red-600 text-white',
    medium: 'bg-red-50 text-red-700 border border-red-300',
    low: 'bg-red-50/70 text-red-700',
  },
  reject: {
    label: 'Reject',
    high: 'bg-red-600 text-white',
    medium: 'bg-red-50 text-red-700 border border-red-300',
    low: 'bg-red-50/70 text-red-700',
  },
  'automatic-rejected': {
    label: 'Auto Rejected',
    high: 'bg-red-600 text-white',
    medium: 'bg-red-50 text-red-700 border border-red-300',
    low: 'bg-red-50/70 text-red-700',
  },
  'final-rejected': {
    label: 'Final Rejected',
    high: 'bg-red-700 text-white',
    medium: 'bg-red-50 text-red-800 border border-red-400',
    low: 'bg-red-50/70 text-red-800',
  },
  'pending-admin-re-review': {
    label: 'Pending Re-review',
    high: 'bg-secondary text-white',
    medium: 'bg-blue-50 text-secondary border border-secondary/30',
    low: 'bg-blue-50/70 text-secondary',
  },
  draft: {
    label: 'Draft',
    high: 'bg-slate-500 text-white',
    medium: 'bg-slate-100 text-slate-700 border border-slate-300',
    low: 'bg-slate-100/70 text-slate-600',
  },
  flagged: {
    label: 'Flagged',
    high: 'bg-red-600 text-white',
    medium: 'bg-red-50 text-red-700 border border-red-300',
    low: 'bg-red-50/70 text-red-700',
  },
  acknowledged: {
    label: 'Acknowledged',
    high: 'bg-emerald-600 text-white',
    medium: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
    low: 'bg-emerald-50/70 text-emerald-700',
  },
  'awaiting-acknowledgement': {
    label: 'Awaiting Acknowledgement',
    high: 'bg-amber-500 text-white',
    medium: 'bg-amber-50 text-amber-700 border border-amber-300',
    low: 'bg-amber-50/70 text-amber-700',
  },
  open: {
    label: 'Open',
    high: 'bg-blue-600 text-white',
    medium: 'bg-blue-50 text-blue-700 border border-blue-300',
    low: 'bg-blue-50/70 text-blue-700',
  },
  'in-progress': {
    label: 'In Progress',
    high: 'bg-blue-600 text-white',
    medium: 'bg-blue-50 text-blue-700 border border-blue-300',
    low: 'bg-blue-50/70 text-blue-700',
  },
  'pending-evaluation': {
    label: 'Pending Evaluation',
    high: 'bg-amber-500 text-white',
    medium: 'bg-amber-50 text-amber-700 border border-amber-300',
    low: 'bg-amber-50/70 text-amber-700',
  },
  resolved: {
    label: 'Resolved',
    high: 'bg-emerald-600 text-white',
    medium: 'bg-emerald-50 text-emerald-700 border border-emerald-300',
    low: 'bg-emerald-50/70 text-emerald-700',
  },
  closed: {
    label: 'Closed',
    high: 'bg-slate-600 text-white',
    medium: 'bg-slate-100 text-slate-700 border border-slate-300',
    low: 'bg-slate-100/70 text-slate-600',
  },
  discarded: {
    label: 'Discarded',
    high: 'bg-red-600 text-white',
    medium: 'bg-red-50 text-red-700 border border-red-300',
    low: 'bg-red-50/70 text-red-700',
  },
}

function toTitleCase(str) {
  if (!str) return ''
  return str
    .toLowerCase()
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const resolvedConfig = computed(() => {
  if (!props.status) return null
  const key = props.status.toLowerCase().replace(/\s+/g, '-')
  return statusConfig[key] || statusConfig[props.status] || null
})

const badgeClass = computed(() => {
  const cfg = resolvedConfig.value
  if (!cfg) {
    return 'bg-slate-100 text-slate-700 border border-slate-200'
  }
  return cfg[props.tier] || cfg.medium
})

const displayLabel = computed(() => {
  return resolvedConfig.value?.label || toTitleCase(props.status)
})
</script>

<template>
  <Badge
    :class="[
      'inline-flex items-center font-sans text-[11px] font-semibold h-6 px-3 rounded-full',
      badgeClass
    ]"
  >
    {{ displayLabel }}
  </Badge>
</template>
