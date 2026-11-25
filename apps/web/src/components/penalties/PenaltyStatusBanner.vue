<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { usePenaltyStore } from "@/stores/penalty";
import BaseButton from "@/components/base/BaseButton.vue";
import { formatMediumDate, formatSourceModule } from "@/utils/penaltyFormatters";
import { AlertTriangle, ShieldAlert, ArrowRight, FileText } from "lucide-vue-next";

const props = defineProps({
  onAppealAction: {
    type: Function,
    default: null,
  },
});

const router = useRouter();
const penaltyStore = usePenaltyStore();

const strikesCount = computed(() => penaltyStore.activeStrikesCount);
const strikeLimit = computed(() => penaltyStore.strikeLimit || 3);
const isPenalized = computed(
  () => penaltyStore.isPenalized || strikesCount.value >= strikeLimit.value,
);
const shouldRender = computed(
  () => isPenalized.value || strikesCount.value > 0,
);
const activeStrikes = computed(() => penaltyStore.activeStrikes || []);
const pendingAppeal = computed(() => penaltyStore.pendingAppeal);

function goToRecord(redirectPath) {
  if (!redirectPath) return;
  router.push(redirectPath);
}

function handleAppealCta() {
  if (props.onAppealAction) {
    props.onAppealAction();
    return;
  }
  router.push("/penalties");
}
</script>

<template>
  <section
    v-if="shouldRender"
    data-testid="penalty-status-banner"
    :role="isPenalized ? 'alert' : 'status'"
    :class="[
      'rounded-xl border p-5',
      isPenalized
        ? 'border-red-300 bg-red-50 text-red-950'
        : 'border-amber-300 bg-amber-50 text-amber-950',
    ]"
  >
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div class="flex items-start gap-3.5 min-w-0">
        <div
          :class="[
            'mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border',
            isPenalized
              ? 'border-red-200 bg-red-100 text-red-700'
              : 'border-amber-200 bg-amber-100 text-amber-800',
          ]"
        >
          <ShieldAlert v-if="isPenalized" class="h-5 w-5" aria-hidden="true" />
          <AlertTriangle v-else class="h-5 w-5" aria-hidden="true" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-3">
            <h2
              :class="[
                'text-base font-bold leading-snug',
                isPenalized ? 'text-red-950' : 'text-amber-950',
              ]"
            >
              {{
                isPenalized
                  ? "Account Submission Hold Active"
                  : "Compliance Warning: Active Strikes Recorded"
              }}
            </h2>
            <span
              data-testid="banner-strike-counter"
              :class="[
                'text-sm font-bold tabular-nums',
                isPenalized ? 'text-red-800' : 'text-amber-900',
              ]"
            >
              {{ strikesCount }}/{{ strikeLimit }}
            </span>
          </div>

          <p
            class="mt-1 text-sm leading-relaxed max-w-[65ch]"
            :class="isPenalized ? 'text-red-900' : 'text-amber-900'"
          >
            <template v-if="isPenalized">
              New Reimbursements and Cash Advances are paused until your compliance appeal letter is approved.
            </template>
            <template v-else>
              Resolve your overdue items promptly to avoid reaching {{ strikeLimit }} strikes and triggering a submission hold.
            </template>
          </p>

          <!-- Strike Meter -->
          <div class="mt-3 flex max-w-xs items-center gap-1.5" aria-hidden="true">
            <span
              v-for="slot in strikeLimit"
              :key="slot"
              class="h-2 flex-1 rounded-full"
              :class="
                slot <= strikesCount
                  ? isPenalized
                    ? 'bg-red-600'
                    : 'bg-amber-600'
                  : isPenalized
                    ? 'bg-red-200'
                    : 'bg-amber-200'
              "
            />
          </div>
        </div>
      </div>

      <div v-if="isPenalized" class="flex-shrink-0">
        <BaseButton
          data-testid="banner-appeal-cta"
          variant="destructive"
          size="md"
          @click="handleAppealCta"
        >
          <FileText class="h-4 w-4" aria-hidden="true" />
          <span>
            {{ pendingAppeal ? "View Pending Appeal" : "Submit Appeal Letter" }}
          </span>
        </BaseButton>
      </div>
    </div>

    <!-- Active Strike Quick Redirects -->
    <div
      v-if="activeStrikes.length > 0"
      class="mt-4 border-t pt-3.5 space-y-2.5"
      :class="isPenalized ? 'border-red-200' : 'border-amber-200'"
    >
      <div
        v-for="strike in activeStrikes"
        :key="strike.id"
        class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0 text-sm">
          <span class="font-semibold">
            {{ formatSourceModule(strike.source_module) }}
            <span v-if="strike.source_reference" class="tabular-nums">
              ({{ strike.source_reference }})
            </span>
          </span>
          <span class="mx-1.5 text-xs opacity-70">|</span>
          <span>{{ strike.reason }}</span>
          <span class="ml-2 text-xs opacity-80">
            Issued {{ formatMediumDate(strike.created_at) }}
          </span>
        </div>

        <BaseButton
          v-if="strike.redirect_path"
          :data-testid="`go-to-record-${strike.id}`"
          variant="secondary"
          size="sm"
          class="flex-shrink-0"
          @click="goToRecord(strike.redirect_path)"
        >
          <span>Go to Record</span>
          <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
        </BaseButton>
      </div>
    </div>
  </section>
</template>
