<script setup>
import { ref, watch } from "vue";
import SbsiReportDocumentEditor from "@/components/base/SbsiReportDocumentEditor.vue";

const props = defineProps({
  reportFile: {
    type: [File, String, Object],
    default: null,
  },
  reportTemplateData: {
    type: Object,
    default: null,
  },
  userComment: {
    type: String,
    default: "",
  },
  receipts: {
    type: Array,
    default: () => [],
  },
  totalAmount: {
    type: [Number, String],
    default: 0,
  },
  purpose: {
    type: String,
    default: "",
  },
  recordId: {
    type: [Number, String],
    default: null,
  },
});

const emit = defineEmits([
  "update:reportFile",
  "update:reportTemplateData",
  "update:userComment",
  "update:purpose",
]);

const editorMode = ref(
  props.reportTemplateData?.mode === "manual" || (props.reportFile && !props.reportTemplateData)
    ? "manual"
    : "template",
);
const lastTemplatePayload = ref(props.reportTemplateData || null);

watch(
  () => [props.reportFile, props.reportTemplateData],
  ([file, tpl]) => {
    if (tpl?.mode === "manual" || (file && !tpl)) {
      editorMode.value = "manual";
    } else if (tpl && tpl.mode !== "manual") {
      editorMode.value = "template";
    }
  },
);

function onTemplateModelUpdate(val) {
  lastTemplatePayload.value = val;
  if (editorMode.value === "manual") return;
  emit("update:reportTemplateData", { ...val, mode: "template" });
}

function handleEditorClick(e) {
  const target = e.target;
  if (target?.closest?.('[data-testid="mode-manual"]')) {
    editorMode.value = "manual";
    emit("update:reportTemplateData", { ...(props.reportTemplateData || {}), mode: "manual" });
  } else if (target?.closest?.('[data-testid="mode-template"]')) {
    editorMode.value = "template";
    if (props.reportFile) emit("update:reportFile", null);
    if (lastTemplatePayload.value) {
      emit("update:reportTemplateData", { ...lastTemplatePayload.value, mode: "template" });
    } else if (props.reportTemplateData) {
      emit("update:reportTemplateData", { ...props.reportTemplateData, mode: "template" });
    }
  }
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
    <!-- Report Attachment -->
    <section class="card p-6 flex flex-col gap-4 relative z-20 md:col-span-2">
      <h3 class="text-base font-bold text-primary">
        Report Attachment
        <span class="text-danger">*</span>
      </h3>

      <div @click="handleEditorClick">
        <SbsiReportDocumentEditor
          type="reimbursement"
          :model-value="reportTemplateData"
          :report-file="reportFile"
          :receipts="receipts"
          :total-amount="totalAmount"
          :purpose="purpose"
          :record-id="recordId"
          @update:model-value="onTemplateModelUpdate"
          @update:report-file="$emit('update:reportFile', $event)"
          @update:purpose="$emit('update:purpose', $event)"
        />
      </div>
    </section>

    <!-- Comments / Notes (Optional) -->
    <section class="card p-6 flex flex-col gap-2 md:col-span-2 relative z-10">
      <div class="flex items-center justify-between">
        <label
          for="reimbursement-user-comment"
          class="text-base font-bold text-primary"
        >
          Comments / Notes <span class="text-xs font-normal text-slate-400">(Optional)</span>
        </label>
        <span
          class="text-xs font-medium text-slate-400"
          :class="{ 'text-danger': (userComment || '').length >= 1000 }"
        >
          {{ (userComment || "").length }} / 1000
        </span>
      </div>
      <p class="text-[11px] text-slate-400">
        Add any additional notes, explanation, or context for the reviewer.
      </p>
      <textarea
        id="reimbursement-user-comment"
        :value="userComment"
        @input="$emit('update:userComment', $event.target.value)"
        class="input min-h-[96px] resize-none text-sm leading-relaxed"
        placeholder="Add optional notes or context for the reviewer..."
        maxlength="1000"
        rows="3"
      ></textarea>
    </section>
  </div>
</template>
