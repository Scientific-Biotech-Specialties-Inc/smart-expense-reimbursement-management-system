<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePenaltyStore } from "@/stores/penalty";
import { useToast } from "@/composables/useToast";
import PenaltyStatusBanner from "@/components/penalties/PenaltyStatusBanner.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import SkeletonLoader from "@/components/base/SkeletonLoader.vue";
import {
  formatPhpAmount,
  formatMediumDate,
  formatSourceModule,
  formatTriggerType,
} from "@/utils/penaltyFormatters";
import { ArrowRight, Upload, CheckCircle2, AlertCircle, Clock } from "lucide-vue-next";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

const router = useRouter();
const penaltyStore = usePenaltyStore();
const { addToast } = useToast();

const explanation = ref("");
const selectedFile = ref(null);
const fileInputRef = ref(null);
const formErrors = ref({
  explanation: "",
  letter_file: "",
  general: "",
});

const appealSectionRef = ref(null);

onMounted(() => {
  penaltyStore.fetchMyPenalties().catch(() => {});
});

const activeStrikesCount = computed(() => penaltyStore.activeStrikesCount);
const strikeLimit = computed(() => penaltyStore.strikeLimit || 3);
const standing = computed(() => penaltyStore.standing || "clear");
const isPenalized = computed(
  () => penaltyStore.isPenalized || activeStrikesCount.value >= strikeLimit.value,
);
const pendingAppeal = computed(() => penaltyStore.pendingAppeal);
const latestAppeal = computed(() => penaltyStore.latestAppeal);
const reviewedAppeals = computed(() =>
  (penaltyStore.appeals || []).filter((a) => a.status !== "pending"),
);
const monetaryTotal = computed(
  () => penaltyStore.overdueMonetaryPenalties?.total_amount ?? 0,
);
const monetaryRecords = computed(
  () => penaltyStore.overdueMonetaryPenalties?.records ?? [],
);

const meterBarClass = computed(() => {
  if (isPenalized.value) return "bg-red-600";
  if (activeStrikesCount.value > 0) return "bg-amber-500";
  return "bg-emerald-600";
});

