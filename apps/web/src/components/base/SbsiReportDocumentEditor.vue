<script setup>
import { ref, computed, watch, h } from "vue";
import {
  Maximize2,
  Minimize2,
  Eye,
  UploadCloud,
  FileText,
  X,
  Plus,
  Trash2,
  CalendarDays,
} from "lucide-vue-next";
import BaseButton from "@/components/base/BaseButton.vue";
import SbsiReportPreviewModal from "@/components/base/SbsiReportPreviewModal.vue";
import { useToast } from "@/composables/useToast";
import sbsiLogo from "@/assets/sbsi_logo.png";
import {
  SBSI_FOOTER_CONTACT,
  buildTemplateParagraphs,
  createDefaultTemplateData,
  formatMediumDate,
  formatPhp,
  syncTemplateWithContext,
} from "@/utils/sbsiReportTemplateUtils";

const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: (v) => ["reimbursement", "cash-advance", "liquidation"].includes(v),
  },
  modelValue: { type: Object, default: null },
  reportFile: { type: [File, String, Object], default: null },
  receipts: { type: Array, default: () => [] },
  totalAmount: { type: [Number, String], default: 0 },
  allocatedAmount: { type: [Number, String], default: 0 },
  utilizedAmount: { type: [Number, String], default: 0 },
  variance: { type: Number, default: 0 },
  purpose: { type: String, default: "" },
  disbursementDate: { type: String, default: "" },
  liquidationDeadline: { type: String, default: "" },
  recordId: { type: [Number, String], default: null },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:modelValue",
  "update:reportFile",
  "update:purpose",
  "update:totalAmount",
  "update:disbursementDate",
  "update:liquidationDeadline",
]);

const { addToast } = useToast();
const MAX_BYTES = 2 * 1024 * 1024;
const VALID_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const PILL =
  "inline-block rounded-sm border-b border-dashed border-[#004AAD] bg-blue-50 px-1 font-medium text-[#004AAD] outline-none transition-colors focus:border-solid focus:bg-blue-100";
const BLUE = "#004AAD";

const editable = computed(() => !props.disabled && !props.readonly);
const isCashAdvance = computed(() => props.type === "cash-advance");

// Mode: template by default; manual only when a pre-existing file arrives without template data.
const mode = ref(props.reportFile && !props.modelValue ? "manual" : "template");
const manualFile = ref(null);
const dragging = ref(false);
const fileInput = ref(null);
const expanded = ref(false);
const previewOpen = ref(false);

const context = () => ({
  receipts: props.receipts,
  totalAmount: props.totalAmount === "" ? 0 : props.totalAmount,
  allocatedAmount: props.allocatedAmount,
  utilizedAmount: props.utilizedAmount,
  variance: props.variance,
  purpose: props.purpose,
  disbursementDate: props.disbursementDate,
  liquidationDeadline: props.liquidationDeadline,
  recordId: props.recordId,
});

const templateData = ref(
  createDefaultTemplateData(props.type, { ...context(), existingData: props.modelValue }),
);
let lastEmitted = "";

const doc = computed(() => buildTemplateParagraphs(templateData.value));
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Single deep watcher: normalise the CA total, publish the model, and mirror shared fields upward.
watch(
  templateData,
  (data) => {
    if (isCashAdvance.value) {
      const sum = round2(data.breakdownItems.reduce((s, i) => s + (Number(i.amount) || 0), 0));
      if (sum !== data.totalAmount) {
        data.totalAmount = sum;
        return; // re-triggers once with the normalised value
      }
      if (sum !== round2(props.totalAmount)) emit("update:totalAmount", sum);
    }
    const json = JSON.stringify(data);
    if (json !== lastEmitted) {
      lastEmitted = json;
      emit("update:modelValue", JSON.parse(json));
    }
    if (data.purpose !== props.purpose) emit("update:purpose", data.purpose);
    if (props.type !== "reimbursement" && data.disbursementDate !== props.disbursementDate) {
      emit("update:disbursementDate", data.disbursementDate);
    }
    if (isCashAdvance.value && data.liquidationDeadline !== props.liquidationDeadline) {
      emit("update:liquidationDeadline", data.liquidationDeadline);
    }
  },
  { deep: true, immediate: true },
);

