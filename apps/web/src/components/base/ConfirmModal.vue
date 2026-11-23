<script setup>
import { ref, watch } from "vue";
import BaseModal from "./BaseModal.vue";
import BaseButton from "./BaseButton.vue";
import { AlertTriangle, CheckCircle } from "lucide-vue-next";

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  confirmText: {
    type: String,
    default: "Confirm",
  },
  cancelText: {
    type: String,
    default: "Cancel",
  },
  danger: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "confirm"]);
const isClicked = ref(false);

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      isClicked.value = false;
    }
  }
);

function handleConfirm() {
  if (props.loading || isClicked.value) return;
  isClicked.value = true;
  emit("confirm");
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="$emit('close')" max-width-class="max-w-sm">
    <div class="p-6">
      <!-- Centered Header per Section VI.5 -->
      <div class="flex flex-col items-center text-center gap-4">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
          :class="danger ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'"
        >
          <AlertTriangle v-if="danger" class="w-7 h-7" />
          <CheckCircle v-else class="w-7 h-7" />
        </div>
        <div>
          <h3 class="font-sans text-xl font-bold text-slate-800">
            {{ title }}
          </h3>
          <p class="font-sans text-sm text-slate-500 mt-2 leading-relaxed">
            {{ message }}
          </p>
        </div>
      </div>

      <!-- Right-Aligned Action Footer with BaseButton -->
      <div class="flex items-center justify-end gap-3 mt-8">
        <BaseButton
          variant="secondary"
          class="px-5 min-h-10"
          :disabled="loading || isClicked"
          @click="$emit('close')"
        >
          {{ cancelText }}
        </BaseButton>
        <BaseButton
          :variant="danger ? 'destructive' : 'primary'"
          :loading="loading || isClicked"
          :disabled="loading || isClicked"
          class="px-5 min-h-10"
          @click="handleConfirm"
        >
          {{ confirmText }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
