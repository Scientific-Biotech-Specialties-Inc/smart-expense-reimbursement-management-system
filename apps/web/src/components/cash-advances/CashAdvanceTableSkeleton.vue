<script setup>
defineProps({
  isAdmin: {
    type: Boolean,
    default: false,
  },
});
</script>

<template>
  <tr class="whitespace-nowrap">
    <td class="max-w-[200px] px-5 py-5 sm:max-w-[260px]">
      <div
        class="h-3.5 w-28 max-w-full animate-pulse rounded bg-slate-200 sm:w-36"
      ></div>
    </td>
    <td v-if="isAdmin" class="px-5 py-5">
      <div
        class="h-3.5 w-20 max-w-full animate-pulse rounded bg-slate-200 sm:w-24"
      ></div>
    </td>
    <td class="px-5 py-5 text-right">
      <div
        class="ml-auto h-3.5 w-16 max-w-full animate-pulse rounded bg-slate-200 sm:w-20"
      ></div>
    </td>
    <td class="px-5 py-5">
      <div class="h-3.5 w-20 max-w-full animate-pulse rounded bg-slate-200 sm:w-24"></div>
    </td>
    <td class="px-5 py-5 text-center">
      <div
        class="mx-auto h-6 w-20 max-w-full animate-pulse rounded-full bg-slate-200 sm:w-24"
      ></div>
    </td>
    <td class="px-5 py-5">
      <div class="h-3.5 w-16 max-w-full animate-pulse rounded bg-slate-200 sm:w-20"></div>
    </td>
    <td class="px-5 py-5 text-center">
      <div
        class="mx-auto h-5 w-16 max-w-full animate-pulse rounded-full bg-slate-200 sm:w-20"
      ></div>
    </td>
    <td class="px-5 py-5 text-center">
      <div class="mx-auto flex h-8 w-16 max-w-full animate-pulse items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 sm:h-9 sm:w-20 sm:gap-2">
        <div class="h-3 w-3 shrink-0 rounded bg-slate-200 sm:h-3.5 sm:w-3.5"></div>
        <div class="h-2.5 w-5 rounded bg-slate-200 sm:w-7"></div>
      </div>
    </td>
  </tr>
</template>
