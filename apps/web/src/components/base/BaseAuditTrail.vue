<template>
  <div class="rounded-xl border border-slate-200 bg-white overflow-hidden text-slate-900 shadow-xs font-sans">
    <!-- Header -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 cursor-pointer select-none transition-colors hover:bg-slate-100/70"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center gap-2">
        <History class="w-4 h-4 text-slate-500 shrink-0" />
        <h4 class="text-sm font-semibold text-slate-800 tracking-tight">
          Audit Trail
        </h4>
      </div>

      <div class="flex items-center flex-wrap gap-2.5" @click.stop>
        <!-- Download Log Dropdown Button -->
        <div
          v-if="trail.length > 0"
          ref="downloadGroupRef"
          data-testid="audit-trail-download-group"
          class="relative inline-block text-left"
        >
          <button
            type="button"
            data-testid="audit-trail-download-btn"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 hover:bg-slate-100 text-slate-700 bg-white transition-colors cursor-pointer"
            @click="isDownloadMenuOpen = !isDownloadMenuOpen"
            aria-haspopup="true"
            :aria-expanded="isDownloadMenuOpen"
            title="Download audit trail log"
          >
            <Download class="w-3.5 h-3.5 text-slate-500" />
            <span>Download</span>
            <ChevronDown class="w-3 h-3 text-slate-400" />
          </button>

          <!-- Dropdown Menu -->
          <div
            v-show="isDownloadMenuOpen"
            class="absolute right-0 mt-1.5 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 z-30 focus:outline-none"
            @click.stop
          >
            <button
              type="button"
              data-testid="audit-export-xlsx-btn"
              class="flex w-full items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors text-left cursor-pointer"
              @click="handleExportAndClose('xlsx')"
            >
              <span>Excel</span>
              <span class="text-[10px] font-semibold text-slate-400">.xlsx</span>
            </button>
            <button
              type="button"
              data-testid="audit-export-csv-btn"
              class="flex w-full items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors text-left cursor-pointer"
              @click="handleExportAndClose('csv')"
            >
              <span>CSV</span>
              <span class="text-[10px] font-semibold text-slate-400">.csv</span>
            </button>
            <button
              type="button"
              data-testid="audit-export-pdf-btn"
              class="flex w-full items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors text-left cursor-pointer"
              @click="handleExportAndClose('pdf')"
            >
              <span>PDF Document</span>
              <span class="text-[10px] font-semibold text-slate-400">.pdf</span>
            </button>
            <button
              type="button"
              data-testid="audit-export-json-btn"
              class="flex w-full items-center justify-between px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors text-left cursor-pointer"
              @click="handleExportAndClose('json')"
            >
              <span>JSON Data</span>
              <span class="text-[10px] font-semibold text-slate-400">.json</span>
            </button>
          </div>
        </div>

        <div v-if="trail.length > 0 && trail.length > 1" class="h-4 w-px bg-slate-200 hidden sm:block" />

        <!-- Sort Toggle Button -->
        <button
          v-if="trail.length > 1"
          type="button"
          data-testid="audit-trail-sort-btn"
          class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
          @click="toggleSort"
          title="Toggle sort direction"
        >
          <ArrowUpDown class="w-3.5 h-3.5" />
          <span>{{ sortOrder === 'latest' ? 'Latest First ↓' : 'Oldest First ↑' }}</span>
        </button>

        <!-- Collapse/Expand Toggle -->
        <button
          type="button"
          data-testid="audit-trail-collapse-btn"
          class="p-1 rounded-md hover:bg-slate-200/60 text-slate-500 transition-colors cursor-pointer"
          @click="isOpen = !isOpen"
          :aria-expanded="isOpen"
          aria-label="Toggle audit trail visibility"
        >
          <ChevronUp v-if="isOpen" class="w-4 h-4" />
          <ChevronDown v-else class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Body / Vertical Timeline -->
    <div v-if="isOpen" data-testid="audit-trail-body" class="bg-white">
      <!-- Empty State -->
      <div
        v-if="!trail || trail.length === 0"
        class="py-8 text-center text-xs text-slate-400 border-t border-slate-200"
      >
        No audit trail records found for this request.
      </div>

      <!-- Timeline List -->
      <div v-else class="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/30">
        <div class="relative">
          <div
            v-for="(entry, index) in visibleTrail"
            :key="entry.id"
            data-testid="audit-event-item"
            class="relative flex items-center gap-3 sm:gap-3.5 pb-4 last:pb-0"
          >
            <!-- Timeline track & centered icon node -->
            <div class="relative flex flex-col items-center self-stretch shrink-0 w-8">
              <!-- Top connecting line segment -->
              <div
                v-if="index !== 0"
                class="w-0.5 bg-slate-200 grow"
                aria-hidden="true"
              />
              <div
                v-else
                class="grow"
                aria-hidden="true"
              />

              <!-- Circular Icon Node (centered vertically with card) -->
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-2xs z-10 transition-colors my-auto"
                :class="getNodeClasses(entry)"
              >
                <component :is="getEventIcon(entry)" class="h-3.5 w-3.5" />
              </div>

              <!-- Bottom connecting line segment (extends to next item) -->
              <div
                v-if="index !== visibleTrail.length - 1"
                class="w-0.5 bg-slate-200 grow -mb-4"
                aria-hidden="true"
              />
              <div
                v-else
                class="grow"
                aria-hidden="true"
              />
            </div>

            <!-- Event Card -->
            <div
              class="grow rounded-xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs transition-shadow hover:border-slate-300 hover:shadow-xs min-w-0"
            >
              <!-- Top Line: Sentence / Pill / User -->
              <div class="flex flex-wrap items-baseline gap-1.5 text-xs text-slate-700 leading-relaxed font-sans">
                <!-- Domain badge (only shown when linked across multiple modules) -->
                <span
                  v-if="shouldShowDomainBadge(entry)"
                  data-testid="audit-domain-badge"
                  class="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mr-0.5"
                >
                  [{{ entry.domain_label || entry.domain }}]
                </span>

                <!-- Action pill / badge -->
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border"
                  :class="getActionBadgeClasses(entry.tone)"
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full"
                    :class="getToneDotClasses(entry.tone)"
                  />
                  {{ entry.label || entry.action_type }}
                </span>

                <span class="text-slate-500 font-normal">by</span>

                <strong class="font-semibold text-slate-900">
                  {{ entry.actor_name || 'System' }}
                </strong>

                <span
                  v-if="entry.actor_role"
                  class="text-[11px] text-slate-500 font-normal"
                >
                  ({{ entry.actor_role }})
                </span>

                <!-- IP Address Badge (Admin Only) -->
                <span
                  v-if="entry.ip_address"
                  class="inline-flex items-center gap-1 text-[10px] text-slate-400 font-sans tabular-nums ml-1"
                  title="Recorded IP Address"
                >
                  <Globe class="w-2.5 h-2.5" />
                  <span>{{ entry.ip_address }}</span>
                </span>
              </div>

              <!-- Single-line / Multi-line Comment (if present) -->
              <div
                v-if="entry.comment"
                class="mt-2 text-xs text-slate-600 rounded-lg bg-slate-50 p-2.5 border border-slate-100"
              >
                <p class="whitespace-pre-wrap leading-relaxed">{{ entry.comment }}</p>
              </div>

              <!-- Changes Diff (if present) -->
              <div
                v-if="entry.changes && entry.changes.length > 0"
                class="mt-2 text-xs text-slate-500 space-y-1 rounded-lg bg-slate-50 p-2.5 border border-slate-100"
              >
                <div
                  v-for="(change, idx) in entry.changes"
                  :key="idx"
                  class="flex flex-wrap items-center gap-1.5 text-xs"
                >
                  <span class="font-semibold text-slate-700">{{ change.field || change.key }}:</span>
                  <span class="line-through text-slate-400 tabular-nums">{{ change.before }}</span>
                  <ArrowRight class="w-3 h-3 text-slate-400 shrink-0" />
                  <span class="font-medium text-slate-900 tabular-nums">{{ change.after }}</span>
                </div>
              </div>

              <!-- Timestamp (Medium Date Format) -->
              <div class="mt-2 text-[11px] font-medium text-slate-400 font-sans tabular-nums">
                {{ formatDateTime(entry.created_at) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Cap Expand/Collapse Toggle Button -->
      <div
        v-if="sortedTrail.length > cap"
        class="border-t border-slate-200 px-4 py-2.5 text-center bg-slate-50/60"
      >
        <button
          type="button"
          data-testid="audit-trail-expand-cap-btn"
          class="text-xs font-semibold text-primary hover:underline cursor-pointer"
          @click="isExpandedCap = !isExpandedCap"
        >
          {{ isExpandedCap ? 'Show less' : `Show all ${sortedTrail.length} events` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  History,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Globe,
  ArrowRight,
  Download,
  Check,
  Edit,
  XCircle,
  FileText,
  Wallet,
  FileCheck,
  User,
} from "lucide-vue-next";
import { formatDateTime } from "@/utils/formatters";
import { exportAuditTrail } from "@/utils/auditTrailExport";

const props = defineProps({
  trail: {
    type: Array,
    default: () => [],
  },
  initialOpen: {
    type: Boolean,
    default: true,
  },
  cap: {
    type: Number,
    default: 4,
  },
  entityTitle: {
    type: String,
    default: "",
  },
  showDomainBadge: {
    type: Boolean,
    default: null,
  },
});

const isOpen = ref(props.initialOpen);
const sortOrder = ref("latest"); // 'latest' | 'oldest'
const isExpandedCap = ref(false);
const isDownloadMenuOpen = ref(false);
const downloadGroupRef = ref(null);

const onWindowClick = (e) => {
  if (downloadGroupRef.value && !downloadGroupRef.value.contains(e.target)) {
    isDownloadMenuOpen.value = false;
  }
};

onMounted(() => {
  if (typeof window !== "undefined") {
    window.addEventListener("click", onWindowClick);
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("click", onWindowClick);
  }
});

const toggleSort = () => {
  sortOrder.value = sortOrder.value === "latest" ? "oldest" : "latest";
};

const hasMultipleDomains = computed(() => {
  if (!props.trail || !props.trail.length) return false;
  const domains = new Set(
    props.trail
      .map((e) => (e.domain_label || e.domain || "").toLowerCase().trim())
      .filter(Boolean),
  );
  return domains.size > 1;
});

const shouldShowDomainBadge = (entry) => {
  if (props.showDomainBadge === false) return false;
  if (props.showDomainBadge === true) return Boolean(entry.domain_label || entry.domain);
  return hasMultipleDomains.value && Boolean(entry.domain_label || entry.domain);
};

const handleExport = (format) => {
  exportAuditTrail(props.trail, format, {
    entityTitle: props.entityTitle,
    title: props.entityTitle ? `Audit Log - ${props.entityTitle}` : "Audit Trail Log",
  });
};

const handleExportAndClose = (format) => {
  isDownloadMenuOpen.value = false;
  handleExport(format);
};

const sortedTrail = computed(() => {
  if (!props.trail || !props.trail.length) return [];
  const list = [...props.trail];
  return list.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sortOrder.value === "latest" ? timeB - timeA : timeA - timeB;
  });
});

const visibleTrail = computed(() => {
  if (isExpandedCap.value || sortedTrail.value.length <= props.cap) {
    return sortedTrail.value;
  }
  return sortedTrail.value.slice(0, props.cap);
});

const getNodeClasses = (entry) => {
  switch (entry?.tone) {
    case "success":
      return "bg-emerald-50 border-emerald-200 text-emerald-600";
    case "warning":
      return "bg-amber-50 border-amber-200 text-amber-600";
    case "danger":
      return "bg-rose-50 border-rose-200 text-rose-600";
    case "info":
      return "bg-sky-50 border-sky-200 text-sky-600";
    default:
      return "bg-slate-50 border-slate-200 text-slate-500";
  }
};

const getToneDotClasses = (tone) => {
  switch (tone) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "danger":
      return "bg-rose-500";
    case "info":
      return "bg-sky-500";
    default:
      return "bg-slate-400";
  }
};