watch(
  () => [
    props.receipts,
    props.totalAmount,
    props.allocatedAmount,
    props.utilizedAmount,
    props.variance,
    props.purpose,
    props.disbursementDate,
    props.liquidationDeadline,
    props.recordId,
  ],
  () => {
    templateData.value = syncTemplateWithContext(templateData.value, context());
  },
  { deep: true },
);

watch(
  () => props.modelValue,
  (incoming) => {
    if (!incoming || JSON.stringify(incoming) === lastEmitted) return;
    templateData.value = createDefaultTemplateData(props.type, { ...context(), existingData: incoming });
  },
  { deep: true },
);

watch(
  () => props.type,
  (type) => {
    templateData.value = createDefaultTemplateData(type, context());
  },
);

function setMode(next) {
  if (props.disabled || mode.value === next) return;
  mode.value = next;
  if (next === "template" && manualFile.value) {
    manualFile.value = null;
    emit("update:reportFile", null);
  }
}

function acceptFile(file) {
  if (!file) return;
  const okType = VALID_MIMES.includes(file.type) || /\.(pdf|docx?)$/i.test(file.name || "");
  if (!okType) {
    addToast({ message: "Invalid file type. Only PDF, DOC, and DOCX are allowed for the report.", type: "error" });
    return;
  }
  if (file.size > MAX_BYTES) {
    addToast({ message: `${file.name} exceeds the 2MB size limit.`, type: "error" });
    return;
  }
  manualFile.value = file;
  emit("update:reportFile", file);
}

function onDrop(e) {
  dragging.value = false;
  if (!props.disabled) acceptFile(e.dataTransfer?.files?.[0]);
}

function onSelect(e) {
  acceptFile(e.target.files?.[0]);
  if (e.target) e.target.value = "";
}

function removeManual() {
  manualFile.value = null;
  emit("update:reportFile", null);
}

const manualName = computed(() => {
  const f = manualFile.value || props.reportFile;
  if (!f) return "";
  return typeof f === "string" ? f.split("/").pop() : f.name || "Attached Report";
});

function addRow() {
  templateData.value.breakdownItems.push({ description: "", amount: 0 });
}
function removeRow(i) {
  if (templateData.value.breakdownItems.length > 1) templateData.value.breakdownItems.splice(i, 1);
}

const fieldWidth = (value, placeholder) => `${Math.max(String(value || placeholder || "").length + 1, 8)}ch`;

// Inline Medium-Date pill with an invisible native date input layered on top as the picker trigger.
const DatePill = {
  props: { modelValue: { type: String, default: "" }, editable: { type: Boolean, default: true } },
  emits: ["update:modelValue"],
  setup(p, { emit: e }) {
    return () =>
      h("span", { class: `${PILL} relative cursor-pointer whitespace-nowrap` }, [
        formatMediumDate(p.modelValue),
        p.editable &&
          h("input", {
            type: "date",
            value: p.modelValue || "",
            "aria-label": "Change date",
            class: "absolute inset-0 h-full w-full cursor-pointer opacity-0",
            onInput: (ev) => e("update:modelValue", ev.target.value),
            onClick: (ev) => {
              try {
                ev.target.showPicker?.();
              } catch {
                /* picker unsupported; native input still works */
              }
            },
          }),
      ]);
  },
};

