<script setup>
import { ref, computed, watch } from "vue";
import BaseModal from "@/components/base/BaseModal.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import BaseSignaturePad from "@/components/base/BaseSignaturePad.vue";
import { formatAmount, formatDate } from "@/utils/formatters";
import { Wallet, AlertTriangle, Eye, EyeOff, X } from "lucide-vue-next";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  record: {
    type: Object,
    default: null,
  },
  defaultGrantedBy: {
    type: String,
    default: "",
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "confirm"]);

const isConfirmStep = ref(false);
const showPassword = ref(false);

const grantedBy = ref("");
const payoutMethod = ref("Cash");
const payoutMethodOther = ref("");
const granterSignature = ref("");
const password = ref("");

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      isConfirmStep.value = false;
      showPassword.value = false;
      grantedBy.value = props.defaultGrantedBy || "Finance / Admin";
      payoutMethod.value = "Cash";
      payoutMethodOther.value = "";
      granterSignature.value = "";
      password.value = "";
    }
  },
  { immediate: true },
);

const isFormValid = computed(() => {
  if (!grantedBy.value?.trim()) return false;
  if (!payoutMethod.value) return false;
  if (payoutMethod.value === "Other" && !payoutMethodOther.value?.trim()) return false;
  if (!granterSignature.value) return false;
  return true;
});

const isProceedDisabled = computed(() => {
  return !password.value?.trim() || props.isSubmitting;
});

function handleClose() {
  isConfirmStep.value = false;
  showPassword.value = false;
  emit("close");
}

function handleNext() {
  if (!isFormValid.value) return;
  isConfirmStep.value = true;
}

function handleConfirm() {
  if (isProceedDisabled.value) return;
  emit("confirm", {
    granted_by: grantedBy.value.trim(),
    payout_method: payoutMethod.value,
    payout_method_other: payoutMethod.value === "Other" ? payoutMethodOther.value.trim() : null,
    granter_signature: granterSignature.value,
    password: password.value,
  });
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="isOpen && Boolean(record)"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click="handleClose"
    >
      <div
        class="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="border-b border-slate-100 bg-slate-50/80 px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
              <Wallet class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-heading text-base font-bold text-slate-800">
                {{ isConfirmStep ? "Confirm Payout Handover" : "Grant Reimbursement Payout" }}
              </h3>
              <p class="text-[11px] text-slate-500 font-medium">
                Ref #{{ record?.id }} &bull; {{ formatAmount(record?.amount || 0, record?.currency || 'PHP') }}
              </p>
            </div>
          </div>
          <button
            type="button"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            @click="handleClose"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

    <!-- Modal Body -->
    <div class="p-6 flex flex-col gap-5 max-h-[80vh] overflow-y-auto">
      <!-- Step 1: Payout Details & Signature Form -->
      <template v-if="!isConfirmStep">
        <!-- Auto-filled Read-Only Grid (G2-044, G2-045) -->
        <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-4 grid grid-cols-2 gap-3 text-left">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date of Request</p>
            <p class="text-xs font-semibold text-slate-700 mt-0.5">
              {{ formatDate(record?.date || record?.created_at) }}
            </p>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date of Approval</p>
            <p class="text-xs font-semibold text-slate-700 mt-0.5">
              {{ formatDate(record?.approved_at || record?.updated_at) }}
            </p>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date of Granting</p>
            <p class="text-xs font-semibold text-slate-700 mt-0.5">
              {{ formatDate(new Date().toISOString()) }}
            </p>
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount to Receive</p>
            <p class="text-xs font-bold text-primary mt-0.5">
              {{ formatAmount(record?.amount || 0, record?.currency || 'PHP') }}
            </p>
          </div>
          <div class="col-span-2 pt-2 border-t border-slate-200/60">
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Approved by</p>
            <p class="text-xs font-medium text-slate-700 mt-0.5">
              {{ record?.approved_by || 'Approver' }}
            </p>
          </div>
        </div>

        <!-- Editable Inputs (G2-045) -->
        <div class="flex flex-col gap-3">
          <div class="input-wrapper">
            <label class="input-label mb-1 block">
              Granted by <span class="text-danger">*</span>
            </label>
            <input
              v-model="grantedBy"
              type="text"
              class="input w-full"
              placeholder="Name of staff granting the payout"
            />
          </div>

          <div class="input-wrapper">
            <label class="input-label mb-1 block">
              Payout Method <span class="text-danger">*</span>
            </label>
            <select
              id="payout-method-select"
              v-model="payoutMethod"
              class="input w-full bg-white cursor-pointer"
            >
              <option value="Cash">Cash</option>
              <option value="E-wallet">E-wallet</option>
              <option value="Card">Card</option>
              <option value="Visa">Visa</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div v-if="payoutMethod === 'Other'" class="input-wrapper animate-fade-in">
            <label class="input-label mb-1 block">
              Specify Method <span class="text-danger">*</span>
            </label>
            <input
              id="payout-method-other-input"
              v-model="payoutMethodOther"
              type="text"
              class="input w-full"
              placeholder="e.g. Bank Transfer, GCash Corporate"
            />
          </div>
        </div>

        <!-- Granter Signature Pad (G2-046) -->
        <div class="pt-2 border-t border-slate-100">
          <BaseSignaturePad
            v-model="granterSignature"
            label="Granter's Signature *"
            placeholder="Draw granter's signature here"
          />
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <BaseButton variant="secondary" :disabled="isSubmitting" @click="handleClose">
            Cancel
          </BaseButton>
          <BaseButton
            data-testid="submit-payout-btn"
            variant="primary"
            :disabled="!isFormValid || isSubmitting"
            @click="handleNext"
          >
            Submit Payout
          </BaseButton>
        </div>
      </template>

      <!-- Step 2: Handover Confirmation & Password (G2-046 Task 3) -->
      <template v-else>
        <div class="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-2 text-left">
          <div class="flex items-center gap-2 text-amber-700 font-bold text-sm">
            <AlertTriangle class="w-4 h-4 shrink-0" />
            <span>Has the money been handed to the employee?</span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed">
            Please confirm that {{ formatAmount(record?.amount || 0, record?.currency || 'PHP') }} has been physically or digitally handed over to the employee. Once submitted, this payout will be marked as Granted and locked for audit.
          </p>
        </div>

        <div class="input-wrapper">
          <label class="input-label mb-1 block">
            Confirm Password <span class="text-danger">*</span>
          </label>
          <div class="relative">
            <input
              :type="showPassword ? 'text' : 'password'"
              v-model="password"
              class="input w-full pr-10"
              placeholder="Enter your current password"
              autocomplete="current-password"
              @keyup.enter="handleConfirm"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              tabindex="-1"
              @click="showPassword = !showPassword"
            >
              <Eye v-if="!showPassword" class="w-4 h-4" />
              <EyeOff v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <BaseButton variant="secondary" :disabled="isSubmitting" @click="isConfirmStep = false">
            Back
          </BaseButton>
          <BaseButton
            data-testid="final-grant-proceed-btn"
            variant="primary"
            :loading="isSubmitting"
            :disabled="isProceedDisabled"
            @click="handleConfirm"
          >
            {{ isSubmitting ? "Processing..." : "Confirm & Grant" }}
          </BaseButton>
        </div>
      </template>
    </div>
  </div>
</div>
</Transition>
</template>