function scrollToAppeal() {
  appealSectionRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function goToRecord(path) {
  if (!path) return;
  router.push(path);
}

function validateFile(file) {
  if (!file) {
    return "Supporting letter file (PDF, JPEG, or PNG up to 2MB) is required.";
  }
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  const mimeValid = file.type ? ALLOWED_MIME_TYPES.has(file.type) : false;
  const extValid = ALLOWED_EXTENSIONS.has(ext);
  if (!mimeValid && !extValid) {
    return "Unsupported file format. Please upload a PDF, JPEG, or PNG file.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "File exceeds the 2MB maximum size limit.";
  }
  return "";
}

function handleFileChange(event) {
  const file = event.target?.files?.[0] || null;
  formErrors.value.letter_file = "";
  if (!file) {
    selectedFile.value = null;
    return;
  }
  const fileErr = validateFile(file);
  if (fileErr) {
    selectedFile.value = null;
    formErrors.value.letter_file = fileErr;
    return;
  }
  selectedFile.value = file;
}

function validateForm() {
  formErrors.value = { explanation: "", letter_file: "", general: "" };
  const trimmed = explanation.value.trim();
  if (trimmed.length < 10) {
    formErrors.value.explanation = "Explanation must be at least 10 characters.";
  } else if (trimmed.length > 2000) {
    formErrors.value.explanation = "Explanation must not exceed 2000 characters.";
  }

  const fileErr = validateFile(selectedFile.value);
  if (fileErr) {
    formErrors.value.letter_file = fileErr;
  }

  return !formErrors.value.explanation && !formErrors.value.letter_file;
}

async function handleSubmitAppeal() {
  if (penaltyStore.isSubmitting || !validateForm()) return;

  try {
    await penaltyStore.submitAppeal({
      explanation: explanation.value.trim(),
      letter_file: selectedFile.value,
    });
    explanation.value = "";
    selectedFile.value = null;
    if (fileInputRef.value) {
      fileInputRef.value.value = "";
    }
    addToast({
      type: "success",
      message: "Compliance appeal letter submitted for administrator review.",
    });
  } catch (err) {
    formErrors.value.general = err?.message || "Unable to submit appeal letter.";
    addToast({
      type: "error",
      message: formErrors.value.general,
    });
  }
}
</script>

<template>
  <div class="flex flex-col gap-6 font-sans">
    <!-- Direct Opening Header + 3-Strike Standing Gauge -->
    <div class="card p-6">
      <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-2xl font-bold leading-tight text-slate-800">
              Compliance Standing
            </h1>
            <StatusBadge :status="standing" tier="medium" />
          </div>
          <p class="mt-1 text-sm text-slate-500 max-w-[65ch]">
            Track active compliance strikes, overdue liquidation charges, and appeal letters for Cycle {{ penaltyStore.currentCycle }}.
          </p>
        </div>

        <div class="flex items-center gap-6">
          <div class="text-right">
            <p class="text-xs font-semibold text-slate-500">Active Strikes</p>
            <p
              data-testid="standing-counter"
              class="text-3xl font-bold text-slate-800 tabular-nums"
            >
              {{ activeStrikesCount }}/{{ strikeLimit }}
            </p>
          </div>
        </div>
      </div>

      <!-- 3-Strike Meter -->
      <div class="mt-5">
        <div class="grid grid-cols-3 gap-2" role="meter" :aria-valuenow="activeStrikesCount" aria-valuemin="0" :aria-valuemax="strikeLimit" aria-label="Active compliance strikes">
          <div
            v-for="slot in strikeLimit"
            :key="slot"
            class="h-2.5 rounded-full meter-segment"
            :class="slot <= activeStrikesCount ? meterBarClass : 'bg-slate-200'"
          />
        </div>
        <div class="mt-2 flex justify-between text-xs text-slate-500 tabular-nums">
          <span>0 Clear</span>
          <span>1 to 2 Warning</span>
          <span>3 Submission Hold</span>
        </div>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="penaltyStore.isLoading && !penaltyStore.hasLoaded" class="card p-6">
      <SkeletonLoader variant="list" :rows="3" />
    </div>

    <template v-else>
      <!-- Status Banner (Warning or Hold) -->
      <PenaltyStatusBanner :on-appeal-action="scrollToAppeal" />

      <!-- Active Strikes Section -->
      <section class="card p-6" aria-labelledby="active-strikes-heading">
        <div class="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 id="active-strikes-heading" class="text-lg font-bold text-slate-800">
            Active Strikes
          </h2>
          <span class="text-sm font-semibold text-slate-600 tabular-nums">
            {{ penaltyStore.activeStrikes.length }} active
          </span>
        </div>

        <div
          v-if="penaltyStore.activeStrikes.length === 0"
          class="flex items-center gap-3 py-6 text-sm text-slate-600"
        >
          <CheckCircle2 class="h-5 w-5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
          <span>No active strikes recorded in the current cycle.</span>
        </div>

        <ul v-else class="divide-y divide-slate-200">
          <li
            v-for="strike in penaltyStore.activeStrikes"
            :key="strike.id"
            class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="text-sm font-bold text-slate-800">
                  {{ formatTriggerType(strike.trigger_type) }}
                </span>
                <StatusBadge :status="strike.status" tier="low" />
              </div>
              <p class="text-sm text-slate-700">{{ strike.reason }}</p>
              <p class="text-xs text-slate-500">
                <span>{{ formatSourceModule(strike.source_module) }}</span>
                <span v-if="strike.source_reference" class="tabular-nums">
                  ({{ strike.source_reference }})
                </span>
                <span class="mx-1.5">|</span>
                <span>Issued {{ formatMediumDate(strike.created_at) }}</span>
                <span v-if="strike.issued_by_name">
                  by {{ strike.issued_by_name }}
                </span>
              </p>
            </div>

            <div v-if="strike.redirect_path" class="flex-shrink-0">
              <BaseButton
                variant="secondary"
                size="sm"
                @click="goToRecord(strike.redirect_path)"
              >
                <span>Go to Record</span>
                <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
              </BaseButton>
            </div>
          </li>
        </ul>
      </section>

      <!-- Appeal Letter Submission & Status -->
      <section
        v-if="isPenalized || pendingAppeal || penaltyStore.appeals.length > 0"
        id="appeal-form"
        ref="appealSectionRef"
        class="card p-6"
        aria-labelledby="appeal-section-heading"
      >
        <div class="border-b border-slate-200 pb-3">
          <h2 id="appeal-section-heading" class="text-lg font-bold text-slate-800">
            Compliance Appeal Letter
          </h2>
          <p class="mt-1 text-sm text-slate-500">
            Submit a signed compliance appeal letter to request strike reset and lift the submission hold.
          </p>
        </div>

        <!-- Pending Appeal State -->
        <div
          v-if="pendingAppeal"
          data-testid="pending-appeal-panel"
          class="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 font-bold">
              <Clock class="h-4 w-4 text-amber-700" aria-hidden="true" />
              <span>Compliance Appeal Letter Pending Review</span>
            </div>
            <StatusBadge :status="pendingAppeal.status" tier="medium" />
          </div>
          <p class="mt-2 leading-relaxed text-amber-900">{{ pendingAppeal.explanation }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-amber-800">
            <span>Submitted {{ formatMediumDate(pendingAppeal.created_at) }}</span>
            <a
              v-if="pendingAppeal.letter_url"
              :href="pendingAppeal.letter_url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-semibold underline hover:text-amber-950"
            >
              {{ pendingAppeal.letter_file_name || "View Uploaded Letter" }}
            </a>
          </div>
        </div>

        <!-- Submission Form (when penalized and no pending appeal) -->
        <div v-else-if="isPenalized" class="mt-5 space-y-5">
          <!-- Rejected feedback notice for resubmission -->
          <div
            v-if="latestAppeal && latestAppeal.status === 'rejected'"
            data-testid="rejected-appeal-notice"
            class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-bold">Previous Appeal Rejected</span>
              <span class="text-xs text-red-800">
                Reviewed {{ formatMediumDate(latestAppeal.reviewed_at) }}
                <template v-if="latestAppeal.reviewed_by_name">
                  by {{ latestAppeal.reviewed_by_name }}
                </template>
              </span>
            </div>
            <p class="mt-1.5 text-red-900">
              {{ latestAppeal.admin_comment || "Please address the reviewer feedback and resubmit." }}
            </p>
          </div>

          <form class="space-y-5" novalidate @submit.prevent="handleSubmitAppeal">
            <!-- Explanation -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label for="appeal-explanation" class="text-sm font-semibold text-slate-700">
                  Written Explanation
                </label>
                <span class="text-xs text-slate-500 tabular-nums">
                  {{ explanation.trim().length }} / 2000
                </span>
              </div>
              <textarea
                id="appeal-explanation"
                v-model="explanation"
                rows="4"
                maxlength="2000"
                class="input"
                :class="{ 'input-error': formErrors.explanation }"
                placeholder="Explain the circumstances behind the overdue items and corrective steps taken..."
              />
              <p
                v-if="formErrors.explanation"
                role="alert"
                class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700"
              >
                <AlertCircle class="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                <span>{{ formErrors.explanation }}</span>
              </p>
            </div>

            <!-- Letter File Upload -->
            <div>
              <label for="appeal-letter-file" class="block text-sm font-semibold text-slate-700 mb-1.5">
                Signed Letter Document (PDF, JPEG, or PNG up to 2MB)
              </label>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="appeal-letter-file"
                  ref="fileInputRef"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  class="block w-full text-sm text-slate-700 file:mr-4 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-100"
                  @change="handleFileChange"
                />
              </div>
              <p v-if="selectedFile" class="mt-1.5 text-xs text-slate-600 tabular-nums">
                Selected: {{ selectedFile.name }} ({{ (selectedFile.size / 1024).toFixed(1) }} KB)
              </p>
              <p
                v-if="formErrors.letter_file"
                role="alert"
                class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700"
              >
                <AlertCircle class="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                <span>{{ formErrors.letter_file }}</span>
              </p>
            </div>

            <p
              v-if="formErrors.general"
              role="alert"
              class="text-sm font-medium text-red-700"
            >
              {{ formErrors.general }}
            </p>

            <div class="flex justify-end">
              <BaseButton
                data-testid="submit-appeal-btn"
                type="submit"
                variant="primary"
                :loading="penaltyStore.isSubmitting"
              >
                <Upload class="h-4 w-4" aria-hidden="true" />
                <span>Submit Appeal Letter</span>
              </BaseButton>
            </div>
          </form>
        </div>
      </section>

      <!-- Overdue Monetary Penalties (Read-Only) -->
      <section class="card p-6" aria-labelledby="monetary-penalties-heading">
        <div class="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="monetary-penalties-heading" class="text-lg font-bold text-slate-800">
              Overdue Monetary Charges
            </h2>
            <p class="text-xs text-slate-500">
              Read-only daily penalty ledger computed from overdue liquidations.
            </p>
          </div>
          <div class="text-right">
            <span class="block text-xs font-medium text-slate-500">Total Recorded Charges</span>
            <span
              data-testid="monetary-total"
              class="text-lg font-bold text-slate-800 tabular-nums"
            >
              {{ formatPhpAmount(monetaryTotal) }}
            </span>
          </div>
        </div>

        <p v-if="monetaryRecords.length === 0" class="py-5 text-sm text-slate-600">
          No overdue monetary penalty charges recorded.
        </p>

        <div v-else class="mt-4 overflow-x-auto">
          <table class="table-base">
            <thead>
              <tr>
                <th>Cash Advance Ref</th>
                <th class="text-right">Days Overdue</th>
                <th class="text-right">Penalty Amount</th>
                <th>Recorded Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in monetaryRecords" :key="record.id">
                <td class="font-semibold text-slate-800 tabular-nums">
                  {{ record.reference_no || `CA-${record.cash_advance_id}` }}
                </td>
                <td class="text-right tabular-nums">{{ record.days_overdue }}</td>
                <td class="text-right font-semibold text-slate-800 tabular-nums">
                  {{ formatPhpAmount(record.penalty_amount) }}
                </td>
                <td>{{ formatMediumDate(record.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Resolved History -->
      <section class="card p-6" aria-labelledby="resolved-history-heading">
        <div class="border-b border-slate-200 pb-3">
          <h2 id="resolved-history-heading" class="text-lg font-bold text-slate-800">
            Resolved History
          </h2>
          <p class="text-xs text-slate-500">
            Append-only archive of waived or reset strikes and reviewed appeal letters.
          </p>
        </div>

        <div
          v-if="penaltyStore.historyStrikes.length === 0 && reviewedAppeals.length === 0"
          class="py-5 text-sm text-slate-600"
        >
          No resolved strikes or reviewed appeals on record yet.
        </div>

        <div v-else class="divide-y divide-slate-200">
          <div
            v-for="strike in penaltyStore.historyStrikes"
            :key="`hist-strike-${strike.id}`"
            class="py-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold text-slate-800">
                  {{ formatTriggerType(strike.trigger_type) }}
                </span>
                <StatusBadge :status="strike.status" tier="medium" />
              </div>
              <p class="text-sm text-slate-600 mt-0.5">{{ strike.reason }}</p>
              <p v-if="strike.resolution_note" class="text-xs text-slate-500 mt-0.5">
                Resolution note: {{ strike.resolution_note }}
              </p>
            </div>
            <div class="text-xs text-slate-500 sm:text-right flex-shrink-0">
              <div>Cycle {{ strike.cycle_number }}</div>
              <div>Resolved {{ formatMediumDate(strike.resolved_at || strike.created_at) }}</div>
            </div>
          </div>

          <div
            v-for="appeal in reviewedAppeals"
            :key="`hist-appeal-${appeal.id}`"
            class="py-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold text-slate-800">
                  Compliance Appeal Letter
                </span>
                <StatusBadge :status="appeal.status" tier="medium" />
              </div>
              <p class="text-sm text-slate-600 mt-0.5">{{ appeal.explanation }}</p>
              <p v-if="appeal.admin_comment" class="text-xs text-slate-500 mt-0.5">
                Reviewer comment: {{ appeal.admin_comment }}
              </p>
            </div>
            <div class="text-xs text-slate-500 sm:text-right flex-shrink-0">
              <div v-if="appeal.reviewed_by_name">By {{ appeal.reviewed_by_name }}</div>
              <div>Reviewed {{ formatMediumDate(appeal.reviewed_at || appeal.created_at) }}</div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.meter-segment {
  transition: background-color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .meter-segment {
    transition: none;
  }
}
</style>
