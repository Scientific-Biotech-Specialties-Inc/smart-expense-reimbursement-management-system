<script setup>
import { ref, watch } from "vue";
import { formatAmount, formatDate } from "@/utils/formatters";
import StatusBadge from "@/components/base/StatusBadge.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseSignaturePad from "@/components/base/BaseSignaturePad.vue";
import BaseAuditTrail from "@/components/base/BaseAuditTrail.vue";
import { X, PenTool, Clock, CheckCircle2 } from "lucide-vue-next";

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

const employeeSignature = ref("");

watch(
  () => props.record,
  () => {
    employeeSignature.value = "";
  },
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

        <!-- Header -->
        <div class="px-6 pt-7 pb-4 border-b border-slate-100 shrink-0">
          <div class="flex items-start justify-between gap-4 pr-6">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-1">
                Payout Details &bull; {{ record.referenceNumber || `Ref #${record.id}` }}
              </p>
              <h2 class="text-2xl font-bold text-slate-800">
                {{ formatAmount(record.amount || 0, record.currency || "PHP") }}
              </h2>
              <p v-if="record.description" class="text-xs text-slate-500 mt-1">
                {{ record.description }}
              </p>
            </div>
            <StatusBadge :status="record.acknowledgementStatus || 'awaiting-acknowledgement'" />
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <!-- Dates & Release Info Grid -->
          <section class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
                Date of Request
              </p>
              <p class="text-sm font-medium text-slate-700">
                {{ formatDate(record.requestDate) }}
              </p>
            </div>

            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
                Date of Approval
              </p>
              <p class="text-sm font-medium text-slate-700">
                {{ formatDate(record.approvedDate) }}
              </p>
            </div>

            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
                Granted Date
              </p>
              <p class="text-sm font-medium text-slate-700">
                {{ formatDate(record.grantedDate) }}
              </p>
            </div>

            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
                Payout Method
              </p>
              <p class="text-sm font-semibold text-slate-800">
                {{ record.payoutMethod || "Cash" }}
              </p>
            </div>

            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
                Approved By
              </p>
              <p class="text-sm font-medium text-slate-700">
                {{ record.approvedBy || "Finance Manager" }}
              </p>
            </div>

            <div>
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
                Granted By
              </p>
              <p class="text-sm font-medium text-slate-700">
                {{ record.grantedBy || "—" }}
              </p>
            </div>

            <div class="sm:col-span-2 pt-2 border-t border-slate-100">
              <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">
                Amount Received
              </p>
              <p class="text-base font-bold text-primary">
                {{ formatAmount(record.amount || 0, record.currency || "PHP") }}
              </p>
            </div>
          </section>

          <!-- Granter Signature -->
          <section class="pt-4 border-t border-slate-100">
            <div class="flex items-center gap-2 mb-2">
              <PenTool class="w-3.5 h-3.5 text-slate-400" />
              <p class="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
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
              <p class="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">
                Employee's Acknowledgement
              </p>
            </div>

            <!-- Case 1: Already Acknowledged (both admin & employee: locked read-only) -->
            <div
              v-if="record.acknowledged"
              class="space-y-2"
            >
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
              <div class="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <CheckCircle2 class="w-3.5 h-3.5" />
                <span>Acknowledged and received{{ record.acknowledgedAt ? ` on ${formatDate(record.acknowledgedAt)}` : "" }}</span>
              </div>
            </div>

            <!-- Case 2: Unacknowledged & Employee (can draw and submit signature) -->
            <div
              v-else-if="!isAdmin"
              class="space-y-3"
            >
              <BaseSignaturePad
                v-model="employeeSignature"
                label="Employee's Signature *"
                placeholder="Draw your signature here to acknowledge receipt"
              />
              <p class="text-[11px] text-slate-400">
                By signing, you confirm that you have received {{ formatAmount(record.amount || 0, record.currency || "PHP") }} in full.
              </p>
            </div>

            <!-- Case 3: Unacknowledged & Admin (strictly read-only status) -->
            <div
              v-else
              class="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-center gap-3 text-amber-800"
            >
              <Clock class="w-5 h-5 shrink-0 text-amber-600" />
              <div>
                <p class="text-xs font-bold uppercase tracking-wide">Awaiting Acknowledgement</p>
                <p class="text-xs text-amber-700/90 mt-0.5">
                  The employee has not yet signed to acknowledge receipt of this payout.
                </p>
              </div>
            </div>
          </section>

          <!-- Audit Trail Section -->
          <BaseAuditTrail
            :trail="record.audit_trail || []"
            :entity-title="`Payout-#${record.id}`"
            class="mt-4"
          />
        </div>

        <!-- Footer -->
        <div
          class="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2"
        >
          <BaseButton variant="secondary" :disabled="isSubmitting" @click="emit('close')">
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
