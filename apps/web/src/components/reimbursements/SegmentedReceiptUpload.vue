<script setup>
import { ref, computed } from "vue";
import {
  Layers,
  UploadCloud,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  CheckCircle2,
  Info,
} from "lucide-vue-next";

import BaseButton from "@/components/base/BaseButton.vue";

const props = defineProps({
  maxSegments: {
    type: Number,
    default: 6,
  },
});

const emit = defineEmits(["submit-segments", "cancel"]);

const stagedFiles = ref([]); // array of { id, file, url }
const dragOver = ref(false);
const fileInputRef = ref(null);
const isStitching = ref(false);

function handleFileSelect(e) {
  addFiles(e.target.files);
  if (e.target) e.target.value = "";
}

function handleDrop(e) {
  dragOver.value = false;
  addFiles(e.dataTransfer.files);
}

function addFiles(fileList) {
  const allowed = ["image/jpeg", "image/jpg", "image/png"];
  const files = Array.from(fileList || []).filter((f) =>
    allowed.includes(f.type),
  );

  for (const file of files) {
    if (stagedFiles.value.length >= props.maxSegments) break;
    stagedFiles.value.push({
      id: `seg-${Date.now()}-${Math.random()}`,
      file,
      url: URL.createObjectURL(file),
    });
  }
}

function removeSegment(index) {
  const item = stagedFiles.value[index];
  if (item && item.url.startsWith("blob:")) {
    URL.revokeObjectURL(item.url);
  }
  stagedFiles.value.splice(index, 1);
}

function moveUp(index) {
  if (index <= 0) return;
  const temp = stagedFiles.value[index];
  stagedFiles.value[index] = stagedFiles.value[index - 1];
  stagedFiles.value[index - 1] = temp;
}

function moveDown(index) {
  if (index >= stagedFiles.value.length - 1) return;
  const temp = stagedFiles.value[index];
  stagedFiles.value[index] = stagedFiles.value[index + 1];
  stagedFiles.value[index + 1] = temp;
}

const canSubmit = computed(() => stagedFiles.value.length >= 2);

function handleSubmit() {
  if (!canSubmit.value || isStitching.value) return;
  isStitching.value = true;
  const rawFiles = stagedFiles.value.map((item) => item.file);
  emit("submit-segments", rawFiles);
}
</script>

<template>
  <div
    class="border border-accent/20 rounded-2xl p-6 bg-white shadow-xl animate-fade-up"
  >
    <!-- Header -->
    <div class="flex items-start justify-between border-b border-slate-100 pb-4 mb-5">
      <div class="flex items-center gap-3">
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent"
        >
          <Layers class="h-5 w-5" />
        </span>
        <div>
          <h3
            class="text-base font-bold text-primary"
            style="font-family: 'Poppins', sans-serif"
          >
            Upload Long Receipt in Segments
          </h3>
          <p class="text-xs text-slate-500 font-medium">
            Upload 2 to {{ maxSegments }} overlapping photos of 1 receipt (top to bottom).
          </p>
        </div>
      </div>
      <button
        type="button"
        class="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        @click="emit('cancel')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Hidden input -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      accept="image/jpeg,image/png"
      multiple
      @change="handleFileSelect"
    />

    <!-- Drop Zone -->
    <div
      v-if="stagedFiles.length < maxSegments"
      class="border-2 border-dashed rounded-xl p-5 mb-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-150"
      :class="[
        dragOver
          ? 'border-accent bg-accent-50/50'
          : 'border-slate-200 bg-slate-50/60 hover:border-accent/40 hover:bg-slate-50',
      ]"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="handleDrop"
      @click="fileInputRef?.click()"
    >
      <UploadCloud class="h-8 w-8 text-accent mb-2 stroke-[1.5]" />
      <p class="text-xs font-bold text-slate-700">
        Click or drag photo segments here
      </p>
      <p class="text-[11px] font-medium text-slate-400 mt-0.5">
        Add segment {{ stagedFiles.length + 1 }} of {{ maxSegments }} (JPG or PNG)
      </p>
    </div>

    <!-- Staged Segments List -->
    <div v-if="stagedFiles.length > 0" class="space-y-3 mb-6">
      <div class="flex items-center justify-between px-1">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-400">
          Receipt Segments Order (Top to Bottom)
        </span>
        <span class="text-xs font-bold text-accent">
          {{ stagedFiles.length }} / {{ maxSegments }} Segments
        </span>
      </div>

      <div
        v-for="(item, idx) in stagedFiles"
        :key="item.id"
        class="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm"
      >
        <div class="flex items-center gap-3 min-w-0">
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold"
          >
            {{ idx + 1 }}
          </span>
          <div
            class="h-12 w-12 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm flex items-center justify-center"
          >
            <img
              :src="item.url"
              alt="Segment preview"
              class="h-full w-full object-cover"
            />
          </div>
          <div class="min-w-0">
            <p class="truncate text-xs font-bold text-slate-800">
              {{ item.file.name }}
            </p>
            <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              {{ idx === 0 ? "Top Section" : idx === stagedFiles.length - 1 ? "Bottom Section" : `Middle Section ${idx}` }}
            </p>
          </div>
        </div>

        <!-- Action Controls: Up, Down, Remove -->
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="idx === 0"
            title="Move segment up"
            @click="moveUp(idx)"
          >
            <ArrowUp class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
            :disabled="idx === stagedFiles.length - 1"
            title="Move segment down"
            @click="moveDown(idx)"
          >
            <ArrowDown class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="p-1.5 text-slate-400 hover:text-danger hover:bg-red-50 rounded-md"
            title="Remove segment"
            @click="removeSegment(idx)"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Info Banner -->
    <div
      class="mb-6 rounded-xl border border-accent/15 bg-accent-50/50 p-3.5 flex items-start gap-2.5"
    >
      <Info class="h-4 w-4 text-accent shrink-0 mt-0.5" />
      <p class="text-xs font-medium text-slate-600">
        All uploaded parts will be automatically stitched into one tall receipt image before OCR processing. This will count as <strong>1 receipt</strong>.
      </p>
    </div>

    <!-- Footer Actions -->
    <div class="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
      <button
        type="button"
        class="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <BaseButton
        variant="primary"
        class="min-h-[38px] text-xs font-bold"
        :disabled="!canSubmit || isStitching"
        :loading="isStitching"
        @click="handleSubmit"
      >
        <CheckCircle2 class="h-4 w-4 mr-1.5" />
        Combine & Process as 1 Receipt
      </BaseButton>
    </div>
  </div>
</template>
