<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useSlots } from "vue";
import { ArrowUpDown, Filter, Search } from "lucide-vue-next";

const props = defineProps({
  search: { type: String, default: "" },
  statusValue: { type: String, default: "All" },
  categoryValue: { type: String, default: "All" },
  statuses: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  sortValue: { type: String, default: "" },
  sortOptions: { type: Array, default: () => [] },
  searchPlaceholder: {
    type: String,
    default: "Search requests, merchants, or IDs...",
  },
});

const emit = defineEmits([
  "update:search",
  "update:statusValue",
  "update:categoryValue",
  "update:sortValue",
]);

const slots = useSlots();
const isOpen = ref(false);
const isSortOpen = ref(false);
const root = ref(null);

const hasFilters = computed(
  () => props.statuses.length > 0 || props.categories.length > 0 || Boolean(slots["extra-filters"]),
);

const hasSort = computed(() => props.sortOptions.length > 0);

const normalizedSortOptions = computed(() => {
  return props.sortOptions.map((opt) => {
    if (typeof opt === "object" && opt !== null) {
      return { value: opt.value, label: opt.label || opt.value };
    }
    return { value: opt, label: opt };
  });
});

const currentSortLabel = computed(() => {
  if (!props.sortValue || props.sortValue === "newest") {
    return "Sort by";
  }
  const matched = normalizedSortOptions.value.find(
    (opt) => opt.value === props.sortValue,
  );
  return matched ? `Sort: ${matched.label}` : "Sort by";
});

const popoverWidthClass = computed(() =>
  (props.statuses.length > 0 && props.categories.length > 0) || Boolean(slots["extra-filters"])
    ? "w-[min(30rem,calc(100vw-2rem))]"
    : "w-56",
);

function chooseStatus(status) {
  emit("update:statusValue", status);
}

function chooseCategory(category) {
  emit("update:categoryValue", category);
}

function chooseSort(sortVal) {
  emit("update:sortValue", sortVal);
  isSortOpen.value = false;
}

function toggleFilters() {
  if (!isOpen.value) {
    isSortOpen.value = false;
  }
  isOpen.value = !isOpen.value;
}

function toggleSort() {
  if (!isSortOpen.value) {
    isOpen.value = false;
  }
  isSortOpen.value = !isSortOpen.value;
}

function onDocumentClick(event) {
  if (!root.value || root.value.contains(event.target)) return;
  isOpen.value = false;
  isSortOpen.value = false;
}

onMounted(() => document.addEventListener("click", onDocumentClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick));
</script>

<template>
  <div ref="root" class="relative flex w-full flex-col gap-2 sm:flex-row sm:items-center">
    <div class="relative min-w-0 w-full max-w-lg">
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        :value="search"
        class="input min-h-[42px] pl-9"
        :placeholder="searchPlaceholder"
        autocomplete="off"
        @input="emit('update:search', $event.target.value)"
      />
    </div>

    <div v-if="hasFilters" class="relative w-fit shrink-0">
      <button
        class="btn btn-secondary min-h-[42px] shrink-0 !px-4"
        type="button"
        @click.stop="toggleFilters"
      >
        <Filter class="h-4 w-4" />
        Filters
      </button>

      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="scale-95 opacity-0"
        enter-to-class="scale-100 opacity-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="scale-100 opacity-100"
        leave-to-class="scale-95 opacity-0"
      >
        <div
          v-if="isOpen"
          class="absolute left-0 top-[calc(100%+0.5rem)] z-30 origin-top-left rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          :class="popoverWidthClass"
          @click.stop
        >
          <div class="grid gap-3" :class="statuses.length && categories.length ? 'sm:grid-cols-2' : 'grid-cols-1'">
          <div v-if="statuses.length" class="space-y-1 rounded-lg bg-slate-50/70 p-2">
            <p class="input-label !mb-2">Status</p>
            <div class="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            <button
              v-for="status in statuses"
              :key="`status-${status}`"
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors"
              :class="statusValue === status ? 'bg-primary text-white' : 'text-slate-600 hover:bg-accent-50 hover:text-accent'"
              type="button"
              @click="chooseStatus(status)"
            >
              <span>{{ status }}</span>
              <span
                class="h-2 w-2 rounded-full"
                :class="statusValue === status ? 'bg-white' : 'bg-slate-200'"
              />
            </button>
            </div>
          </div>

          <div v-if="categories.length" class="space-y-1 rounded-lg bg-slate-50/70 p-2">
            <p class="input-label !mb-2">Category</p>
            <div class="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            <button
              v-for="category in categories"
              :key="`category-${category}`"
              class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors"
              :class="categoryValue === category ? 'bg-primary text-white' : 'text-slate-600 hover:bg-accent-50 hover:text-accent'"
              type="button"
              @click="chooseCategory(category)"
            >
              <span>{{ category }}</span>
              <span
                class="h-2 w-2 rounded-full"
                :class="categoryValue === category ? 'bg-white' : 'bg-slate-200'"
              />
            </button>
            </div>
          </div>
          </div>
          <div v-if="$slots['extra-filters']" :class="statuses.length || categories.length ? 'mt-3 pt-3 border-t border-slate-100' : ''">
            <slot name="extra-filters" />
          </div>
        </div>
      </Transition>
    </div>

    <!-- ── Sort Dropdown ── -->
    <div v-if="hasSort" class="relative w-fit shrink-0">
      <button
        class="btn btn-secondary min-h-[42px] shrink-0 !px-4"
        type="button"
        @click.stop="toggleSort"
      >
        <ArrowUpDown class="h-4 w-4" />
        <span>{{ currentSortLabel }}</span>
      </button>

      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="scale-95 opacity-0"
        enter-to-class="scale-100 opacity-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="scale-100 opacity-100"
        leave-to-class="scale-95 opacity-0"
      >
        <div
          v-if="isSortOpen"
          class="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-56 origin-top-left rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          @click.stop
        >
          <div class="space-y-1 rounded-lg bg-slate-50/70 p-2">
            <p class="input-label !mb-2">Sort by</p>
            <div class="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
              <button
                v-for="option in normalizedSortOptions"
                :key="`sort-${option.value}`"
                class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors"
                :class="sortValue === option.value ? 'bg-primary text-white' : 'text-slate-600 hover:bg-accent-50 hover:text-accent'"
                type="button"
                @click="chooseSort(option.value)"
              >
                <span>{{ option.label }}</span>
                <span
                  class="h-2 w-2 rounded-full"
                  :class="sortValue === option.value ? 'bg-white' : 'bg-slate-200'"
                />
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <div v-if="$slots.actions" class="flex w-full shrink-0 sm:ml-auto sm:w-fit">
      <slot name="actions" />
    </div>
  </div>
</template>
