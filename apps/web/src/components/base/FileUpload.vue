<script setup>
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue'
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
import {
  formatDateForInput,
  formatSplitReceiptsToastMessage,
  hasSplitReceipts,
  isDuplicateOcrResponse,
  markOcrReturnedAndGetMissingWarning,
  normalizeDiscountType,
  normalizeVatClassification,
  resolveSplitSegmentIndices,
} from '../../utils/receiptUtils'
import { useToast } from '../../composables/useToast'
import { isOcrOfflineFailure } from '../../utils/ocrErrors'
import ReceiptQualityRejectionModal from '../reimbursements/ReceiptQualityRejectionModal.vue'


const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  accept: { type: String, default: 'image/*,.pdf' },
  maxSizeMb: { type: Number, default: 2 },
})

const emit = defineEmits(['update:modelValue', 'ocr-result', 'upload-error'])
const { addToast } = useToast()

function notifyMissingFieldsAfterTick(entry) {
  nextTick(() => {
    const warning = markOcrReturnedAndGetMissingWarning(entry)
    if (warning) {
      addToast({ message: warning, type: 'warning' })
    }
  })
}

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

function handleRemoveDuplicateEvent(event) {
  const targetId = event?.detail?.receiptId
  if (!targetId) return
  const index = files.value.findIndex(
    (entry) => String(entry?.id ?? '') === String(targetId) || String(entry?.localId ?? '') === String(targetId),
  )
  if (index !== -1) {
    removeFile(index)
  }
}

function handleOpenReceiptUpload() {
  triggerFileInput(uploadMode.value || 'single')
}

function dispatchDuplicateDetected(entry) {
  window.dispatchEvent(
    new CustomEvent('receipt-duplicate-detected', {
      detail: {
        receiptId: entry.id || entry.localId,
        source: 'liquidation',
        message: entry.rejectionReason,
      },
    }),
  )
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
  window.addEventListener('remove-duplicate-receipt', handleRemoveDuplicateEvent)
  window.addEventListener('open-receipt-upload', handleOpenReceiptUpload)
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
  clearQualityRejection()
}

