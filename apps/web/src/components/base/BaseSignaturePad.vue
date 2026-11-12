<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { useAuthStore } from "@/stores/auth";
import { PenTool, RotateCcw, Sparkles, CheckCircle2 } from "lucide-vue-next";

const props = defineProps({
  modelValue: {
    type: String,
    default: "",
  },
  label: {
    type: String,
    default: "Signature",
  },
  placeholder: {
    type: String,
    default: "Draw your signature here",
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  heightClass: {
    type: String,
    default: "h-32",
  },
  maxWidthClass: {
    type: String,
    default: "max-w-lg",
  },
  center: {
    type: Boolean,
    default: true,
  },
  allowProfileSignature: {
    type: Boolean,
    default: true,
  },
  savedSignature: {
    type: String,
    default: null,
  },
  showHelperNote: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["update:modelValue"]);

const signatureCanvas = ref(null);
const isSigning = ref(false);
const hasSignature = ref(Boolean(props.modelValue));

const availableSavedSignature = computed(() => {
  if (!props.allowProfileSignature) return "";
  if (typeof props.savedSignature === "string") return props.savedSignature;
  try {
    const auth = useAuthStore();
    return auth?.user?.signature || "";
  } catch {
    return "";
  }
});

const canUseSavedSignature = computed(() => {
  if (props.disabled || !props.allowProfileSignature) return false;
  const saved = availableSavedSignature.value;
  if (!saved) return false;
  return props.modelValue !== saved;
});

const isUsingSavedSignature = computed(() => {
  const saved = availableSavedSignature.value;
  return Boolean(saved && props.modelValue && props.modelValue === saved);
});

function prepareCanvas() {
  const canvas = signatureCanvas.value;
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const targetW = Math.round((rect.width || 400) * scale);
  const targetH = Math.round((rect.height || 128) * scale);

  if (canvas.width !== targetW || canvas.height !== targetH || !canvas.__prepared) {
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(scale, scale);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1E293B"; // Dark slate
    }
    canvas.__prepared = true;
  }

  return canvas.getContext("2d");
}

function renderDataUrlOnCanvas(dataUrl) {
  const canvas = signatureCanvas.value;
  if (!canvas) return;
  const ctx = prepareCanvas();
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 400;
  const height = rect.height || 128;

  if (!dataUrl) {
    return;
  }

  hasSignature.value = true;
  if (typeof Image !== "undefined") {
    const img = new Image();
    const draw = () => {
      // Clear before drawing to avoid stacking/artifacts
      ctx.clearRect(0, 0, width, height);

      const naturalW = img.naturalWidth || img.width || width;
      const naturalH = img.naturalHeight || img.height || height;

      // Keep signature proportional without horizontal/vertical stretching (object-fit: contain)
      // Provide 16px inner padding so the stroke doesn't bump the border
      const padding = 16;
      const availW = Math.max(width - padding * 2, 50);
      const availH = Math.max(height - padding * 2, 50);

      const scale = Math.min(availW / naturalW, availH / naturalH, 1);
      const drawWidth = naturalW * scale;
      const drawHeight = naturalH * scale;

      // Center horizontally and vertically within the canvas box
      const offsetX = (width - drawWidth) / 2;
      const offsetY = (height - drawHeight) / 2;

      ctx.drawImage?.(img, offsetX, offsetY, drawWidth, drawHeight);
    };

    img.onload = draw;
    img.src = dataUrl;
    if (img.complete) {
      try {
        draw();
      } catch {
        // ignore
      }
    }
  }
}

watch(
  () => props.modelValue,
  (newVal, oldVal) => {
    if (newVal !== oldVal) {
      if (newVal) {
        hasSignature.value = true;
        nextTick(() => renderDataUrlOnCanvas(newVal));
      } else {
        hasSignature.value = false;
        const canvas = signatureCanvas.value;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const rect = canvas.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width || 400, rect.height || 128);
          }
        }
      }
    }
  }
);

