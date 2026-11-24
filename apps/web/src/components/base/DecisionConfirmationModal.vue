<script setup>
import { ref, computed, watch } from "vue";
import BaseModal from "@/components/base/BaseModal.vue";
import BaseButton from "@/components/base/BaseButton.vue";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Wallet,
} from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String, // 'approve' | 'revise' | 'reject' | 'disburse' | 'grant'
    required: true,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
  password: {
    type: String,
    default: "",
  },
  comment: {
    type: String,
    default: "",
  },
  title: {
    type: String,
    default: "",
  },
  description: {
    type: String,
    default: "",
  },
  minCommentLength: {
    type: Number,
    default: 10,
  },
  maxCommentLength: {
    type: Number,
    default: 255,
  },
  fastTrackEligible: {
    type: Boolean,
    default: false,
  },
  requiresSecondaryAudit: {
    type: Boolean,
    default: false,
  },
  unverifiedVendors: {
    type: Array,
    default: () => [],
  },
  secondaryAuditConfirmed: {
    type: Boolean,
    default: false,
  },
  secondaryAuditNote: {
    type: String,
    default: "",
  },
});

const emit = defineEmits([
  "update:password",
  "update:comment",
  "update:secondaryAuditConfirmed",
  "update:secondaryAuditNote",
  "close",
  "confirm",
]);

const auth = useAuthStore();
const isConfirmStep = ref(false);
const showConfirmPassword = ref(false);
// Freeze mode while closing so parent prop resets don't flash another mode's icon/text during the exit transition
const effectiveMode = ref(props.mode);

const localComment = computed({
  get: () => props.comment,
  set: (val) => emit("update:comment", val),
});

const localPassword = computed({
  get: () => props.password,
  set: (val) => emit("update:password", val),
});

watch(
  () => [props.isOpen, props.mode],
  ([open, newMode]) => {
    if (open) {
      effectiveMode.value = newMode;
    }
  },
  { immediate: true },
);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      isConfirmStep.value = false;
      showConfirmPassword.value = false;
    }
  },
);

const isRejectNextDisabled = computed(() => {
  const len = (localComment.value || "").trim().length;
  return (
    len < props.minCommentLength ||
    len > props.maxCommentLength ||
    props.isSubmitting
  );
});

const isProceedDisabled = computed(() => {
  const missingSecondaryAudit =
    effectiveMode.value === "approve" &&
    props.requiresSecondaryAudit &&
    !props.secondaryAuditConfirmed;
  return (
    !localPassword.value?.trim() || missingSecondaryAudit || props.isSubmitting
  );
});

const config = computed(() => {
  if (effectiveMode.value === "approve") {
    return {
      icon: CheckCircle,
      headerBgClass: "bg-emerald-50/80",
      iconWrapperClass:
        "bg-emerald-50 text-emerald-600 border border-emerald-200",
      title: props.title || "Approve Request",
      promptTitle: "Confirm Approval",
      promptMessage:
        props.description ||
        "Are you sure you want to approve this request? Please verify your identity by entering your password.",
      proceedBtnClass: "btn-primary",
    };
  }
  if (effectiveMode.value === "disburse") {
    return {
      icon: Activity,
      headerBgClass: "bg-slate-50/80",
      iconWrapperClass: "bg-accent/10 text-accent border border-accent/20",
      title: props.title || "Disburse Request",
      promptTitle: "Confirm Disbursement",
      promptMessage:
        props.description ||
        "Are you sure you want to disburse this request? Please verify your identity by entering your password.",
      proceedBtnClass: "btn-primary",
    };
  }
  if (effectiveMode.value === "grant") {
    return {
      icon: Wallet,
      headerBgClass: "bg-emerald-50/80",
      iconWrapperClass:
        "bg-emerald-50 text-emerald-600 border border-emerald-200",
      title: props.title || "Grant Reimbursement",
      promptTitle: "Confirm Grant",
      promptMessage:
        props.description ||
        "Are you sure you want to mark this approved claim as granted? Please verify your identity.",
      proceedBtnClass: "btn-primary",
    };
  }
  if (effectiveMode.value === "revise") {
    return {
      icon: AlertTriangle,
      headerBgClass: "bg-yellow-50/80",
      iconWrapperClass: "bg-orange-50 text-orange-600 border border-orange-200",
      title: props.title || "Request Revision",
      promptTitle: "Confirm Revision Request",
      promptMessage:
        props.description ||
        "Are you sure you want to return this request for revision? The applicant will be asked to revise and resubmit. After 3 revisions, it will be automatically rejected.",
      proceedBtnClass: "btn-primary",
    };
  }
  return {
    icon: XCircle,
    headerBgClass: "bg-red-50/80",
    iconWrapperClass: "bg-red-50 text-red-600 border border-red-200",
    title: props.title || "Reject Request",
    promptTitle: "Confirm Rejection",
    promptMessage:
      props.description ||
      "Are you sure you want to reject this request? This will count toward the 3-strike limit; after 3 returns it becomes automatically rejected.",
    proceedBtnClass: "btn-danger",
  };
});