async function handleRejectedEntry(
  entry,
  { isDuplicate = false, rejectionCode = 'quality_failed', rejectionReason = 'Receipt rejected.' } = {},
) {
  entry.ocrStatus = 'rejected'
  entry.rejectionCode = rejectionCode
  entry.rejectionReason = rejectionReason
  if (isDuplicate) {
    dispatchDuplicateDetected(entry)
  } else {
    qualityRejection.value = {
      entry,
      file: entry.pages?.[0] || null,
      rejectionCode,
      rejectionReason,
    }
  }
  emit('upload-error', {
    type: isDuplicate ? 'duplicate' : 'quality',
    message: rejectionReason,
    code: rejectionCode,
    entry,
  })

  const idx = files.value.findIndex(
    (f) => f === entry || (entry.localId && f.localId === entry.localId) || (entry.id && f.id === entry.id),
  )
  if (idx !== -1) {
    await removeFile(idx)
  } else if (entry.id && !String(entry.id).startsWith('temp-')) {
    await apiFetch(`/api/serms/reimbursements/receipts/${entry.id}`, { method: 'DELETE' }).catch(() => {})
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

function createUploadEntry(pages, displayName, size, existingPreviews = null) {
  const previews =
    Array.isArray(existingPreviews) && existingPreviews.length === pages.length
      ? existingPreviews
      : pages.map(f => (f?.type?.startsWith('image/') ? URL.createObjectURL(f) : null))
  return {
    localId: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    pages,
    name: displayName,
    fileName: displayName,
    fileType: pages[0]?.type || '',
    size,
    previews,
    thumbnail: previews[0] || null,
    ocrStatus: 'idle',
    hasOcrReturned: false,
    merchantName: '',
    date: '',
    tin: '',
    invoiceNumber: '',
    location: '',
    category: '',
    categoryId: null,
    eventType: '',
    currency: 'PHP',
    vatClassification: 'vat',
    discountType: 'none',
    discountAmount: '0.00',
    subtotal: '0.00',
    tax: '0.00',
    amount: 0,
    items: [],
    ocrData: buildPrefilledOcrData(pages[0]),
  }
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
    files.value.push(createUploadEntry([file], file.name, file.size))
    simulateOCR(files.value[files.value.length - 1])
  } else {
    // Multi Receipt: all selected files (up to 6 segments) sent together to OCR
    const segmentFiles = validFiles.slice(0, 6)
    const displayName = segmentFiles.length > 1
      ? `Multi-page Receipt (${segmentFiles.length} pages)`
      : segmentFiles[0].name
    const totalSize = segmentFiles.reduce((acc, f) => acc + f.size, 0)
    files.value.push(createUploadEntry(segmentFiles, displayName, totalSize))
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
  entry.hasOcrReturned = true
  entry.id = ocrData.id
  // confidence from pipeline is 0-1; legacy fallback was 0-100
  let rawConf = ocrData.ocr_confidence_score ?? ocrData.confidence ?? 85
  if (rawConf > 0 && rawConf <= 1) rawConf = rawConf * 100
  const confidence = Math.round(rawConf)
  const rawDiscount = Number(ocrData.discount_amount ?? ocrData.discountAmount ?? entry.discountAmount ?? 0) || 0
  const discountType = normalizeDiscountType(ocrData.discount_type ?? ocrData.discountType ?? entry.discountType, rawDiscount)
  const vatClassification = normalizeVatClassification(ocrData.vat_classification ?? entry.vatClassification)
  const categoryId = ocrData.expense_category_id ? Number(ocrData.expense_category_id) : (entry.categoryId ?? null)
  const eventType = ocrData.event_type ?? entry.eventType ?? ''

  entry.ocrData = {
    id: ocrData.id,
    amount: ocrData.total_amount ?? ocrData.amount ?? entry.ocrData?.amount ?? '',
    vat: ocrData.vat_amount ?? ocrData.vat ?? entry.ocrData?.vat ?? '',
    tin: ocrData.tin ?? entry.ocrData?.tin ?? '',
    vendor: ocrData.vendor_name ?? ocrData.vendor ?? entry.ocrData?.vendor ?? '',
    invoiceNumber: ocrData.invoice_number ?? ocrData.invoiceNumber ?? entry.ocrData?.invoiceNumber ?? '',
    date: formatDateForInput(ocrData.transaction_date ?? ocrData.date ?? entry.ocrData?.date),
    location: ocrData.location ?? entry.location ?? '',
    expense_category_id: categoryId,
    event_type: eventType,
    discount_amount: rawDiscount > 0 ? rawDiscount.toFixed(2) : '0.00',
    discount_type: discountType,
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
  entry.categoryId = categoryId
  entry.category = ocrData.category?.name ?? entry.category ?? ''
  entry.eventType = eventType
  entry.vatClassification = vatClassification
  entry.currency = ocrData.currency || entry.currency || 'PHP'
  entry.discountType = discountType
  entry.discountAmount = entry.ocrData.discount_amount
  entry.amount = Number(entry.ocrData.amount) || 0
  entry.tax = vatClassification === 'non-vat'
    ? '0.00'
    : (entry.ocrData.vat !== '' && entry.ocrData.vat != null ? String(entry.ocrData.vat) : '0.00')
  entry.subtotal = ocrData.subtotal != null && ocrData.subtotal !== ''
    ? Number(ocrData.subtotal).toFixed(2)
    : (Math.max(Number(entry.amount || 0) - Number(entry.tax || 0), 0)).toFixed(2)
  entry.ocrData.subtotal = entry.subtotal
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
  notifyMissingFieldsAfterTick(entry)
}

function buildGroupMeta(groupPages, payload, indexFallback) {
  const displayName =
    groupPages.length > 1
      ? `Multi-page Receipt (${groupPages.length} pages)`
      : (groupPages[0]?.name || payload?.vendor_name || `Receipt-${payload?.id ?? indexFallback + 1}`)
  const size = groupPages.reduce((acc, f) => acc + (f?.size || 0), 0)
  return { displayName, size }
}

async function applySingleOcrOutcome(targetEntry, payload) {
  if (payload?.id) targetEntry.id = payload.id
  const status = String(payload?.status || '').toLowerCase()
  const reason = payload?.rejection_reason || payload?.error || ''

  if (
    status === 'failed' ||
    (status === 'rejected' &&
      isOcrOfflineFailure({
        status,
        rejectionCode: payload?.rejection_code,
        rejectionReason: reason,
      }))
  ) {
    targetEntry.ocrStatus = 'failed'
    targetEntry.rejectionCode = payload?.rejection_code || 'ocr_failed'
    targetEntry.rejectionReason =
      reason || 'OCR processing failed. You can retry OCR.'
    emit('update:modelValue', files.value)
    emit('upload-error', {
      type: 'failed',
      message: targetEntry.rejectionReason,
      code: targetEntry.rejectionCode,
      entry: targetEntry,
    })
    return
  }

  if (status === 'rejected') {
    const isDup = isDuplicateOcrResponse(payload)
    await handleRejectedEntry(targetEntry, {
      isDuplicate: isDup,
      rejectionCode:
        payload?.rejection_code || (isDup ? 'duplicate' : 'quality_failed'),
      rejectionReason: reason || 'Receipt rejected.',
    })
    return
  }

  hydrateEntry(targetEntry, payload)
}

async function applySplitEntries(entry, data) {
  const allPayloads = [data, ...data.split_receipts]
  addToast({
    message: formatSplitReceiptsToastMessage(allPayloads.length),
    type: 'info',
  })

  const origPages = Array.isArray(entry.pages) ? entry.pages : []
  const origPreviews = Array.isArray(entry.previews) ? entry.previews : []
  const segmentIndexGroups = resolveSplitSegmentIndices(allPayloads, origPages.length)

  const entryIdx = files.value.findIndex(
    (f) =>
      f === entry ||
      (entry.localId && f.localId === entry.localId) ||
      (entry.id != null && f.id === entry.id),
  )
  const primaryEntry = entryIdx !== -1 ? files.value[entryIdx] : entry

  const targetEntries = []
  const newEntries = []

  allPayloads.forEach((payload, i) => {
    const indices = segmentIndexGroups[i] || []
    const groupPages = indices.map((idx) => origPages[idx]).filter(Boolean)
    const groupPreviews = indices
      .map((idx) => origPreviews[idx])
      .filter((u) => u !== undefined)
    const { displayName, size } = buildGroupMeta(groupPages, payload, i)

    if (i === 0) {
      primaryEntry.pages = groupPages
      primaryEntry.previews =
        groupPreviews.length === groupPages.length
          ? groupPreviews
          : groupPages.map((f) =>
              f?.type?.startsWith('image/') ? URL.createObjectURL(f) : null,
            )
      primaryEntry.name = displayName
      primaryEntry.fileName = displayName
      primaryEntry.fileType = groupPages[0]?.type || primaryEntry.fileType || ''
      primaryEntry.size = origPages.length > 0 ? size : primaryEntry.size
      primaryEntry.thumbnail = primaryEntry.previews[0] || null
      if (primaryEntry.previews.length > 1) {
        primaryEntry.isMultiReceipt = true
        primaryEntry.images = primaryEntry.previews
      } else {
        primaryEntry.isMultiReceipt = false
        primaryEntry.images = undefined
      }
      if (payload?.id) primaryEntry.id = payload.id
      targetEntries.push(primaryEntry)
    } else {
      const created = createUploadEntry(
        groupPages,
        displayName,
        size,
        groupPreviews.length === groupPages.length ? groupPreviews : null,
      )
      if (payload?.id) created.id = payload.id
      if (created.previews.length > 1) {
        created.isMultiReceipt = true
        created.images = created.previews
      } else {
        created.isMultiReceipt = false
      }
      newEntries.push(created)
      targetEntries.push(created)
    }
  })

  if (entryIdx !== -1) {
    files.value.splice(entryIdx + 1, 0, ...newEntries)
  } else {
    files.value.push(primaryEntry, ...newEntries)
  }
  emit('update:modelValue', files.value)

  for (let i = 0; i < allPayloads.length; i++) {
    await applySingleOcrOutcome(targetEntries[i], allPayloads[i])
  }
}

async function resolveOcrPayload(entry, data) {
  if (hasSplitReceipts(data)) {
    await applySplitEntries(entry, data)
    return
  }
  await applySingleOcrOutcome(entry, data)
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
      if (pollTimers.get(key) !== timer) return
      if (res.ok) {
        const json = await res.json()
        data = json.data ?? json
      } else {
        // Fallback: liquidation receipt endpoint
        const alt = await apiFetch(`/api/serms/liquidations/receipts/${entry.id}`, { method: 'GET' })
        if (pollTimers.get(key) !== timer) return
        if (alt.ok) {
          const json = await alt.json()
          data = json.data ?? json
        } else {
          return
        }
      }

      if (pollTimers.get(key) !== timer) return
      const status = String(data.status || '').toLowerCase()
      if (status !== 'processing' && status !== 'pending-ocr' && status !== '') {
        clearInterval(timer)
        pollTimers.delete(key)

        await resolveOcrPayload(entry, data)
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
  entry.hasOcrReturned = false
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
        const reason422 = errorBody.rejection_reason || rawMsg || ''
        if (
          isOcrOfflineFailure({
            rejectionCode: errorBody.rejection_code,
            rejectionReason: reason422,
          })
        ) {
          entry.ocrStatus = 'failed'
          entry.rejectionCode = errorBody.rejection_code || 'ocr_failed'
          entry.rejectionReason = reason422 || 'OCR processing failed. You can retry OCR.'
          emit('update:modelValue', files.value)
          emit('upload-error', { type: 'failed', message: entry.rejectionReason, code: entry.rejectionCode, entry })
          return
        }
        const isDuplicate422 =
          hasDuplicate ||
          errorBody?.rejection_code === 'duplicate' ||
          errorBody?.is_duplicate === true ||
          String(errorBody?.rejection_reason || '').toLowerCase().includes('duplicate')
        if (isDuplicate422) {
          await handleRejectedEntry(entry, {
            isDuplicate: true,
            rejectionCode: 'duplicate',
            rejectionReason:
              errorBody.rejection_reason ||
              errorBody.message ||
              errorBody?.errors?.file_hash?.[0] ||
              'Duplicate receipt detected.',
          })
          return
        }
        await handleRejectedEntry(entry, {
          isDuplicate: false,
          rejectionCode: errorBody.rejection_code || 'quality_failed',
          rejectionReason:
            errorBody.rejection_reason ||
            errorBody.message ||
            'Image quality is too low for accurate OCR.',
        })
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

    await resolveOcrPayload(entry, ocrData)
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
  window.removeEventListener('remove-duplicate-receipt', handleRemoveDuplicateEvent)
  window.removeEventListener('open-receipt-upload', handleOpenReceiptUpload)
  pollTimers.forEach(clearInterval)
  pollTimers.clear()
})

defineExpose({ retryOcr, startPolling, hydrateEntry, cleanupUploadedFiles })

async function removeFile(index) {
  if (index < 0 || index >= files.value.length) return
  const entry = files.value[index]
  if (entry?.id && pollTimers.has(String(entry.id))) {
    clearInterval(pollTimers.get(String(entry.id)))
    pollTimers.delete(String(entry.id))
  }
  const isBlobUsedElsewhere = (url) => {
    if (!url) return false
    return files.value.some((other, otherIdx) => {
      if (otherIdx === index || other === entry) return false
      if (other.thumbnail === url) return true
      return Array.isArray(other.previews) && other.previews.includes(url)
    })
  }
  if (entry?.previews && typeof URL.revokeObjectURL === 'function') {
    entry.previews.forEach(preview => {
      if (preview && !isBlobUsedElsewhere(preview)) URL.revokeObjectURL(preview)
    })
  }
  if (
    entry?.thumbnail?.startsWith('blob:') &&
    typeof URL.revokeObjectURL === 'function' &&
    !isBlobUsedElsewhere(entry.thumbnail)
  ) {
    URL.revokeObjectURL(entry.thumbnail)
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
        :key="entry.localId || entry.id || (entry.name + index)"
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
            v-if="entry.ocrStatus === 'failed'"
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
      @close="clearQualityRejection"
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
