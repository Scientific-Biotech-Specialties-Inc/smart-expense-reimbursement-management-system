<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  AlertTriangle,
  FileText,
  PlusCircle,
  Trash2,
  UploadCloud,
  X,
  Layers,
  ChevronDown,
  RefreshCw
} from 'lucide-vue-next'
import { apiFetch } from '../../utils/apiFetch'
import { formatDateForInput } from '../../utils/receiptUtils'
import ReceiptQualityRejectionModal from '../reimbursements/ReceiptQualityRejectionModal.vue'


const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  accept: { type: String, default: 'image/*,.pdf' },
  maxSizeMb: { type: Number, default: 2 },
})

const emit = defineEmits(['update:modelValue', 'ocr-result', 'upload-error'])

const isDragging = ref(false)
const files = ref([...props.modelValue])
const localError = ref(null)
const fileInput = ref(null)

const uploadMode = ref('single')
const showDropConfirmModal = ref(false)
const pendingDropFiles = ref([])
const isDropdownOpen = ref(false)
const selectDropdownRef = ref(null)
const addMoreDropdownRef = ref(null)
const pollTimers = new Map()
const qualityRejection = ref(null)

function handleWindowClick(event) {
  const isInsideSelect = selectDropdownRef.value && selectDropdownRef.value.contains(event.target)
  const isInsideAddMore = addMoreDropdownRef.value && addMoreDropdownRef.value.contains(event.target)
  if (!isInsideSelect && !isInsideAddMore) {
    isDropdownOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
})

function clearQualityRejection() {
  qualityRejection.value = null
}

function handleRetake() {
  const rejectedEntry = qualityRejection.value?.entry
  if (rejectedEntry) {
    const idx = files.value.indexOf(rejectedEntry)
    if (idx !== -1) {
      removeFile(idx)
    }
  }
  clearQualityRejection()
  setTimeout(() => fileInput.value?.click(), 100)
}

function handleContinueAnyway() {
  const rejectedEntry = qualityRejection.value?.entry
  if (rejectedEntry) {
    rejectedEntry.ocrStatus = 'done'
    rejectedEntry.isQualityOverridden = true
    rejectedEntry.hasOcrReturned = true
    emit('update:modelValue', files.value)
  }
  clearQualityRejection()
}

function openQualityModalForEntry(entry) {
  if (entry.ocrStatus === 'rejected' && entry.rejectionCode !== 'duplicate') {
    qualityRejection.value = {
      entry,
      file: entry.pages?.[0] || null,
      rejectionCode: entry.rejectionCode,
      rejectionReason: entry.rejectionReason,
    }
  }
}

watch(
  () => props.modelValue,
  (newValue) => {
    files.value = [...(newValue || [])]
  },
  { deep: true },
)