const getEventIcon = (entry) => {
  const type = String(entry?.action_type || entry?.label || "").toUpperCase();
  if (type.includes("APPROV") || type.includes("GRANT") || type.includes("SETTLE")) {
    return Check;
  }
  if (type.includes("REVISE") || type.includes("UPDATE")) {
    return Edit;
  }
  if (type.includes("REJECT") || type.includes("PENALTY") || type.includes("OVERDUE")) {
    return XCircle;
  }
  if (type.includes("DISBURS") || type.includes("PAYOUT")) {
    return Wallet;
  }
  if (type.includes("ACKNOWLEDGE") || type.includes("SIGN")) {
    return FileCheck;
  }
  if (type.includes("SUBMIT") || type.includes("CREATE")) {
    return FileText;
  }
  return User;
};

const getActionBadgeClasses = (tone) => {
  switch (tone) {
    case "success":
      return "border-emerald-500/70 text-emerald-700 bg-emerald-50/60";
    case "warning":
      return "border-amber-500/70 text-amber-700 bg-amber-50/60";
    case "danger":
      return "border-rose-500/70 text-rose-700 bg-rose-50/60";
    case "info":
      return "border-sky-500/70 text-sky-700 bg-sky-50/60";
    default:
      return "border-slate-300 text-slate-700 bg-slate-50";
  }
};
</script>
