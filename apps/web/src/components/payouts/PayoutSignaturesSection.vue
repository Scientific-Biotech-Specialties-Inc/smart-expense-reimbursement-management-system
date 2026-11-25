<script setup>
import { computed } from "vue";
import BaseSignaturePad from "@/components/base/BaseSignaturePad.vue";
import { formatAmount, formatDate } from "@/utils/formatters";

const props = defineProps({
  isDisbursed: {
    type: Boolean,
    default: false,
  },
  payoutMethod: {
    type: String,
    default: "",
  },
  grantedBy: {
    type: String,
    default: "",
  },
  grantedAt: {
    type: String,
    default: "",
  },
  granterSignature: {
    type: String,
    default: "",
  },
  employeeSignature: {
    type: String,
    default: "",
  },
  acknowledgedAt: {
    type: String,
    default: "",
  },
  amount: {
    type: [Number, String],
    default: 0,
  },
  currency: {
    type: String,
    default: "PHP",
  },
  canAcknowledge: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  certifyLabel: {
    type: String,
    default: "payout",
  },
  emptyMessage: {
    type: String,
    default: "Signatures and payout details will appear once the payout is granted.",
  },
  showMetaCard: {
    type: Boolean,
    default: true,
  },
});

const hasPayoutMetadata = computed(() =>
  Boolean(props.payoutMethod || props.grantedBy || props.granterSignature),
);

const isVisible = computed(() =>
  Boolean(
    props.employeeSignature ||
      props.acknowledgedAt ||
      hasPayoutMetadata.value ||
      props.isDisbursed,
  ),
);

const isAcknowledged = computed(() =>
  Boolean(props.acknowledgedAt || props.employeeSignature),
);

const formattedAmount = computed(() =>
  formatAmount(props.amount || 0, props.currency || "PHP"),
);
</script>

<template>
  <div v-if="isVisible" class="space-y-4">
    <div
      v-if="showMetaCard && hasPayoutMetadata"
      class="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3"
    >
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div v-if="payoutMethod">
          <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Payout Method
          </p>
          <p class="text-xs font-semibold text-slate-700 mt-0.5">
            {{ payoutMethod }}
          </p>
        </div>
        <div v-if="grantedBy">
          <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Granted By
          </p>
          <p class="text-xs font-semibold text-slate-700 mt-0.5">
            {{ grantedBy }}
          </p>
        </div>
        <div v-if="grantedAt">
          <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Granted Date
          </p>
          <p class="text-xs font-semibold text-slate-700 mt-0.5">
            {{ formatDate(grantedAt) }}
          </p>
        </div>
      </div>
      <div
        v-if="granterSignature"
        class="pt-2 border-t border-slate-200/60"
      >
        <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          Granter's Signature
        </p>
        <div
          class="flex h-24 w-full max-w-sm items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <img
            :src="granterSignature"
            class="max-h-full max-w-full object-contain"
            alt="Granter Signature"
          />
        </div>
      </div>
    </div>

    <p v-if="!isAcknowledged" class="text-sm text-slate-600">
      <template v-if="canAcknowledge">
        I certify that I received the {{ certifyLabel }} of
        <span class="font-semibold text-primary">{{ formattedAmount }}</span>.
      </template>
      <template v-else>
        Employee certifies receipt of
        <span class="font-semibold text-primary">{{ formattedAmount }}</span>.
      </template>
    </p>
    <p v-else class="text-sm text-slate-600">
      <template v-if="isAdmin && !canAcknowledge">
        Employee certified receipt of
        <span class="font-semibold text-primary">{{ formattedAmount }}</span>
      </template>
      <template v-else>
        Acknowledged and certified receipt of
        <span class="font-semibold text-primary">{{ formattedAmount }}</span>
      </template>
      <span v-if="acknowledgedAt" class="text-slate-400 text-xs">
        on {{ formatDate(acknowledgedAt) }}
      </span>.
    </p>

    <div v-if="isAcknowledged || canAcknowledge">
      <p class="text-[11px] text-slate-400 uppercase tracking-wide mb-2">
        Signature
      </p>
      <div
        v-if="isAcknowledged"
        class="relative flex h-32 w-full max-w-lg mx-auto items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <img
          v-if="employeeSignature"
          :src="employeeSignature"
          class="max-h-full max-w-full object-contain"
          alt="Signature"
        />
        <span
          class="absolute bottom-2 right-3 text-[10px] font-medium text-emerald-600"
        >
          Verified
        </span>
      </div>
      <div v-else-if="canAcknowledge" class="flex flex-col items-center">
        <BaseSignaturePad
          model-value=""
          label=""
          placeholder="Click Acknowledge below to sign in the payout modal"
          :disabled="true"
          :allow-profile-signature="false"
          :show-helper-note="false"
        />
      </div>
    </div>
  </div>

  <div
    v-else
    class="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-500"
  >
    {{ emptyMessage }}
  </div>
</template>