function buildPrefilledOcrData(file) {
  return {
    id: null,
    amount: '',
    vat: '',
    tin: '',
    vendor: '',
    invoiceNumber: '',
    date: '',
    location: '',
    confidence: 0,
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function processFiles(fileList, mode) {
  localError.value = null

  const validFiles = []
  for (const file of fileList) {
    if (file.size > props.maxSizeMb * 1024 * 1024) {
      emit('upload-error', {
        type: 'size-exceeded',
        message: `${file.name} exceeds the ${props.maxSizeMb}MB size limit.`,
        fileName: file.name,
        maxSizeMb: props.maxSizeMb,
      })
      continue
    }
    validFiles.push(file)
  }

  if (validFiles.length === 0) return

  if (mode === 'single') {
    // When Single Receipt is chosen, strictly send only the first selected file to OCR
    const file = validFiles[0]
    const entry = {
      pages: [file],
      name: file.name,
      fileName: file.name,
      size: file.size,
      previews: [file.type.startsWith('image/') ? URL.createObjectURL(file) : null],
      thumbnail: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      ocrStatus: 'idle',
      merchantName: '',
      date: '',
      tin: '',
      invoiceNumber: '',
      location: '',
      currency: 'PHP',
      vatClassification: 'vat',
      subtotal: '0.00',
      tax: '0.00',
      amount: 0,
      items: [],
      ocrData: buildPrefilledOcrData(file),
    }
    files.value.push(entry)
    simulateOCR(files.value[files.value.length - 1])
  } else {
    // Multi Receipt: all selected files (up to 6 segments) sent together to OCR
    const segmentFiles = validFiles.slice(0, 6)
    const entry = {
      pages: segmentFiles,
      name: segmentFiles.length > 1
        ? `Multi-page Receipt (${segmentFiles.length} pages)`
        : segmentFiles[0].name,
      fileName: segmentFiles.length > 1
        ? `Multi-page Receipt (${segmentFiles.length} pages)`
        : segmentFiles[0].name,
      size: segmentFiles.reduce((acc, f) => acc + f.size, 0),
      previews: segmentFiles.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : null),
      thumbnail: segmentFiles[0]?.type.startsWith('image/') ? URL.createObjectURL(segmentFiles[0]) : null,
      ocrStatus: 'idle',
      merchantName: '',
      date: '',
      tin: '',
      invoiceNumber: '',
      location: '',
      currency: 'PHP',
      vatClassification: 'vat',
      subtotal: '0.00',
      tax: '0.00',
      amount: 0,
      items: [],
      ocrData: buildPrefilledOcrData(segmentFiles[0]),
    }
    files.value.push(entry)
    simulateOCR(files.value[files.value.length - 1])
  }

  emit('update:modelValue', files.value)
}

function handleConfirmDrop(mode) {
  showDropConfirmModal.value = false
  if (pendingDropFiles.value.length > 0) {
    processFiles(pendingDropFiles.value, mode)
  }
  pendingDropFiles.value = []
}

function triggerFileInput(mode) {
  uploadMode.value = mode
  if (fileInput.value) {
    fileInput.value.multiple = (mode === 'multi')
    fileInput.value.value = ''
    fileInput.value.click()
  }
}

function hydrateEntry(entry, ocrData) {
  entry.ocrStatus = 'done'
  entry.id = ocrData.id
  // confidence from pipeline is 0-1; legacy fallback was 0-100
  let rawConf = ocrData.ocr_confidence_score ?? ocrData.confidence ?? 85
  if (rawConf > 0 && rawConf <= 1) rawConf = rawConf * 100
  const confidence = Math.round(rawConf)
  entry.ocrData = {
    id: ocrData.id,
    amount: ocrData.total_amount ?? ocrData.amount ?? entry.ocrData.amount ?? '',
    vat: ocrData.vat_amount ?? ocrData.vat ?? entry.ocrData.vat ?? '',
    tin: ocrData.tin ?? entry.ocrData.tin ?? '',
    vendor: ocrData.vendor_name ?? ocrData.vendor ?? entry.ocrData.vendor ?? '',
    invoiceNumber: ocrData.invoice_number ?? ocrData.invoiceNumber ?? entry.ocrData.invoiceNumber ?? '',
    date: formatDateForInput(ocrData.transaction_date ?? ocrData.date ?? entry.ocrData.date),
    location: ocrData.location ?? entry.location ?? '',
    confidence,
    file_path: ocrData.file_path,
    file_hash: ocrData.file_hash,
    file_type: ocrData.file_type,
    file_size_bytes: ocrData.file_size_bytes,
    rejection_code: ocrData.rejection_code,
    rejection_reason: ocrData.rejection_reason,
  }
  entry.merchantName = entry.ocrData.vendor
  entry.date = entry.ocrData.date
  entry.tin = entry.ocrData.tin
  entry.invoiceNumber = entry.ocrData.invoiceNumber
  entry.location = entry.ocrData.location
  entry.amount = Number(entry.ocrData.amount) || 0
  entry.tax = entry.ocrData.vat ? String(entry.ocrData.vat) : '0.00'
  entry.subtotal = (Math.max(Number(entry.amount || 0) - Number(entry.tax || 0), 0)).toFixed(2)
  if (Array.isArray(ocrData.items) && ocrData.items.length > 0) {
    entry.items = ocrData.items.map((item) => ({
      name: item.name || '',
      qty: Number(item.qty ?? item.quantity ?? 1) || 1,
      price: Number(item.price) || 0,
    }))
  }
  entry.thumbnail = entry.previews?.[0] || null
  emit('ocr-result', entry.ocrData)
  emit('update:modelValue', files.value)
}

function startPolling(entry) {
  if (!entry?.id) return
  const key = String(entry.id)
  if (pollTimers.has(key)) return
  const timer = setInterval(async () => {
    try {
      // Primary: reimbursement receipt endpoint (shared receipt table)
      let data = null
      let res = await apiFetch(`/api/serms/reimbursements/receipts/${entry.id}`, { method: 'GET' })
      if (res.ok) {
        const json = await res.json()
        data = json.data ?? json
      } else {
        // Fallback: liquidation receipt endpoint
        const alt = await apiFetch(`/api/serms/liquidations/receipts/${entry.id}`, { method: 'GET' })
        if (alt.ok) {
          const json = await alt.json()
          data = json.data ?? json
        } else {
          return
        }
      }

      const status = String(data.status || '').toLowerCase()
      if (status !== 'processing' && status !== 'pending-ocr' && status !== '') {
        clearInterval(timer)
        pollTimers.delete(key)

        if (status === 'failed') {
          entry.ocrStatus = 'failed'
          entry.rejectionCode = data.rejection_code || 'ocr_failed'
          entry.rejectionReason = data.rejection_reason || 'OCR processing failed. You can retry OCR.'
          emit('update:modelValue', files.value)
          emit('upload-error', { type: 'failed', message: entry.rejectionReason, code: entry.rejectionCode, entry })
          return
        }

        if (status === 'rejected') {
          const isDup =
            data.rejection_code === 'duplicate' ||
            data.is_duplicate === true ||
            String(data.rejection_reason || '').toLowerCase().includes('duplicate')
          entry.ocrStatus = 'rejected'
          entry.rejectionCode = data.rejection_code || (isDup ? 'duplicate' : 'quality_failed')
          entry.rejectionReason = data.rejection_reason || data.error || 'Receipt rejected.'
          if (isDup) {
            window.dispatchEvent(new CustomEvent('receipt-duplicate-detected', { detail: { receiptId: data.id, message: entry.rejectionReason } }))
          } else {
            qualityRejection.value = {
              entry,
              file: entry.pages?.[0] || null,
              rejectionCode: entry.rejectionCode,
              rejectionReason: entry.rejectionReason,
            }
          }
          emit('update:modelValue', files.value)
          emit('upload-error', { type: isDup ? 'duplicate' : 'quality', message: entry.rejectionReason, code: entry.rejectionCode, entry })
          return
        }

        // processed / flagged / pending — hydrate with OCR results
        hydrateEntry(entry, data)
      }
    } catch (e) {
      console.error('Polling error for liquidation receipt', entry.id, e)
    }
  }, 3000)
  pollTimers.set(key, timer)
}

async function retryOcr(entry) {
  if (!entry?.id) return
  entry.ocrStatus = 'processing'
  entry.rejectionCode = null
  entry.rejectionReason = null
  emit('update:modelValue', files.value)
  try {
    const res = await apiFetch(`/api/serms/liquidations/receipts/${entry.id}/retry-ocr`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message || 'Retry OCR failed')
    }
    startPolling(entry)
  } catch (e) {
    console.error('Retry OCR failed', e)
    entry.ocrStatus = 'failed'
    entry.rejectionReason = e.message || 'Retry OCR failed.'
    emit('update:modelValue', files.value)
    emit('upload-error', { type: 'failed', message: entry.rejectionReason, entry })
  }
}

