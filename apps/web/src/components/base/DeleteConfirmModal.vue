<script setup>
import { ref, watch } from 'vue';
import { Trash2, Eye, EyeOff } from 'lucide-vue-next';
import { useAuthStore } from "@/stores/auth";
import BaseModal from "./BaseModal.vue";
import BaseButton from "./BaseButton.vue";

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: "Delete Receipt"
  },
  message: {
    type: String,
    default: "This action cannot be undone."
  },
  loading: {
    type: Boolean,
    default: false,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'confirm']);

const auth = useAuthStore();
const password = ref("");
const showPassword = ref(false);

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    password.value = "";
    showPassword.value = false;
  }
});

function handleConfirm() {
  if (props.loading || props.isSubmitting) return;
  if (password.value) {
    emit('confirm', password.value);
  }
}

function close() {
  if (props.loading || props.isSubmitting) return;
  emit('update:modelValue', false);
}
</script>

<template>
  <BaseModal :is-open="modelValue" @close="close" max-width-class="max-w-sm">
    <div class="p-6">
      <!-- Centered Header per Section VI.5 -->
      <div class="flex flex-col items-center text-center gap-4">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 bg-red-50 text-red-600 border border-red-200"
        >
          <Trash2 class="w-7 h-7" />
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

      <!-- High-Security Action: Password Confirmation (Section VI.5) -->
      <div class="mt-6">
        <p class="text-sm text-slate-600 mb-4 text-center">
          Please enter your password to confirm this action.
        </p>
        <input
          type="text"
          :value="auth.user?.email"
          autocomplete="username"
          tabindex="-1"
          aria-hidden="true"
          class="sr-only"
        />
        <div class="input-wrapper">
          <label class="input-label">Password</label>
          <div class="relative">
            <input
              :type="showPassword ? 'text' : 'password'"
              class="input w-full pr-10"
              v-model="password"
              placeholder="Enter your password"
              autocomplete="current-password"
              @keyup.enter="handleConfirm"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              tabindex="-1"
            >
              <Eye v-if="!showPassword" class="w-4 h-4" />
              <EyeOff v-else class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Right-Aligned Action Footer -->
      <div class="flex items-center justify-end gap-3 mt-6">
        <BaseButton
          variant="secondary"
          class="px-5 min-h-10"
          :disabled="loading || isSubmitting"
          @click="close"
        >
          Cancel
        </BaseButton>
        <BaseButton
          variant="destructive"
          class="px-5 min-h-10"
          :disabled="password.length === 0 || loading || isSubmitting"
          :loading="loading || isSubmitting"
          @click="handleConfirm"
        >
          Confirm Delete
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
