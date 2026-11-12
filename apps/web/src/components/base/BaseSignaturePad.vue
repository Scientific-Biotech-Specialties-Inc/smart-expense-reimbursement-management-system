<script setup>
import { ref, onMounted } from "vue";
import BaseButton from "@/components/base/BaseButton.vue";
import { PenTool, RotateCcw } from "lucide-vue-next";

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
    default: "h-36",
  },
});

const emit = defineEmits(["update:modelValue"]);

const signatureCanvas = ref(null);
const isSigning = ref(false);
const hasSignature = ref(Boolean(props.modelValue));

function prepareCanvas() {
  const canvas = signatureCanvas.value;
  if (!canvas) return null;

  if (!canvas.__prepared) {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = (rect.width || 400) * scale;
    canvas.height = (rect.height || 144) * scale;
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
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  hasSignature.value = false;
  emit("update:modelValue", "");
}

onMounted(() => {
  prepareCanvas();
});
</script>

<template>
  <div class="flex flex-col gap-1.5 w-full">
    <div v-if="label" class="flex items-center justify-between">
      <label class="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-sans flex items-center gap-1.5">
        <PenTool class="w-3.5 h-3.5" />
        <span>{{ label }}</span>
      </label>
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