async function simulateOCR(entry) {
  entry.ocrStatus = 'processing'
  emit('update:modelValue', files.value)
  try {
    const formData = new FormData()
    entry.pages.forEach(file => {
      formData.append('files[]', file)
    })
    const response = await apiFetch('/api/serms/liquidations/scan', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const rawMsg = errorBody.message || errorBody.msg || ''
      const hasDuplicate =
        errorBody?.errors?.file_hash ||
        (rawMsg && rawMsg.toLowerCase().includes('duplicate')) ||
        String(JSON.stringify(errorBody.errors || '')).toLowerCase().includes('duplicate')

      if (response.status === 422) {
        if (hasDuplicate) {
          entry.ocrStatus = 'rejected'
          entry.rejectionCode = 'duplicate'
          entry.rejectionReason = errorBody.message || errorBody?.errors?.file_hash?.[0] || 'Duplicate receipt detected.'
          window.dispatchEvent(new CustomEvent('receipt-duplicate-detected', { detail: { receiptId: entry.id, message: entry.rejectionReason } }))
          emit('update:modelValue', files.value)
          emit('upload-error', { type: 'duplicate', message: entry.rejectionReason, code: 'duplicate', entry })
          return
        }
        // Quality or other validation rejection
        entry.ocrStatus = 'rejected'
        entry.rejectionCode = errorBody.rejection_code || 'quality_failed'
        entry.rejectionReason = errorBody.rejection_reason || errorBody.message || 'Image quality is too low for accurate OCR.'
        qualityRejection.value = {
          entry,
          file: entry.pages?.[0] || null,
          rejectionCode: entry.rejectionCode,
          rejectionReason: entry.rejectionReason,
        }
        emit('update:modelValue', files.value)
        emit('upload-error', { type: 'quality', message: entry.rejectionReason, code: entry.rejectionCode, entry })
        return
      }

      throw new Error(rawMsg || 'OCR scan failed')
    }

    const result = await response.json()
    const ocrData = result.data

    // Backend now returns 201 with status=processing for async pipeline.
    // If still processing, keep spinner and start polling; else hydrate immediately (fallback/failed)
    const status = String(ocrData.status || '').toLowerCase()
    if (status === 'processing') {
      entry.id = ocrData.id
      entry.ocrData = { ...entry.ocrData, id: ocrData.id }
      emit('update:modelValue', files.value)
      startPolling(entry)
      return
    }

    if (status === 'failed' || status === 'rejected') {
      entry.id = ocrData.id
      entry.ocrStatus = status === 'failed' ? 'failed' : 'rejected'
      entry.rejectionCode = ocrData.rejection_code || (status === 'failed' ? 'ocr_failed' : 'quality_failed')
      entry.rejectionReason = ocrData.rejection_reason || `Receipt ${status}.`
      if (status === 'rejected') {
        const isDup =
          entry.rejectionCode === 'duplicate' ||
          String(entry.rejectionReason || '').toLowerCase().includes('duplicate')
        if (isDup) {
          window.dispatchEvent(new CustomEvent('receipt-duplicate-detected', { detail: { receiptId: entry.id, message: entry.rejectionReason } }))
        } else {
          qualityRejection.value = {
            entry,
            file: entry.pages?.[0] || null,
            rejectionCode: entry.rejectionCode,
            rejectionReason: entry.rejectionReason,
          }
        }
      }
      emit('update:modelValue', files.value)
      emit('upload-error', { type: status === 'failed' ? 'failed' : 'quality', message: entry.rejectionReason, code: entry.rejectionCode, entry })
      return
    }

    // Immediate data (should be rare — hydrates directly without polling)
    hydrateEntry(entry, ocrData)
  } catch (error) {
    console.error('OCR processing failed:', error)
    // Keep entry but surface as failed so user can retry; preserve file previews
    if (entry.ocrStatus === 'processing') entry.ocrStatus = 'failed'
    else entry.ocrStatus = 'failed'
    entry.rejectionReason = error.message || 'OCR processing failed.'
    entry.ocrData = entry.ocrData || buildPrefilledOcrData(entry.pages[0])
    emit('update:modelValue', files.value)
    emit('upload-error', { type: 'failed', message: entry.rejectionReason, entry })
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('click', handleWindowClick)
  pollTimers.forEach(clearInterval)
  pollTimers.clear()
})