function handleClose() {
  emit("close");
}

function handleRejectNext() {
  if (!isRejectNextDisabled.value) {
    isConfirmStep.value = true;
  }
}

function handleFinalConfirm() {
  if (props.isSubmitting || isProceedDisabled.value) {
    return;
  }
  emit("confirm");
}
</script>

<template>
  <BaseModal
    :isOpen="isOpen"
    @close="handleClose"
    contentClass="!p-0 overflow-hidden"
  >
    <!-- Header -->
    <div
      class="border-b border-slate-200 px-5 py-4 flex items-center gap-3"
      :class="config.headerBgClass"
    >
      <div
        class="flex h-9 w-9 items-center justify-center rounded-lg"
        :class="config.iconWrapperClass"
      >
        <component :is="config.icon" class="w-5 h-5" />
      </div>
      <div>
        <h3 class="font-heading text-sm font-bold text-slate-800">
          {{
            isConfirmStep && (effectiveMode === "reject" || effectiveMode === "revise")
              ? config.promptTitle
              : config.title
          }}
        </h3>
      </div>
    </div>

    <!-- Content Area -->
    <div class="p-5 flex flex-col gap-4">
      <!-- REJECT/REVISE: Step 1 (Enter Comment) -->
      <template
        v-if="(effectiveMode === 'reject' || effectiveMode === 'revise') && !isConfirmStep"
      >
        <p class="text-sm font-medium text-slate-600 leading-relaxed">
          {{
            effectiveMode === "revise"
              ? "Please provide clear instructions for the applicant to revise and resubmit."
              : "Please provide a specific reason for rejecting this request. The applicant will be notified of this comment."
          }}
        </p>

        <div class="input-wrapper">
          <textarea
            v-model="localComment"
            rows="3"
            :maxlength="maxCommentLength"
            class="input !font-sans resize-none"
            :placeholder="
              effectiveMode === 'revise'
                ? 'Explain what needs to be revised...'
                : 'Explain the reason for rejecting...'
            "
          />
          <div
            class="text-[10px] font-bold uppercase tracking-widest flex justify-end mt-1"
          >
            <span
              :class="
                (localComment || '').trim().length < minCommentLength ||
                (localComment || '').length > maxCommentLength
                  ? 'text-danger'
                  : 'text-accent'
              "
            >
              {{ (localComment || "").length }}/{{ maxCommentLength }}
            </span>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-100"
        >
          <BaseButton
            variant="secondary"
            class="min-h-9 px-4"
            :disabled="isSubmitting"
            @click="handleClose"
          >
            Cancel
          </BaseButton>
          <BaseButton
            :variant="effectiveMode === 'revise' ? 'primary' : 'destructive'"
            class="min-h-9 px-4"
            :disabled="isRejectNextDisabled"
            @click="handleRejectNext"
          >
            {{ effectiveMode === "revise" ? "Confirm Revise" : "Confirm Reject" }}
          </BaseButton>
        </div>
      </template>

      <!-- Confirmation + Password Input -->
      <template v-else>
        <div
          v-if="effectiveMode === 'approve' && fastTrackEligible"
          class="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-medium text-emerald-800"
        >
          <span class="font-bold">[Fast-Track Eligible]</span> All receipts on
          this claim are from Accredited SBSI Vendors with clean OCR and
          duplicate checks.
        </div>

        <div
          v-if="effectiveMode === 'approve' && requiresSecondaryAudit"
          class="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 space-y-2.5"
        >
          <div class="space-y-1">
            <p class="text-xs font-bold text-amber-900">
              Secondary Accounting Audit Required
            </p>
            <p class="text-xs text-amber-800 leading-relaxed">
              This claim includes unverified or flagged vendor receipts that
              require manual verification before approval:
            </p>
            <ul
              v-if="unverifiedVendors.length"
              class="list-disc pl-4 text-xs font-medium text-amber-900"
            >
              <li v-for="vendor in unverifiedVendors" :key="vendor">
                {{ vendor }}
              </li>
            </ul>
          </div>

          <label
            class="flex items-start gap-2 cursor-pointer text-xs font-semibold text-slate-800"
          >
            <input
              type="checkbox"
              class="mt-0.5 h-4 w-4 rounded border-amber-400 text-primary focus:ring-primary"
              :checked="secondaryAuditConfirmed"
              @change="
                emit('update:secondaryAuditConfirmed', $event.target.checked)
              "
            />
            <span
              >Secondary Accounting Audit Completed
              <span class="text-danger">*</span></span
            >
          </label>

          <div class="input-wrapper">
            <label class="input-label mb-1 block"
              >Secondary Audit Note (Optional)</label
            >
            <textarea
              :value="secondaryAuditNote"
              rows="2"
              maxlength="500"
              class="input !font-sans text-xs resize-none"
              placeholder="Document verification details or accounting audit reference..."
              @input="emit('update:secondaryAuditNote', $event.target.value)"
            />
          </div>
        </div>

        <p class="text-sm font-medium text-slate-600 leading-relaxed">
          {{ config.promptMessage }}
        </p>

        <div
          v-if="(effectiveMode === 'reject' || effectiveMode === 'revise') && localComment"
          class="input-wrapper"
        >
          <p class="input-label mb-1 block">
            {{
              effectiveMode === "revise" ? "Revision Instructions" : "Rejection Reason"
            }}
          </p>
          <p class="text-xs text-slate-700 italic break-words">
            "{{ localComment }}"
          </p>
        </div>

        <input
          type="text"
          :value="auth.user?.email"
          autocomplete="username"
          tabindex="-1"
          aria-hidden="true"
          class="sr-only"
        />
        <div class="input-wrapper">
          <label class="input-label mb-1 block"
            >Password <span class="text-danger">*</span></label
          >
          <div class="relative">
            <input
              :type="showConfirmPassword ? 'text' : 'password'"
              class="input w-full pr-10"
              v-model="localPassword"
              placeholder="Enter your current password"
              autocomplete="current-password"
              @keyup.enter="handleFinalConfirm"
            />
            <button
              type="button"
              @click="showConfirmPassword = !showConfirmPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              tabindex="-1"
            >
              <Eye v-if="!showConfirmPassword" class="w-4 h-4" />
              <EyeOff v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-100"
        >
          <BaseButton
            variant="secondary"
            class="min-h-9 px-4"
            :disabled="isSubmitting"
            @click="isConfirmStep ? (isConfirmStep = false) : handleClose()"
          >
            {{ isConfirmStep ? "Back" : "Cancel" }}
          </BaseButton>
          <BaseButton
            :variant="effectiveMode === 'reject' ? 'destructive' : 'primary'"
            :class="effectiveMode === 'reject' ? '' : config.proceedBtnClass"
            class="min-h-9 px-5"
            :loading="isSubmitting"
            :disabled="isProceedDisabled"
            @click="handleFinalConfirm"
          >
            {{ isSubmitting ? "Processing..." : "Proceed" }}
          </BaseButton>
        </div>
      </template>
    </div>
  </BaseModal>
</template>