const CHEVRON = "polygon(100% 0, 50% 0, 0 50%, 50% 100%, 100% 100%, 50% 50%)";
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="sbsi-report-editor">
    <!-- Mode switcher -->
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Report attachment mode">
      <BaseButton
        data-testid="mode-template"
        aria-label="Use Premade Template"
        :aria-pressed="mode === 'template'"
        :variant="mode === 'template' ? 'primary' : 'outline'"
        size="sm"
        :disabled="disabled"
        @click="setMode('template')"
      >
        <FileText class="h-4 w-4" /> Use Premade Template
      </BaseButton>
      <BaseButton
        data-testid="mode-manual"
        aria-label="Upload Document Manually"
        :aria-pressed="mode === 'manual'"
        :variant="mode === 'manual' ? 'primary' : 'outline'"
        size="sm"
        :disabled="disabled"
        @click="setMode('manual')"
      >
        <UploadCloud class="h-4 w-4" /> Upload Document Manually
      </BaseButton>
    </div>

    <!-- Manual upload -->
    <div v-if="mode === 'manual'" class="flex flex-col gap-3" data-testid="manual-upload">
      <div
        v-if="manualName"
        class="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
      >
        <div class="flex min-w-0 items-center gap-3">
          <FileText class="h-5 w-5 shrink-0 text-slate-400" />
          <p class="truncate text-sm font-bold text-slate-800" data-testid="manual-file-name">{{ manualName }}</p>
        </div>
        <BaseButton
          v-if="!disabled && !readonly"
          variant="ghost"
          size="sm"
          aria-label="Remove report attachment"
          @click="removeManual"
        >
          <X class="h-4 w-4" />
        </BaseButton>
      </div>
      <div
        v-if="!readonly"
        class="flex cursor-pointer flex-col gap-4 rounded-xl border-2 border-dashed p-5 transition-all sm:flex-row sm:items-center sm:justify-between"
        :class="dragging ? 'border-accent bg-accent/5' : 'border-slate-200 bg-slate-50/40 hover:border-primary/30'"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <div class="flex min-w-0 items-center gap-4">
          <UploadCloud class="h-5 w-5 text-slate-400" />
          <div>
            <p class="text-sm font-semibold text-slate-700">Select file</p>
            <p class="text-[11px] text-slate-400">Upload activity report (PDF, DOC, DOCX, max 2MB)</p>
          </div>
        </div>
        <BaseButton variant="secondary" size="sm" :disabled="disabled" @click="fileInput?.click()">Browse</BaseButton>
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          accept=".pdf,.doc,.docx"
          data-testid="manual-file-input"
          @change="onSelect"
        />
      </div>
    </div>

    <!-- Template mode -->
    <template v-else>
      <div class="flex flex-wrap items-center gap-2" data-testid="template-toolbar">
        <BaseButton
          v-if="!expanded"
          data-testid="expand-editor"
          variant="outline"
          size="sm"
          @click="expanded = true"
        >
          <Maximize2 class="h-4 w-4" /> Expand Editor
        </BaseButton>
        <BaseButton data-testid="preview-pdf" variant="outline" size="sm" @click="previewOpen = true">
          <Eye class="h-4 w-4" /> Preview &amp; Download PDF
        </BaseButton>
      </div>

      <!-- One canvas; teleport to body when expanded so ancestor transforms/overflow cannot clip fixed overlay. -->
      <Teleport to="body" :disabled="!expanded">
        <div
          :class="expanded ? 'fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 p-4 sm:p-8' : ''"
          data-testid="document-wrapper"
          @click.self="expanded && (expanded = false)"
        >
          <div v-if="expanded" class="mx-auto mb-3 flex max-w-[794px] justify-end">
            <BaseButton data-testid="collapse-editor" variant="secondary" size="sm" @click="expanded = false">
              <Minimize2 class="h-4 w-4" /> Close
            </BaseButton>
          </div>

          <article
            class="relative mx-auto flex min-h-[1000px] max-w-[794px] flex-col bg-white text-[13px] leading-relaxed text-slate-800"
            :class="expanded ? 'shadow-2xl' : 'shadow-lg ring-1 ring-slate-200'"
            data-testid="document-canvas"
          >
          <!-- Header -->
          <header class="relative h-16">
            <div
              class="absolute inset-y-0 left-0 flex w-full items-center gap-3 pl-5 text-white"
              :style="{ background: BLUE, clipPath: 'polygon(0 0, 42.3% 0, 32.3% 100%, 0 100%)' }"
            >
              <img :src="sbsiLogo" alt="SBSI logo" class="h-9 w-auto brightness-0 invert" />
              <span class="max-w-[10rem] text-[10px] font-bold leading-tight">SCIENTIFIC BIOTECH SPECIALTIES, INC.</span>
            </div>
          </header>
          <div class="mx-[7.5%] h-[3.5px]" :style="{ background: BLUE }"></div>

          <div class="mx-[7.5%] flex flex-1 flex-col gap-4 pt-6">
            <!-- Date + ref id -->
            <div class="flex flex-col items-end gap-1" data-testid="date-block">
              <span class="inline-flex items-center gap-1">
                <DatePill v-model="templateData.date" :editable="editable" data-testid="doc-date" />
                <CalendarDays v-if="editable" class="h-3.5 w-3.5 text-[#004AAD]" aria-hidden="true" />
              </span>
              <span v-if="templateData.systemRefId !== null && type !== 'cash-advance'" class="text-xs italic" data-testid="system-ref">
                System Ref ID:
                <input
                  v-if="editable"
                  v-model="templateData.systemRefId"
                  :class="PILL"
                  :style="{ width: fieldWidth(templateData.systemRefId) }"
                  aria-label="System Ref ID"
                />
                <span v-else>{{ templateData.systemRefId }}</span>
              </span>
            </div>

            <!-- Recipient -->
            <div class="flex flex-col items-start gap-0.5" data-testid="recipient-block">
              <template v-for="[key, bold] in [['recipientName', true], ['recipientTitle', false], ['recipientCompany', false]]" :key="key">
                <input
                  v-if="editable"
                  v-model="templateData[key]"
                  :class="[PILL, bold ? 'font-bold' : '']"
                  :style="{ width: fieldWidth(templateData[key]) }"
                  :aria-label="key"
                />
                <span v-else :class="bold ? 'font-bold' : ''">{{ templateData[key] }}</span>
              </template>
            </div>

            <!-- Subject / salutation in reference-PDF order -->
            <div class="flex flex-col gap-3" data-testid="header-lines">
              <template v-for="part in doc.headerOrder" :key="part">
                <div v-if="part === 'subject'" class="font-bold" data-testid="subject-line">
                  SUBJECT:
                  <input
                    v-if="editable"
                    v-model="templateData.subject"
                    :class="PILL"
                    :style="{ width: fieldWidth(templateData.subject, 'subject') }"
                    aria-label="Subject"
                  />
                  <span v-else>{{ templateData.subject }}</span>
                </div>
                <div v-else data-testid="salutation-line">
                  <input
                    v-if="editable"
                    v-model="templateData.salutation"
                    :class="PILL"
                    :style="{ width: fieldWidth(templateData.salutation) }"
                    aria-label="Salutation"
                  />
                  <span v-else>{{ templateData.salutation }}</span>
                </div>
              </template>
            </div>

            <!-- Mad-Libs paragraphs -->
            <div v-for="para in doc.paragraphs" :key="para.id" class="text-justify" :data-testid="`para-${para.id}`">
              <template v-for="(seg, si) in para.segments" :key="si">
                <span v-if="seg.type === 'text'">{{ seg.value }}</span>
                <strong v-else-if="seg.type === 'amount'" data-testid="doc-amount">{{ formatPhp(seg.value) }}</strong>
                <template v-else-if="seg.type === 'field'">
                  <template v-if="editable || templateData[seg.key] || !seg.optional">
                    <span v-if="seg.prefix">{{ seg.prefix }}</span>
                    <DatePill
                      v-if="seg.kind === 'date'"
                      v-model="templateData[seg.key]"
                      :editable="editable"
                      :data-testid="`field-${seg.key}`"
                    />
                    <input
                      v-else-if="editable"
                      v-model="templateData[seg.key]"
                      :class="PILL"
                      :style="{ width: fieldWidth(templateData[seg.key], seg.placeholder) }"
                      :placeholder="seg.placeholder"
                      :aria-label="seg.key"
                      :data-testid="`field-${seg.key}`"
                    />
                    <span v-else class="font-medium">{{ templateData[seg.key] }}</span>
                  </template>
                </template>
                <div v-else class="my-2 flex flex-col gap-1" data-testid="breakdown">
                  <div
                    v-for="(item, i) in templateData.breakdownItems"
                    :key="item.sourceId || i"
                    class="flex items-center gap-2 pl-3"
                  >
                    <span aria-hidden="true">•</span>
                    <input
                      v-if="editable"
                      v-model="item.description"
                      :class="[PILL, 'flex-1']"
                      placeholder="description"
                      :aria-label="`Breakdown ${i + 1} description`"
                      :data-testid="`breakdown-description-${i}`"
                      @input="item.descriptionEdited = true"
                    />
                    <span v-else class="flex-1">{{ item.description }}</span>
                    <input
                      v-if="editable && isCashAdvance"
                      v-model.number="item.amount"
                      type="number"
                      min="0"
                      step="0.01"
                      :class="[PILL, 'w-28 text-right']"
                      :aria-label="`Breakdown ${i + 1} amount`"
                      :data-testid="`breakdown-amount-${i}`"
                    />
                    <strong v-else>{{ formatPhp(item.amount) }}</strong>
                    <BaseButton
                      v-if="editable && isCashAdvance && templateData.breakdownItems.length > 1"
                      variant="ghost"
                      size="sm"
                      :aria-label="`Remove breakdown ${i + 1}`"
                      :data-testid="`breakdown-remove-${i}`"
                      @click="removeRow(i)"
                    >
                      <Trash2 class="h-4 w-4" />
                    </BaseButton>
                  </div>
                  <div class="flex items-center justify-between pl-3 pt-1 font-bold" data-testid="breakdown-total">
                    <span>TOTAL</span>
                    <span>{{ formatPhp(type === 'liquidation' ? templateData.utilizedAmount : templateData.totalAmount) }}</span>
                  </div>
                  <div v-if="editable && isCashAdvance" class="pl-3">
                    <BaseButton data-testid="breakdown-add" variant="outline" size="sm" @click="addRow">
                      <Plus class="h-4 w-4" /> Add row
                    </BaseButton>
                  </div>
                </div>
              </template>
            </div>

            <!-- Signatory -->
            <div class="mt-4 flex flex-col items-start gap-0.5" data-testid="signatory-block">
              <span>Respectfully yours,</span>
              <span class="mt-8 tracking-widest" aria-hidden="true">_______________________</span>
              <template v-for="[key, bold] in [['signatoryName', true], ['signatoryRole', false], ['signatoryDepartment', false]]" :key="key">
                <input
                  v-if="editable"
                  v-model="templateData[key]"
                  :class="[PILL, bold ? 'font-bold' : '']"
                  :style="{ width: fieldWidth(templateData[key], key === 'signatoryName' ? 'name' : 'role') }"
                  :placeholder="key === 'signatoryName' ? 'Name' : key === 'signatoryRole' ? 'Role' : 'Department'"
                  :aria-label="key"
                />
                <span v-else-if="templateData[key]" :class="bold ? 'font-bold' : ''">{{ templateData[key] }}</span>
              </template>
            </div>
          </div>

          <!-- Footer -->
          <footer class="mt-10 pb-6">
            <div class="mx-[7.5%] flex items-end justify-end">
              <div class="flex h-[26px] items-center">
                <span class="h-[26px] w-[26px]" :style="{ background: '#4892F4', clipPath: CHEVRON }"></span>
                <span class="-ml-px h-[26px] w-[26px]" :style="{ background: '#1A6CD9', clipPath: CHEVRON }"></span>
                <span class="-ml-px h-[26px] w-[26px]" :style="{ background: BLUE, clipPath: CHEVRON }"></span>
                <span
                  class="ml-1 h-[26px] w-[70px]"
                  :style="{ background: BLUE, clipPath: 'polygon(0 50%, 18% 0, 100% 0, 100% 100%, 18% 100%)' }"
                ></span>
              </div>
            </div>
            <div class="mx-[7.5%] mt-2 h-[3.5px]" :style="{ background: BLUE }"></div>
            <div class="mx-[7.5%] mt-3 grid grid-cols-3 gap-4 text-[10px] text-slate-600" data-testid="doc-footer">
              <span>{{ SBSI_FOOTER_CONTACT.email }}</span>
              <span>{{ SBSI_FOOTER_CONTACT.phone }}</span>
              <span>{{ SBSI_FOOTER_CONTACT.address }}</span>
            </div>
          </footer>
        </article>
        </div>
      </Teleport>

      <SbsiReportPreviewModal
        :is-open="previewOpen"
        :template-data="templateData"
        :fallback-type="type"
        @close="previewOpen = false"
      />
    </template>
  </div>
</template>