defineExpose({ retryOcr, startPolling, hydrateEntry, cleanupUploadedFiles })

async function removeFile(index) {
  const entry = files.value[index]
  if (entry?.id && pollTimers.has(String(entry.id))) {
    clearInterval(pollTimers.get(String(entry.id)))
    pollTimers.delete(String(entry.id))
  }
  if (entry?.previews) {
    entry.previews.forEach(preview => {
      if (preview) URL.revokeObjectURL(preview)
    })
  }
  const receiptId = entry?.id
  files.value.splice(index, 1)
  emit('update:modelValue', files.value)

  if (receiptId && !String(receiptId).startsWith('temp-')) {
    try {
      await apiFetch(`/api/serms/reimbursements/receipts/${receiptId}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete removed receipt draft:', err)
    }
  }
}

async function cleanupUploadedFiles() {
  const idsToDelete = files.value
    .map(f => f?.id)
    .filter(id => id && !String(id).startsWith('temp-'))
  if (idsToDelete.length === 0) return

  await Promise.allSettled(
    idsToDelete.map(async (id) => {
      try {
        await apiFetch(`/api/serms/reimbursements/receipts/${id}`, { method: 'DELETE' })
      } catch (err) {
        console.error(`Failed to delete receipt draft ${id}:`, err)
      }
    })
  )
}

function onDrop(event) {
  isDragging.value = false
  const droppedFiles = Array.from(event.dataTransfer.files)
  if (droppedFiles.length > 1) {
    pendingDropFiles.value = droppedFiles
    showDropConfirmModal.value = true
  } else if (droppedFiles.length === 1) {
    processFiles(droppedFiles, 'single')
  }
}

function onFileInput(event) {
  processFiles(Array.from(event.target.files), uploadMode.value)
  event.target.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-4 font-sans">
    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      :multiple="uploadMode === 'multi'"
      class="hidden"
      @change="onFileInput"
    />

    <section v-if="files.length === 0" class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="mb-4">
        <h3 class="text-sm font-semibold text-slate-700">Upload Receipts</h3>
      </div>

      <div
        :class="[
          'flex min-h-[260px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          isDragging
            ? 'border-accent bg-accent/5'
            : 'border-slate-200 bg-slate-50/60',
        ]"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop.prevent="onDrop"
      >
        <span class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <UploadCloud class="h-8 w-8" />
        </span>
        <h4 class="font-heading text-base font-bold text-slate-800">
          Drag and drop receipt images here, or choose an option
        </h4>
        <p class="mt-1 text-sm text-slate-400">
          Supports: JPG, PNG, PDF (Max {{ maxSizeMb }}MB per file)
        </p>
        <p class="mt-4 flex items-center gap-2 text-sm font-bold text-danger">
          <AlertTriangle class="h-4 w-4" />
          At least 1 receipt is required to proceed
        </p>
        <div class="mt-6">
          <div ref="selectDropdownRef" class="relative inline-block text-left" @click.stop>
            <div>
              <button
                @click.stop="isDropdownOpen = !isDropdownOpen"
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-white transition-colors hover:bg-primary/90 focus:outline-none"
              >
                <UploadCloud class="h-3.5 w-3.5" />
                Select Files
                <ChevronDown class="w-3.5 h-3.5 ml-1 -mr-1" aria-hidden="true" />
              </button>
            </div>

            <transition
              enter-active-class="transition duration-100 ease-out"
              enter-from-class="transform scale-95 opacity-0"
              enter-to-class="transform scale-100 opacity-100"
              leave-active-class="transition duration-75 ease-in"
              leave-from-class="transform scale-100 opacity-100"
              leave-to-class="transform scale-95 opacity-0"
            >
              <div
                v-if="isDropdownOpen"
                class="absolute z-10 w-48 mt-2 origin-top right-1/2 translate-x-1/2 bg-white divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
              >
                <div class="px-1 py-1">
                  <button
                    class="group flex w-full items-center rounded-md px-2 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white"
                    @click="triggerFileInput('single'); isDropdownOpen = false"
                  >
                    <UploadCloud class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                    Single Receipt
                  </button>
                  <button
                    class="group flex w-full items-center rounded-md px-2 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white"
                    @click="triggerFileInput('multi'); isDropdownOpen = false"
                  >
                    <Layers class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                    Multi Receipt
                  </button>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-sm font-semibold text-slate-700">Receipts ({{ files.length }})</h3>
        </div>
        <div class="flex items-center gap-2">
          <div ref="addMoreDropdownRef" class="relative inline-block text-left" @click.stop>
            <div>
              <button
                @click.stop="isDropdownOpen = !isDropdownOpen"
                class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white border border-slate-300 px-3.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none"
              >
                <PlusCircle class="h-3.5 w-3.5" />
                Add More Receipts
                <ChevronDown class="w-3.5 h-3.5 ml-1 -mr-1" aria-hidden="true" />
              </button>
            </div>
            <transition
              enter-active-class="transition duration-100 ease-out"
              enter-from-class="transform scale-95 opacity-0"
              enter-to-class="transform scale-100 opacity-100"
              leave-active-class="transition duration-75 ease-in"
              leave-from-class="transform scale-100 opacity-100"
              leave-to-class="transform scale-95 opacity-0"
            >
              <div
                v-if="isDropdownOpen"
                class="absolute z-10 w-48 mt-2 origin-top-right right-0 bg-white divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
              >
                <div class="px-1 py-1">
                  <button
                    class="group flex w-full items-center rounded-md px-2 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white"
                    @click="triggerFileInput('single'); isDropdownOpen = false"
                  >
                    <UploadCloud class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                    Single Receipt
                  </button>
                  <button
                    class="group flex w-full items-center rounded-md px-2 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white"
                    @click="triggerFileInput('multi'); isDropdownOpen = false"
                  >
                    <Layers class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                    Multi Receipt
                  </button>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <div
        :class="[
          'mb-4 flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center transition-colors',
          isDragging ? 'border-accent bg-accent/5' : 'border-slate-200 bg-slate-50/60',
        ]"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop.prevent="onDrop"
      >
        <UploadCloud :class="['h-5 w-5', isDragging ? 'text-accent' : 'text-slate-400']" />
        <p class="mt-2 text-xs font-bold text-slate-500">
          Drop more receipts here
        </p>
      </div>
    </section>

    <Transition name="fade">
      <div
        v-if="localError"
        class="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
      >
        <span>{{ localError }}</span>
        <button class="hover:text-danger-700" type="button" @click="localError = null">
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </Transition>

    <TransitionGroup v-if="files.length > 0" name="file-list" tag="div" class="flex flex-col gap-3">
      <div
        v-for="(entry, index) in files"
        :key="entry.name + index"
        class="flex items-center gap-3 rounded-xl border border-accent/15 bg-accent-50/20 p-3"
      >
        <div class="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <template v-if="entry.previews?.length > 0">
            <div
              v-for="(preview, idx) in entry.previews.slice(0, 3)"
              :key="idx"
              class="absolute h-full w-full rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm transition-transform"
              :style="{ transform: `translate(${idx * 4}px, ${idx * 4}px)`, zIndex: 10 - idx }"
            >
              <img v-if="preview" :src="preview" class="h-full w-full object-cover" alt="" />
              <FileText v-else class="h-5 w-5 text-slate-300 m-auto mt-4" />
            </div>
            <div v-if="entry.previews.length > 3" class="absolute -bottom-1 -right-1 z-20 rounded bg-slate-800 px-1 text-[8px] font-bold text-white">
              +{{ entry.previews.length - 3 }}
            </div>
          </template>
          <FileText v-else class="h-5 w-5 text-slate-300" />

          <div v-if="entry.ocrStatus === 'processing'" class="absolute inset-0 z-30 pointer-events-none rounded-lg overflow-hidden">
            <div class="h-0.5 w-full bg-accent/80 animate-scan"></div>
            <div class="absolute inset-0 bg-accent/5"></div>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3">
            <p class="truncate text-xs font-bold text-slate-700">{{ entry.name }}</p>
            <span class="shrink-0 text-xs text-slate-400">{{ formatSize(entry.size) }}</span>
          </div>

          <div
            v-if="entry.ocrStatus === 'processing'"
            class="mt-1 flex items-center gap-1.5 text-xs text-slate-500"
          >
            <span
              class="h-2.5 w-2.5 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden="true"
            />
            Processing — OCR running...
          </div>
          <div v-else-if="entry.ocrStatus === 'rejected'" class="mt-1 flex flex-col gap-1">
            <span class="text-xs font-semibold text-amber-600">Rejected: {{ entry.rejectionReason || entry.rejectionCode || 'Image quality issue' }}</span>
            <span v-if="entry.rejectionCode === 'duplicate'" class="text-[10px] text-amber-500">Duplicate receipt detected.</span>
          </div>
          <div v-else-if="entry.ocrStatus === 'failed'" class="mt-1 flex flex-col gap-1">
            <span class="text-xs font-semibold text-danger">OCR failed: {{ entry.rejectionReason || 'Could not process. Please retry.' }}</span>
          </div>
          <div v-else-if="entry.ocrStatus === 'done' && entry.ocrData" class="mt-1 flex flex-wrap items-center gap-2">
            <span class="text-xs font-medium text-slate-600">
              PHP {{ Number(entry.ocrData.amount).toLocaleString() }}
            </span>
            <span v-if="entry.ocrData.confidence" class="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{{ entry.ocrData.confidence }}% confidence</span>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5">
          <button
            v-if="entry.ocrStatus === 'rejected' && entry.rejectionCode !== 'duplicate'"
            class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-50"
            type="button"
            @click="openQualityModalForEntry(entry)"
          >
            Review Warning
          </button>
          <button
            v-if="entry.ocrStatus === 'failed' || entry.ocrStatus === 'rejected'"
            class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100"
            type="button"
            @click="retryOcr(entry)"
          >
            <RefreshCw class="h-3.5 w-3.5" />
            Retry OCR
          </button>
          <button
            class="inline-flex h-8 w-fit shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-bold text-danger transition-colors hover:bg-red-100"
            type="button"
            @click="removeFile(index)"
          >
            <Trash2 class="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </TransitionGroup>

    <ConfirmModal
      :is-open="showDropConfirmModal"
      title="Multiple Files Dropped"
      message="You dropped multiple files. Are these separate receipts or pages of a single receipt?"
      confirm-text="Single Multi-Page Receipt"
      cancel-text="Separate Receipts"
      @confirm="handleConfirmDrop('multi')"
      @close="handleConfirmDrop('single')"
    />

    <ReceiptQualityRejectionModal
      :is-open="!!qualityRejection"
      :rejected-file="qualityRejection?.file ?? null"
      :rejection-code="qualityRejection?.rejectionCode ?? ''"
      :rejection-reason="qualityRejection?.rejectionReason ?? ''"
      :show-segmented-option="false"
      @retake="handleRetake"
      @continue-anyway="handleContinueAnyway"
    />
  </div>
</template>

<style scoped>
.file-list-enter-active,
.file-list-leave-active {
  transition: opacity 0.15s linear;
}

.file-list-enter-from,
.file-list-leave-to {
  opacity: 0;
}

@keyframes scan {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateY(56px);
    opacity: 0;
  }
}

.animate-scan {
  animation: scan 1.5s linear infinite;
}
</style>
