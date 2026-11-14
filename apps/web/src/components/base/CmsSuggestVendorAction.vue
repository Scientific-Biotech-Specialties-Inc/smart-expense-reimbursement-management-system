<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useCmsStore } from "@/stores/cms";
import { useToast } from "@/composables/useToast";
import { formatDate } from "@/utils/formatters";
import BaseButton from "@/components/base/BaseButton.vue";
import { Building2, CheckCircle2, AlertTriangle } from "lucide-vue-next";

const props = defineProps({
  receipt: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["suggested"]);

let cmsStore = null;
try {
  cmsStore = useCmsStore();
} catch {
  cmsStore = null;
}

const { addToast } = useToast();

const showForm = ref(false);
const submitting = ref(false);
const suggestedAtLocal = ref(null);
const conflictMessage = ref("");

const effectiveSuggestedAt = computed(
  () =>
    suggestedAtLocal.value ||
    props.receipt?.vendor_suggested_at ||
    props.receipt?.vendorSuggestedAt ||
    null,
);

const canSuggest = computed(() => {
  if (!props.receipt) return false;
  const matched = Boolean(
    props.receipt.vendor_matched ?? props.receipt.vendorMatched,
  );
  const accredited = Boolean(
    props.receipt.vendor_accredited ?? props.receipt.vendorAccredited,
  );
  const auditRequired = Boolean(
    props.receipt.vendor_audit_required ?? props.receipt.vendorAuditRequired,
  );
  return (!matched || !accredited || auditRequired) && !effectiveSuggestedAt.value;
});

const categoryName = computed(() => {
  const c = props.receipt?.expense_category ?? props.receipt?.category;
  if (typeof c === "string") return c;
  return c?.name || "";
});

const form = reactive({
  vendor_name: "",
  tin_number: "",
  industry: "",
  contact_person: "",
  email: "",
  region: "",
  default_expense_category: "",
});

watch(
  () => props.receipt?.id ?? props.receipt?.dbId,
  () => {
    showForm.value = false;
    suggestedAtLocal.value = null;
    conflictMessage.value = "";
    form.vendor_name =
      props.receipt?.vendor_name || props.receipt?.vendorName || "";
    form.tin_number = props.receipt?.tin || "";
    form.default_expense_category = categoryName.value || "";
  },
  { immediate: true },
);

async function submitSuggestion() {
  if (!cmsStore || !form.vendor_name.trim() || submitting.value) return;
  submitting.value = true;
  conflictMessage.value = "";
  try {
    const receiptId = props.receipt?.dbId ?? props.receipt?.id;
    const res = await cmsStore.suggestVendor({
      receipt_id: typeof receiptId === "number" ? receiptId : Number(receiptId) || undefined,
      vendor_name: form.vendor_name.trim(),
      tin_number: form.tin_number.trim() || null,
      industry: form.industry.trim() || null,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      region: form.region.trim() || null,
      default_expense_category: form.default_expense_category.trim() || null,
    });

    if (res.status === 409) {
      conflictMessage.value = res.message || "TIN already exists in CMS suppliers.";
      addToast({ message: conflictMessage.value, type: "warning" });
      return;
    }

    if (res.status === 200 || res.status === 201) {
      suggestedAtLocal.value = res.vendor_suggested_at || new Date().toISOString();
      showForm.value = false;
      addToast({
        message:
          res.status === 200
            ? "Vendor suggestion already pending in CMS."
            : "Vendor suggested to CMS for onboarding.",
        type: "success",
      });
      emit("suggested", res);
      return;
    }

    addToast({
      message: res.message || "Failed to suggest vendor to CMS.",
      type: "error",
    });
  } catch (err) {
    addToast({
      message: err?.message || "Failed to suggest vendor to CMS.",
      type: "error",
    });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="effectiveSuggestedAt || canSuggest || conflictMessage" class="mt-3 pt-3 border-t border-slate-100">
    <div v-if="effectiveSuggestedAt" class="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
      <CheckCircle2 class="w-4 h-4 shrink-0" />
      <span>Suggested to CMS for onboarding ({{ formatDate(effectiveSuggestedAt) }})</span>
    </div>

    <div v-else-if="conflictMessage" class="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <AlertTriangle class="w-4 h-4 shrink-0" />
      <span>{{ conflictMessage }}</span>
    </div>

    <template v-else-if="canSuggest">
      <div v-if="!showForm" class="flex items-center justify-between gap-2">
        <p class="text-xs text-slate-500">
          Vendor is unlisted or requires CMS verification.
        </p>
        <BaseButton
          variant="outline"
          size="sm"
          type="button"
          data-testid="open-suggest-vendor-btn"
          @click="showForm = true"
        >
          <Building2 class="w-3.5 h-3.5" />
          <span>Suggest Vendor to CMS</span>
        </BaseButton>
      </div>

      <div v-else class="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
        <p class="text-xs font-semibold text-slate-700">Suggest Vendor for CMS Onboarding</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input v-model="form.vendor_name" type="text" class="input !py-1.5 text-xs bg-white" placeholder="Vendor Name *" />
          <input v-model="form.tin_number" type="text" class="input !py-1.5 text-xs bg-white" placeholder="TIN Number" />
          <input v-model="form.default_expense_category" type="text" class="input !py-1.5 text-xs bg-white" placeholder="Default Expense Category" />
          <input v-model="form.region" type="text" class="input !py-1.5 text-xs bg-white" placeholder="Region (e.g. Luzon)" />
          <input v-model="form.contact_person" type="text" class="input !py-1.5 text-xs bg-white" placeholder="Contact Person" />
          <input v-model="form.email" type="email" class="input !py-1.5 text-xs bg-white" placeholder="Email" />
        </div>
        <div class="flex justify-end gap-2">
          <BaseButton variant="ghost" size="sm" type="button" :disabled="submitting" @click="showForm = false">
            Cancel
          </BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            type="button"
            :disabled="submitting || !form.vendor_name.trim()"
            @click="submitSuggestion"
          >
            {{ submitting ? "Submitting..." : "Submit to CMS" }}
          </BaseButton>
        </div>
      </div>
    </template>
  </div>
</template>
