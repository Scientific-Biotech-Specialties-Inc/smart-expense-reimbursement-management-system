<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from '@/composables/useToast';
import { AlertTriangle, RefreshCw } from 'lucide-vue-next';

const { addToast } = useToast();
const router = useRouter();

const showModal = ref(false);
const similarityScore = ref(0);
const duplicateReceiptId = ref(null);
const customMessage = ref('');

onMounted(() => {
  window.addEventListener('receipt-duplicate-detected', handleDuplicateEvent);
});

onUnmounted(() => {
  window.removeEventListener('receipt-duplicate-detected', handleDuplicateEvent);
});

function handleDuplicateEvent(e) {
  similarityScore.value = e.detail?.similarityScore || 1.0;
  duplicateReceiptId.value = e.detail?.receiptId || null;
  customMessage.value = e.detail?.message || '';
  showModal.value = true;
  
  addToast({ 
    message: customMessage.value || 'Duplicate receipt detected.', 
    type: 'error' 
  });
}

function handleCancel() {
  showModal.value = false;

  // Dispatch an event to remove the rejected duplicate from the UI
  if (duplicateReceiptId.value) {
    window.dispatchEvent(new CustomEvent('remove-duplicate-receipt', {
      detail: { receiptId: duplicateReceiptId.value }
    }));
  }

  if (router) {
    router.push('/reimbursements');
  }
}

function handleUploadNew() {
  showModal.value = false;
  
  // Dispatch an event to remove the rejected duplicate from the UI
  if (duplicateReceiptId.value) {
    window.dispatchEvent(new CustomEvent('remove-duplicate-receipt', {
      detail: { receiptId: duplicateReceiptId.value }
    }));
  }

  // Dispatch a global event so that any active view (My Expenses, Reimbursements)
  // can intercept this and reopen their specific upload dialog.
  window.dispatchEvent(new CustomEvent('open-receipt-upload'));
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="showModal"
      class="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div class="flex items-center gap-3 text-danger">
            <AlertTriangle class="w-5 h-5" />
            <h2 class="text-xl font-bold font-poppins">Duplicate Detected</h2>
          </div>
        </div>
        
        <div class="p-6 text-slate-600 text-sm">
          <p class="mb-4" v-if="customMessage">
            {{ customMessage }}
          </p>
          <p class="mb-4" v-else>
            The receipt you just uploaded appears to be a duplicate of an existing record 
            <span v-if="similarityScore > 0 && similarityScore < 1.0">(Similarity Score: <strong>{{ (similarityScore * 100).toFixed(0) }}%</strong>)</span>.
          </p>
          <p>
            This receipt has been flagged and rejected. It is strictly prohibited to upload the same receipt twice. You must upload a new receipt.
          </p>
        </div>
        
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button type="button" @click="handleCancel" class="btn btn-secondary px-4 py-2">
            Cancel
          </button>
          <button type="button" @click="handleUploadNew" class="btn btn-primary flex items-center gap-2">
            <RefreshCw class="w-4 h-4" />
            Upload New One
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
