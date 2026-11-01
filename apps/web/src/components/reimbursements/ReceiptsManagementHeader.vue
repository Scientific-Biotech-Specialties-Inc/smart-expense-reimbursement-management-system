<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { CheckCircle2, PlusCircle, Layers, ChevronDown, UploadCloud } from "lucide-vue-next";

defineProps({
  receiptCount: {
    type: Number,
    required: true,
  },
});

defineEmits(["add-receipts", "open-segmented-upload"]);

const isDropdownOpen = ref(false);
const dropdownRef = ref(null);

function handleWindowClick(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isDropdownOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', handleWindowClick);
});
</script>

<template>
  <section class="card p-6">
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex items-center gap-3">
        <h2
          class="text-lg font-bold text-primary"
          style="font-family: 'Poppins', sans-serif"
        >
          Upload Receipts
        </h2>
        <span
          class="badge text-[11px] font-bold"
          :class="
            receiptCount >= 1
              ? 'bg-accent-50 border-accent/15 text-accent'
              : 'bg-red-50 border-red-100 text-danger'
          "
        >
          {{ receiptCount }} receipt{{ receiptCount !== 1 ? "s" : "" }}
        </span>
      </div>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          v-if="receiptCount >= 1"
          class="flex items-center gap-2 text-accent text-sm font-semibold"
        >
          <CheckCircle2 class="w-4 h-4" /> Ready to submit
        </div>

        <div ref="dropdownRef" class="relative inline-block text-left" @click.stop>
          <div>
            <button
              @click.stop="isDropdownOpen = !isDropdownOpen"
              class="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-bold text-white transition-colors hover:bg-primary/90 focus:outline-none"
            >
              <PlusCircle class="h-3.5 w-3.5" />
              Add More Receipts
              <ChevronDown class="w-3.5 h-3.5 ml-1 -mr-1" aria-hidden="true" />
            </button>
          </div>
          <transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0"
          >
            <div
              v-if="isDropdownOpen"
              class="absolute z-10 w-48 mt-2 origin-top-right right-0 bg-white divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            >
              <div class="px-1 py-1">
                <button
                  class="group flex w-full items-center rounded-md px-2 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white"
                  @click="$emit('add-receipts'); isDropdownOpen = false"
                >
                  <UploadCloud class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                  Single Receipt
                </button>
                <button
                  class="group flex w-full items-center rounded-md px-2 py-2 text-xs font-bold text-gray-900 hover:bg-accent hover:text-white"
                  @click="$emit('open-segmented-upload'); isDropdownOpen = false"
                >
                  <Layers class="mr-2 h-4 w-4 text-accent group-hover:text-white" aria-hidden="true" />
                  Multi Receipt
                </button>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>
  </section>
</template>