function getPoint(e) {
  const rect = signatureCanvas.value.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function startStroke(e) {
  if (props.disabled) return;
  const ctx = prepareCanvas();
  if (!ctx) return;

  isSigning.value = true;
  hasSignature.value = true;
  signatureCanvas.value.setPointerCapture?.(e.pointerId);

  const p = getPoint(e);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
}

function drawStroke(e) {
  if (!isSigning.value || props.disabled) return;
  const ctx = prepareCanvas();
  if (!ctx) return;

  const p = getPoint(e);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function endStroke() {
  if (!isSigning.value) return;
  isSigning.value = false;
  if (signatureCanvas.value) {
    const dataUrl = signatureCanvas.value.toDataURL("image/png");
    emit("update:modelValue", dataUrl);
  }
}

function clearSignature() {
  if (props.disabled) return;
  const canvas = signatureCanvas.value;
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width || 400, rect.height || 128);
    }
  }
  hasSignature.value = false;
  emit("update:modelValue", "");
}

function useSavedSignature() {
  if (props.disabled) return;
  const saved = availableSavedSignature.value;
  if (!saved) return;
  hasSignature.value = true;
  emit("update:modelValue", saved);
  nextTick(() => {
    renderDataUrlOnCanvas(saved);
  });
}

onMounted(() => {
  prepareCanvas();
  if (props.modelValue) {
    renderDataUrlOnCanvas(props.modelValue);
  } else if (props.allowProfileSignature && availableSavedSignature.value) {
    emit("update:modelValue", availableSavedSignature.value);
    renderDataUrlOnCanvas(availableSavedSignature.value);
  }
});
</script>

<template>
  <div class="flex flex-col gap-1.5 w-full" :class="[maxWidthClass, center ? 'mx-auto' : '']">
    <div v-if="label || canUseSavedSignature || hasSignature" class="flex items-center justify-between">
      <label v-if="label" class="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-sans flex items-center gap-1.5">
        <PenTool class="w-3.5 h-3.5" />
        <span>{{ label }}</span>
      </label>
      <div v-else />

      <div class="flex items-center gap-2">
        <button
          v-if="canUseSavedSignature"
          type="button"
          data-testid="use-saved-signature-btn"
          class="text-xs text-primary hover:text-primary-dark font-medium flex items-center gap-1 transition-colors font-sans"
          @click="useSavedSignature"
        >
          <Sparkles class="w-3 h-3 text-primary" />
          <span>Use Saved Signature</span>
        </button>

        <button
          v-if="hasSignature && !disabled"
          type="button"
          data-testid="clear-signature-btn"
          class="text-xs text-slate-400 hover:text-danger flex items-center gap-1 transition-colors font-sans"
          @click="clearSignature"
        >
          <RotateCcw class="w-3 h-3" />
          <span>Clear</span>
        </button>
      </div>
    </div>

    <!-- Pre-filled notification badge -->
    <div
      v-if="isUsingSavedSignature && showHelperNote"
      data-testid="saved-signature-indicator"
      class="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md font-sans"
    >
      <CheckCircle2 class="w-3.5 h-3.5 shrink-0 text-emerald-600" />
      <span>Pre-filled from your profile signature. You can use this or click Clear to redraw.</span>
    </div>

    <div
      class="relative w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      :class="[heightClass, disabled ? 'opacity-60 pointer-events-none' : '']"
    >
      <canvas
        ref="signatureCanvas"
        class="h-full w-full touch-none cursor-crosshair"
        @pointerdown="startStroke"
        @pointermove="drawStroke"
        @pointerup="endStroke"
        @pointerleave="endStroke"
        @pointercancel="endStroke"
      />

      <span
        v-if="!hasSignature"
        class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400 select-none font-sans"
      >
        {{ placeholder }}
      </span>
    </div>
  </div>
</template>
