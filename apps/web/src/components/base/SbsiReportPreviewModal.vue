<script setup>
import { ref, watch, computed, onBeforeUnmount } from "vue";
import { Download, X } from "lucide-vue-next";
import BaseModal from "@/components/base/BaseModal.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import { generateSbsiReportPdfBytes, downloadSbsiReportPdf } from "@/utils/sbsiPdfGenerator";

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  templateData: { type: Object, default: null },
  fallbackType: { type: String, default: "reimbursement" },
  record: { type: Object, default: null },
  fileUrl: { type: String, default: null },
});
const emit = defineEmits(["close"]);

const blobUrl = ref(null);
const error = ref("");

// Preview is the real generated PDF, so what the user sees is byte-for-byte what is uploaded.
const resolvedData = computed(() =>
  props.templateData ? { ...props.templateData, type: props.templateData.type || props.fallbackType } : null,
);

const isWordDoc = computed(() => /\.docx?(\?|#|$)/i.test(props.fileUrl || ""));
const viewerSrc = computed(() => blobUrl.value || (!isWordDoc.value ? props.fileUrl : null));

function revoke() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = null;
}

function render() {
  revoke();
  error.value = "";
  if (!props.isOpen || !resolvedData.value) return;
  try {
    const bytes = generateSbsiReportPdfBytes(resolvedData.value);
    blobUrl.value = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  } catch (e) {
    console.error("SBSI report preview failed:", e);
    error.value = "Unable to render the report preview. Please review the template fields and try again.";
  }
}

watch(() => [props.isOpen, props.templateData], render, { deep: true, immediate: true });
onBeforeUnmount(revoke);

function download() {
  if (resolvedData.value) {
    try {
      downloadSbsiReportPdf(resolvedData.value, props.record?.id ? `SBSI-${resolvedData.value.type}-${props.record.id}.pdf` : null);
    } catch {
      error.value = "Download failed. Please try again.";
    }
  } else if (props.fileUrl) {
    window.open(props.fileUrl, "_blank", "noopener");
  }
}
</script>

<template>
  <BaseModal
    :is-open="isOpen"
    max-width-class="max-w-4xl"
    content-class="flex h-[90vh] flex-col"
    title="Report Preview"
    description="Preview of the attachment report"
    @close="emit('close')"
  >
    <div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
      <h3 class="text-base font-bold text-primary">Report Preview</h3>
      <div class="flex gap-2">
        <BaseButton data-testid="preview-download" variant="primary" size="sm" :disabled="!resolvedData && !fileUrl" @click="download">
          <Download class="h-4 w-4" /> Download PDF
        </BaseButton>
        <BaseButton data-testid="preview-close" variant="secondary" size="sm" @click="emit('close')">
          <X class="h-4 w-4" /> Close
        </BaseButton>
      </div>
    </div>
    <div class="min-h-0 flex-1 bg-slate-100">
      <p v-if="error" class="p-6 text-sm text-danger" role="alert">{{ error }}</p>
      <iframe
        v-else-if="viewerSrc"
        :src="viewerSrc"
        title="Attachment report preview"
        class="h-full w-full border-0"
        data-testid="preview-frame"
      />
      <p v-else-if="isWordDoc" class="p-6 text-sm text-slate-600" data-testid="preview-unavailable">
        Word documents cannot be previewed inline. Use Download to open the file.
      </p>
      <p v-else class="p-6 text-sm text-slate-500">No report available to preview.</p>
    </div>
  </BaseModal>
</template>

