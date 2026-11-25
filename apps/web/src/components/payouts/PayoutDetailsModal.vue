<script setup>
import { computed, ref, watch } from "vue";
import { getActivePinia } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { formatAmount, formatDate } from "@/utils/formatters";
import {
  getPayoutTypeLabel,
  getPayoutTypeBadgeClass,
} from "@/composables/payouts/usePayoutFilters";
import { useHorizontalScroll } from "@/composables/useHorizontalScroll";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseModalTabs from "@/components/base/BaseModalTabs.vue";
import BaseSignaturePad from "@/components/base/BaseSignaturePad.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import { X, PenTool, Clock, CheckCircle2 } from "lucide-vue-next";

const auth = getActivePinia() ? useAuthStore() : null;

const props = defineProps({
  record: {
    type: Object,
    default: null,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "acknowledge"]);

const activeTab = ref("signatures");
const employeeSignature = ref("");
const scrollContainerRef = ref(null);

const { canScrollLeft, canScrollRight, scrollToActive } = useHorizontalScroll(
  scrollContainerRef,
  {
    activeSelector: '[aria-current="step"]',
    autoScrollOnMount: true,
  },
);

const modalTabs = computed(() => [
  { key: "signatures", label: "Signatures" },
  {
    key: "audit",
    label: "Audit Trail",
    count: (props.record?.audit_trail || []).length,
  },
]);

const roadmapSteps = computed(() => {
  const r = props.record || {};
  const isAck = Boolean(r.acknowledged);
  return [
    {
      key: "requested",
      stepNumber: 1,
      label: "Requested",
      state: r.requestDate ? "completed" : "pending",
      sublabel: r.requestDate ? formatDate(r.requestDate) : "Recorded",
    },
    {
      key: "approved",
      stepNumber: 2,
      label: "Approved",
      state: r.approvedDate ? "completed" : "pending",
      sublabel: r.approvedDate ? formatDate(r.approvedDate) : "Approved",
    },
    {
      key: "granted",
      stepNumber: 3,
      label: "Granted",
      state: r.grantedDate ? "completed" : "pending",
      sublabel: r.grantedDate ? formatDate(r.grantedDate) : "Disbursed",
    },
    {
      key: "acknowledged",
      stepNumber: 4,
      label: "Acknowledged",
      state: isAck ? "completed" : "active",
      isCurrent: !isAck,
      sublabel: isAck
        ? r.acknowledgedAt
          ? formatDate(r.acknowledgedAt)
          : "Signed"
        : "Awaiting",
    },
  ];
});

const noteText = computed(() =>
  String(
    props.record?.notes ||
      props.record?.adminNotes ||
      props.record?.description ||
      "",
  ).trim(),
);

watch(
  () => props.record,
  () => {
    activeTab.value = "signatures";
    employeeSignature.value =
      !props.isAdmin && auth?.user?.signature ? auth.user.signature : "";
    scrollToActive();
  },
  { immediate: true },
);

function handleAcknowledge() {
  if (!employeeSignature.value || props.isSubmitting) return;
  emit("acknowledge", employeeSignature.value);
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="record"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click="emit('close')"
    >
      <div
        class="relative bg-white w-full max-w-[680px] rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden max-h-[92vh]"
        @click.stop
      >
        <!-- Close Button -->
        <button
          type="button"
          class="absolute top-3 right-3 text-slate-400 hover:bg-slate-100 transition-colors p-1.5 rounded-full flex items-center justify-center z-10"
          @click="emit('close')"
        >
          <X class="w-4 h-4" />
        </button>

        <!-- Sticky Header -->
        <div class="px-6 pt-7 pb-4 border-b border-slate-100 shrink-0">
          <div class="flex items-start justify-between gap-4 pr-6">
            <div class="flex flex-col gap-y-4">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <span
                  data-testid="payout-type-badge"
                  class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  :class="getPayoutTypeBadgeClass(record)"
                >
                  {{ getPayoutTypeLabel(record) }}
                </span>
              </div>
              <h2 class="text-2xl font-bold text-slate-800">
                {{ formatAmount(record.amount || 0, record.currency || "PHP") }}
              </h2>
            </div>
            <StatusBadge
              :status="
                record.acknowledgementStatus || 'awaiting-acknowledgement'
              "
            />
          </div>
        </div>

        <!-- Scrollable Body: Roadmap -> Tabs -> Notes -> Summary -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <!-- 1. 4-Step Horizontal Payout Roadmap -->
          <section
            data-testid="payout-roadmap-stepper"
            class="relative w-full"
            aria-label="Payout Roadmap"
          >
            <div
              v-show="canScrollLeft"
              class="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white to-transparent z-20 transition-opacity duration-200"
              aria-hidden="true"
            ></div>
            <div
              v-show="canScrollRight"
              class="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent z-20 transition-opacity duration-200"
              aria-hidden="true"
            ></div>

            <div
              ref="scrollContainerRef"
              class="relative w-full overflow-x-auto scrollbar-none py-1"
              tabindex="0"
              aria-label="Payout steps roadmap"
            >
              <div
                class="relative flex items-start justify-between min-w-full"
                style="min-width: 440px"
              >
                <div
                  class="pointer-events-none absolute top-4 -translate-y-1/2 left-[12.5%] right-[12.5%] h-0.5 bg-slate-100 z-0"
                  aria-hidden="true"
                ></div>

                <div
                  v-for="step in roadmapSteps"
                  :key="step.key"
                  :data-testid="`payout-step-${step.key}`"
                  :aria-current="step.isCurrent ? 'step' : undefined"
                  class="relative flex flex-col items-center text-center flex-1 min-w-[105px] px-1 z-10"
                >
                  <div
                    :class="[
                      'h-8 w-8 rounded-full flex items-center justify-center ring-4 ring-white z-10 shrink-0 mb-2',
                      step.state === 'completed'
                        ? 'bg-emerald-500 text-white'
                        : step.state === 'active'
                          ? 'bg-amber-400 text-white'
                          : 'bg-slate-200 text-slate-400',
                    ]"
                  >
                    <svg
                      v-if="step.state === 'completed'"
                      class="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2.5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <svg
                      v-else-if="step.state === 'active'"
                      class="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M12 8v4l3 3"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="currentColor"
                        stroke-width="2"
                        fill="none"
                      />
                    </svg>
                    <span v-else class="text-[10px] font-bold">{{
                      step.stepNumber
                    }}</span>
                  </div>
                  <p
                    class="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5"
                  >
                    {{ step.label }}
                  </p>
                  <p
                    class="text-xs font-medium truncate max-w-full px-1"
                    :class="[
                      step.state === 'active'
                        ? 'text-amber-600'
                        : step.key === 'acknowledged' &&
                            step.state === 'completed'
                          ? 'text-emerald-600'
                          : 'text-slate-700',
                    ]"
                  >
                    {{ step.sublabel }}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <!-- 2. Tabs + Active Tab Panel -->
          <div class="pt-4 border-t border-slate-100 space-y-4">
            <BaseModalTabs v-model="activeTab" :tabs="modalTabs" />

            <!-- Signatures Panel -->
            <div
              v-show="activeTab === 'signatures'"
              data-testid="payout-tab-panel-signatures"
              class="space-y-5"
            >
              <!-- Granter Signature -->
              <section>
                <div class="flex items-center gap-2 mb-2">
                  <PenTool class="w-3.5 h-3.5 text-slate-400" />
                  <p
                    class="text-[11px] text-slate-400 uppercase tracking-wide font-semibold"
                  >
                    Granter's Signature
                  </p>
                </div>
                <div
                  class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-center justify-center min-h-[120px]"
                >
                  <img
                    v-if="record.granterSignature"
                    :src="record.granterSignature"
                    alt="Granter Signature"
                    class="max-h-28 object-contain"
                  />
                  <p v-else class="text-xs italic text-slate-400">
                    No granter signature recorded.
                  </p>
                </div>
              </section>

              <!-- Employee Acknowledgement Signature Section (G2-050 & G2-052) -->
              <section class="pt-4 border-t border-slate-100">
                <div class="flex items-center gap-2 mb-2">
                  <PenTool class="w-3.5 h-3.5 text-slate-400" />
                  <p
                    class="text-[11px] text-slate-400 uppercase tracking-wide font-semibold"
                  >
                    Employee's Acknowledgement
                  </p>
                </div>

                <!-- Case 1: Already Acknowledged (both admin & employee: locked read-only) -->
                <div v-if="record.acknowledged" class="space-y-2">
                  <div
                    class="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 flex flex-col items-center justify-center min-h-[120px]"
                  >
                    <img
                      v-if="record.employeeSignature"
                      :src="record.employeeSignature"
                      alt="Employee Signature"
                      class="max-h-28 object-contain"
                    />
                    <p v-else class="text-xs italic text-slate-400">
                      Signed receipt
                    </p>
                  </div>
                  <div
                    class="flex items-center gap-1.5 text-xs text-emerald-700 font-medium"
                  >
                    <CheckCircle2 class="w-3.5 h-3.5" />
                    <span
                      >Acknowledged and received{{
                        record.acknowledgedAt
                          ? ` on ${formatDate(record.acknowledgedAt)}`
                          : ""
                      }}</span
                    >
                  </div>
                </div>

                <!-- Case 2: Unacknowledged & Employee (can draw and submit signature) -->
                <div
                  v-else-if="!isAdmin"
                  class="space-y-3 flex flex-col items-center"
                >
                  <BaseSignaturePad
                    v-model="employeeSignature"
                    label="Employee's Signature *"
                    placeholder="Draw your signature here to acknowledge receipt"
                    required
                  />
                  <p class="text-[11px] text-slate-400 w-full max-w-lg">
                    By signing, you confirm that you have received
                    {{
                      formatAmount(record.amount || 0, record.currency || "PHP")
                    }}
                    in full.
                  </p>
                </div>

                <!-- Case 3: Unacknowledged & Admin (strictly read-only status) -->
                <div
                  v-else
                  class="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-center gap-3 text-amber-800"
                >
                  <Clock class="w-5 h-5 shrink-0 text-amber-600" />
                  <div>
                    <p class="text-xs font-bold uppercase tracking-wide">
                      Awaiting Acknowledgement
                    </p>
                    <p class="text-xs text-amber-700/90 mt-0.5">
                      The employee has not yet signed to acknowledge receipt of
                      this payout.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <!-- Audit Trail Panel -->
            <div
              v-show="activeTab === 'audit'"
              data-testid="payout-tab-panel-audit"
            >
              <BaseAuditTrail
                :trail="record.audit_trail || []"
                :entity-title="`${record.type === 'cash_advance' ? 'Cash-Advance' : 'Payout'}-#${record.id}`"
              />
            </div>
          </div>

          <!-- 3. Reviewer Note / Explanation Section (always visible) -->
          <section
            data-testid="modal-notes-section"
            class="pt-4 border-t border-slate-100"
          >
            <p
              class="text-[11px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5"
            >
              Reviewer Note / Explanation
            </p>
            <div
              v-if="noteText"
              class="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed"
            >
              {{ noteText }}
            </div>
            <p v-else class="text-xs italic text-slate-400">
              No notes provided
            </p>
          </section>

          <!-- 4. Summary Section (always visible) -->
          <section
            data-testid="modal-summary-section"
            class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4"
          >
            <p
              class="text-[11px] text-slate-400 uppercase tracking-wide font-semibold"
            >
              Summary
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
              <div>
                <p
                  class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5"
                >
                  Date of Request
                </p>
                <p class="text-sm font-medium text-slate-700">
                  {{ formatDate(record.requestDate) }}
                </p>
              </div>

              <div>
                <p
                  class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5"
                >
                  Date of Approval
                </p>
                <p class="text-sm font-medium text-slate-700">
                  {{ formatDate(record.approvedDate) }}
                </p>
              </div>

              <div>
                <p
                  class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5"
                >
                  Granted Date
                </p>
                <p class="text-sm font-medium text-slate-700">
                  {{ formatDate(record.grantedDate) }}
                </p>
              </div>

              <div>
                <p
                  class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5"
                >
                  Payout Method
                </p>
                <p class="text-sm font-semibold text-slate-800">
                  {{ record.payoutMethod || "Cash" }}
                </p>
              </div>

              <div>
                <p
                  class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5"
                >
                  Approved By
                </p>
                <p class="text-sm font-medium text-slate-700">
                  {{ record.approvedBy || "Finance Manager" }}
                </p>
              </div>

              <div>
                <p
                  class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5"
                >
                  Granted By
                </p>
                <p class="text-sm font-medium text-slate-700">
                  {{ record.grantedBy || "—" }}
                </p>
              </div>
            </div>

            <div
              class="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-4"
            >
              <p
                class="text-[11px] text-slate-500 uppercase tracking-wide font-semibold"
              >
                Amount Received
              </p>
              <p class="text-base font-bold text-primary">
                {{ formatAmount(record.amount || 0, record.currency || "PHP") }}
              </p>
            </div>
          </section>
        </div>

        <!-- Sticky Footer -->
        <div
          class="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0"
        >
          <BaseButton
            variant="secondary"
            :disabled="isSubmitting"
            @click="emit('close')"
          >
            Close
          </BaseButton>
          <BaseButton
            v-if="!record.acknowledged && !isAdmin"
            data-testid="acknowledge-payout-btn"
            variant="primary"
            :disabled="!employeeSignature || isSubmitting"
            :loading="isSubmitting"
            @click="handleAcknowledge"
          >
            {{ isSubmitting ? "Acknowledging..." : "Acknowledge Payout" }}
          </BaseButton>
        </div>
      </div>
    </div>
  </Transition>
</template>
