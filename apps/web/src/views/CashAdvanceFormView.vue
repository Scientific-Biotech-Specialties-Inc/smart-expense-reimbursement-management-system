<script setup>
import { ref, reactive, computed, onMounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { useToast } from "@/composables/useToast";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import SbsiReportDocumentEditor from "@/components/base/SbsiReportDocumentEditor.vue";
import { useUnsavedChanges } from "@/composables/useUnsavedChanges";
import {
  createDefaultTemplateData,
  validateTemplateData,
} from "@/utils/sbsiReportTemplateUtils";
import { createSbsiReportPdfFile } from "@/utils/sbsiPdfGenerator";
import {
  ArrowLeft,
  Info,
  Send,
} from "lucide-vue-next";

const props = defineProps({
  id: {
    type: [String, Number],
    default: null,
  },
});

const router = useRouter();
const auth = useAuthStore();
const store = useCashAdvanceStore();
const { addToast } = useToast();

const submitting = ref(false);
const isEditMode = computed(() => !!props.id);
const loadingRequest = ref(isEditMode.value);

const form = reactive({
  purpose: "",
  amount: "",
  expected_disbursement_date: "",
  expected_liquidation_date: "",
  documents: [],
});

const reportEditorRef = ref(null);
const manualReportFile = ref(null);
const isManualMode = ref(false);
const reportTemplateData = ref(
  isEditMode.value
    ? null
    : createDefaultTemplateData("cash-advance", {
        user: auth.user,
        purpose: form.purpose,
        totalAmount: form.amount,
        disbursementDate: form.expected_disbursement_date,
        liquidationDeadline: form.expected_liquidation_date,
      }),
);

function syncEditorMode() {
  nextTick(() => {
    const manualBtn = reportEditorRef.value?.$el?.querySelector('[data-testid="mode-manual"]');
    if (manualBtn) {
      isManualMode.value = manualBtn.getAttribute("aria-pressed") === "true";
    }
  });
}

function handleReportFileUpdate(file) {
  manualReportFile.value = file;
  form.documents = file ? [file] : [];
  if (file) {
    isManualMode.value = true;
  } else {
    syncEditorMode();
  }
}

function handleTemplatePurposeUpdate(val) {
  if (val !== form.purpose) {
    form.purpose = val;
  }
}

function handleTemplateTotalUpdate(val) {
  const numeric = Number(val) || 0;
  if (numeric !== (Number(form.amount) || 0)) {
    form.amount = numeric > 0 ? numeric : "";
  }
}

function handleTemplateDisbursementUpdate(val) {
  if (val !== form.expected_disbursement_date) {
    form.expected_disbursement_date = val;
  }
}

function handleTemplateLiquidationUpdate(val) {
  if (val !== form.expected_liquidation_date) {
    form.expected_liquidation_date = val;
  }
}

const isTemplateValid = computed(() => validateTemplateData(reportTemplateData.value).valid);
const hasValidAttachment = computed(() =>
  isManualMode.value ? form.documents.length > 0 : isTemplateValid.value,
);
const todayDate = computed(() => formatDateInputValue(new Date()));
const liquidationMinDate = computed(() => {
  if (!form.expected_disbursement_date) {
    return todayDate.value;
  }

  const nextDateAfterDisbursement = addDays(
    parseDateInputValue(form.expected_disbursement_date),
    1,
  );
  const minDateAfterDisbursement = formatDateInputValue(
    nextDateAfterDisbursement,
  );

  return minDateAfterDisbursement > todayDate.value
    ? minDateAfterDisbursement
    : todayDate.value;
});

const isDirty = computed(() => {
  return (
    form.purpose !== "" ||
    form.amount !== "" ||
    form.expected_disbursement_date !== "" ||
    form.expected_liquidation_date !== "" ||
    form.documents.length > 0
  );
});

const isSubmitted = ref(false);

const {
  showConfirmModal,
  handleConfirmLeave,
  handleCancelLeave,
  dismissWithConfirm
} = useUnsavedChanges(isDirty, isSubmitted);

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

onMounted(async () => {
  if (isEditMode.value) {
    loadingRequest.value = true;
    try {
      const data = await store.fetchRequest(props.id);
      if (data) {
        form.purpose = data.purpose || "";
        form.amount = data.amount ?? "";
        if (data.expected_disbursement_date) {
          form.expected_disbursement_date = new Date(data.expected_disbursement_date).toISOString().split("T")[0];
        }
        if (data.expected_liquidation_date) {
          form.expected_liquidation_date = new Date(data.expected_liquidation_date).toISOString().split("T")[0];
        }
        const doc = data.document;
        if (doc) {
          const rawDocPath = Array.isArray(doc.file_path) ? doc.file_path[0] : doc.file_path;
          const docPathStr = typeof rawDocPath === "string" ? rawDocPath : rawDocPath ? String(rawDocPath) : "";
          form.documents.push({
            name: doc.file_name || (docPathStr ? docPathStr.split("/").pop() : "document.pdf"),
            isExisting: true,
            file_path: doc.file_path,
          });
        }
        if (data.report_template_data) {
          reportTemplateData.value = createDefaultTemplateData("cash-advance", {
            user: auth.user,
            purpose: form.purpose,
            totalAmount: form.amount,
            disbursementDate: form.expected_disbursement_date,
            liquidationDeadline: form.expected_liquidation_date,
            existingData: data.report_template_data,
          });
          manualReportFile.value = null;
          isManualMode.value = false;
        } else if (form.documents.length > 0) {
          reportTemplateData.value = null;
          manualReportFile.value = form.documents[0];
          isManualMode.value = true;
        } else {
          reportTemplateData.value = createDefaultTemplateData("cash-advance", {
            user: auth.user,
            purpose: form.purpose,
            totalAmount: form.amount,
            disbursementDate: form.expected_disbursement_date,
            liquidationDeadline: form.expected_liquidation_date,
          });
          manualReportFile.value = null;
          isManualMode.value = false;
        }
      }
    } catch (error) {
      addToast({
        message: "Failed to load cash advance details.",
        type: "error",
      });
      router.push("/cash-advances");
    } finally {
      loadingRequest.value = false;
    }
  }
});

async function handleRequest() {
  if (submitting.value) return;
  if (
    !form.purpose ||
    !form.amount ||
    !form.expected_disbursement_date ||
    !form.expected_liquidation_date ||
    !hasValidAttachment.value
  )
    return;

  if (form.purpose.length > 255) {
    addToast({
      message: "Purpose must not exceed 255 characters.",
      type: "error",
    });
    return;
  }

  const today = todayDate.value;
  if (form.expected_disbursement_date < today) {
    addToast({
      message: "Disbursement date must be today or a future date.",
      type: "error",
    });
    return;
  }

  if (form.expected_liquidation_date < today) {
    addToast({
      message: "Liquidation Deadline must be today or a future date.",
      type: "error",
    });
    return;
  }

  if (form.expected_disbursement_date >= form.expected_liquidation_date) {
    addToast({
      message:
        "Disbursement date cannot be greater than or equal to the liquidation date.",
      type: "error",
    });
    return;
  }

  submitting.value = true;

  const formData = new FormData();
  formData.append("purpose", form.purpose);
  formData.append("amount", form.amount);
  formData.append(
    "expected_disbursement_date",
    form.expected_disbursement_date,
  );
  formData.append("expected_liquidation_date", form.expected_liquidation_date);

  if (!isManualMode.value) {
    const pdfFile = createSbsiReportPdfFile(reportTemplateData.value);
    formData.append("documents[]", pdfFile);
    formData.append("report_template_data", JSON.stringify(reportTemplateData.value));
  } else {
    form.documents.forEach((file) => {
      if (!file.isExisting) {
        formData.append("documents[]", file);
      }
    });
  }

  try {
    if (isEditMode.value) {
      await store.updateRequest(props.id, formData);
      addToast({
        message: "Cash advance request updated successfully",
        type: "success",
      });
    } else {
      await store.request(formData);
      addToast({
        message: "Cash advance requested successfully",
        type: "success",
      });
    }
    isSubmitted.value = true;
    router.push("/cash-advances");
  } catch (error) {
    addToast({
      message: error.message || "Failed to process request",
      type: "error",
    });
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  dismissWithConfirm(
    () => {
      router.push("/cash-advances");
    },
    { navigates: true },
  );
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-clinical">
    <main class="flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
        <header
          class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        >
          <div class="flex items-start gap-3">
            <button
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-primary"
              type="button"
              title="Back to Cash Advances"
              @click="goBack"
            >
              <ArrowLeft class="h-4 w-4" />
            </button>
            <div class="min-w-0">

              <h1
                class="font-heading text-2xl font-bold leading-tight text-slate-800"
              >
                {{ isEditMode ? "Edit Cash Advance Request" : "New Cash Advance Request" }}
              </h1>
              <p class="mt-1 text-sm text-slate-400">
                {{ isEditMode ? "Update your cash advance request details." : "Submit a cash advance request for review and disbursement." }}
              </p>
            </div>
          </div>
        </header>

        <section class="card p-5 md:p-6">
          <form
            id="cashAdvanceForm"
            class="space-y-6"
            @submit.prevent="handleRequest"
          >
            <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div class="input-wrapper">
                <label class="input-label" for="ca-amount"
                  >Amount Requested <span class="text-danger">*</span></label
                >
                <div class="relative">
                  <span
                    class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-slate-400"
                    >PHP</span
                  >
                  <input
                    id="ca-amount"
                    v-model="form.amount"
                    class="input !pl-14 text-base"
                    min="0"
                    placeholder="0.00"
                    type="number"
                  />
                </div>
              </div>

              <div class="input-wrapper">
                <label class="input-label" for="ca-disbursement"
                  >Disbursement Date <span class="text-danger">*</span></label
                >
                <div class="relative">
                  <input
                    id="ca-disbursement"
                    v-model="form.expected_disbursement_date"
                    class="input text-base"
                    :min="todayDate"
                    type="date"
                  />
                </div>
              </div>

              <div class="input-wrapper">
                <label class="input-label" for="ca-due"
                  >Liquidation Deadline
                  <span class="text-danger">*</span></label
                >
                <div class="relative">
                  <input
                    id="ca-due"
                    v-model="form.expected_liquidation_date"
                    class="input text-base"
                    :min="liquidationMinDate"
                    type="date"
                  />
                </div>
              </div>
            </div>

            <div class="input-wrapper">
              <label class="input-label" for="ca-purpose"
                >Purpose <span class="text-danger">*</span></label
              >
              <textarea
                id="ca-purpose"
                v-model="form.purpose"
                class="input min-h-[132px] resize-none text-base leading-relaxed"
                placeholder="Describe the purpose of this cash advance request..."
                maxlength="255"
                rows="4"
              />
              <div class="mt-1 flex justify-end">
                <span
                  class="text-xs font-medium text-slate-400"
                  :class="{ 'text-danger': form.purpose.length >= 255 }"
                >
                  {{ form.purpose.length }} / 255
                </span>
              </div>
            </div>

            <div class="input-wrapper" @click="syncEditorMode">
              <label class="input-label"
                >Request Report Document
                <span class="text-danger">*</span></label
              >
              <SbsiReportDocumentEditor
                v-if="!loadingRequest"
                ref="reportEditorRef"
                type="cash-advance"
                :model-value="reportTemplateData"
                :report-file="manualReportFile"
                :purpose="form.purpose"
                :total-amount="form.amount"
                :disbursement-date="form.expected_disbursement_date"
                :liquidation-deadline="form.expected_liquidation_date"
                :record-id="props.id"
                @update:model-value="reportTemplateData = $event"
                @update:report-file="handleReportFileUpdate"
                @update:purpose="handleTemplatePurposeUpdate"
                @update:total-amount="handleTemplateTotalUpdate"
                @update:disbursement-date="handleTemplateDisbursementUpdate"
                @update:liquidation-deadline="handleTemplateLiquidationUpdate"
              />
            </div>
          </form>
        </section>

        <section class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div class="rounded-lg border border-accent/20 bg-accent-50 p-5">
            <div class="mb-4 flex items-start gap-3">
              <Info class="mt-0.5 h-5 w-5 text-accent" />
              <h3 class="font-heading text-base font-bold text-accent-800">
                Important Information
              </h3>
            </div>
            <ul
              class="list-inside list-disc space-y-2 text-sm leading-relaxed text-accent-800"
            >
              <!-- <li>
                Cash advance requests are subject to approval by the accounting
                department
              </li>
              <li>
                Approved amounts will be disbursed within 3-5 business days
              </li>
              <li>
                You must submit reimbursement with receipts after using the cash
                advance
              </li> -->
              <li>Unused amounts must be returned to the company</li>
            </ul>
          </div>
        </section>

        <footer
          class="flex flex-col items-center justify-end gap-3 border-t border-black/5 pt-6 sm:flex-row"
        >
          <button
            id="submit-advance-btn"
            class="btn btn-primary min-h-[42px] w-full sm:w-fit disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="
              submitting ||
              !form.purpose ||
              !form.amount ||
              !form.expected_disbursement_date ||
              !form.expected_liquidation_date ||
              !hasValidAttachment
            "
            form="cashAdvanceForm"
            type="submit"
          >
            <span
              v-if="submitting"
              class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <Send v-else class="h-4 w-4" />
            {{ submitting ? (isEditMode ? "Updating..." : "Submitting...") : (isEditMode ? "Update Request" : "Submit Request") }}
          </button>
        </footer>
      </div>
    </main>

    <ConfirmModal
      :is-open="showConfirmModal"
      title="Unsaved Changes"
      message="You have unsaved changes. Are you sure you want to leave? All progress will be lost."
      confirm-text="Leave Page"
      cancel-text="Stay"
      :danger="true"
      @confirm="handleConfirmLeave"
      @close="handleCancelLeave"
    />
  </div>
</template>
