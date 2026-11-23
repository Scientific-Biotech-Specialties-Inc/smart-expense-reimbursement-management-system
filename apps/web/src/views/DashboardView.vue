<script setup>
import { ref, onMounted, computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useReimbursementStore } from "@/stores/reimbursement";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { useLiquidationStore } from "@/stores/liquidation";
import { useReceiptStore } from "@/stores/receipts";
import BaseKpiGrid from "@/components/base/BaseKpiGrid.vue";
import SkeletonLoader from "@/components/base/SkeletonLoader.vue";
import { formatPeso } from "@/utils/formatters";
import { Bar, Line, Pie } from "vue-chartjs";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  Title,
} from "chart.js";
import {
  Wallet,
  FileText,
  Banknote,
  ReceiptText,
  Clock,
  AlertTriangle,
} from "lucide-vue-next";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  Title,
);

const auth = useAuthStore();
const rStore = useReimbursementStore();
const caStore = useCashAdvanceStore();
const liqStore = useLiquidationStore();
const receiptsStore = useReceiptStore();

const currentYear = new Date().getFullYear();
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

onMounted(async () => {
  const scope = auth.isAdmin ? "all" : "mine";
  await Promise.all([
    rStore.fetchAll(),
    caStore.fetchAll(),
    liqStore.fetchSettlements(),
    receiptsStore.fetchAll({ scope, perPage: 100 }),
  ]);
});

const isDashboardLoading = computed(
  () => rStore.isLoading || caStore.isLoading || liqStore.isLoading || receiptsStore.isLoading,
);

// ══════════════════════════════════════════════════
// EMPLOYEE DASHBOARD
// ══════════════════════════════════════════════════

const employeeKpis = computed(() => [
  {
    label: "Total Reimbursement",
    value: formatPeso(
      rStore.items
        .filter((i) => i.status === "approved" || i.status === "granted")
        .reduce((s, i) => s + parseFloat(i.amount || 0), 0),
    ),
    sub: "Approved claims",
    icon: Wallet,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    accent: "bg-emerald-500",
  },
  {
    label: "Total Reimbursement Request",
    value: rStore.items.length,
    sub: "All filed requests",
    icon: FileText,
    iconBg: "bg-accent-100",
    iconColor: "text-accent-600",
    accent: "bg-accent",
  },
  {
    label: "Total Filed Cash Advance",
    value: formatPeso(
      caStore.items.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    ),
    sub: "Total amount",
    icon: Banknote,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    accent: "bg-amber-500",
  },
  {
    label: "Total Filed Liquidation",
    value: formatPeso(
      liqStore.settlements.reduce(
        (s, i) => s + (Number(i.total_expense_amount) || 0),
        0,
      ),
    ),
    sub: "Total amount",
    icon: ReceiptText,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    accent: "bg-violet-500",
  },
]);

// Employee Bar Chart: Monthly Spending Trend for Reimbursement & My Expense
const employeeBarData = computed(() => {
  const reimbursementByMonth = new Array(12).fill(0);
  const expenseByMonth = new Array(12).fill(0);

  // Standalone employee receipts / expenses
  (receiptsStore.receipts || []).forEach((r) => {
    if (r.isDeleted) return;
    const dateStr = r.date || r.transactionDate || r.transaction_date || r.createdAt;
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (!isNaN(date.getTime()) && date.getFullYear() === currentYear) {
      const month = date.getMonth();
      if (month >= 0 && month < 12) {
        expenseByMonth[month] += Number(r.amount) || 0;
      }
    }
  });

  // Reimbursements
  (rStore.items || []).forEach((item) => {
    const dateStr = item.date || item.created_at;
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (!isNaN(date.getTime()) && date.getFullYear() === currentYear) {
      const month = date.getMonth();
      if (month >= 0 && month < 12) {
        reimbursementByMonth[month] += parseFloat(item.amount || 0);
      }
    }
  });

  return {
    labels: MONTH_LABELS,
    datasets: [
      {
        label: "My Expense",
        data: expenseByMonth,
        backgroundColor: "#059669",
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.7,
      },
      {
        label: "Reimbursement",
        data: reimbursementByMonth,
        backgroundColor: "#2E85D8",
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.7,
      },
    ],
  };
});

// Employee Pie Chart: Spending by Category
const employeePieData = computed(() => {
  const categoryMap = {};

  // Aggregate from receiptsStore
  (receiptsStore.receipts || []).forEach((r) => {
    if (r.isDeleted) return;
    const catName = r.category || "Uncategorized";
    const amount = Number(r.amount) || 0;
    if (amount > 0) {
      categoryMap[catName] = (categoryMap[catName] || 0) + amount;
    }
  });

  // Aggregate from reimbursements if no standalone receipts or to complement
  if (Object.keys(categoryMap).length === 0) {
    (rStore.items || []).forEach((item) => {
      const catName =
        item.expense_category?.name ||
        item.expenseCategory?.name ||
        item.category?.name ||
        item.category ||
        (item.receipts && item.receipts[0]?.category?.name) ||
        "Other";
      const amount = parseFloat(item.amount || 0);
      if (amount > 0) {
        categoryMap[catName] = (categoryMap[catName] || 0) + amount;
      }
    });
  }

  const labels = Object.keys(categoryMap);
  const data = Object.values(categoryMap);
  const total = data.reduce((a, b) => a + b, 0);

  const colors = [
    "#252578",
    "#2E85D8",
    "#059669",
    "#D97706",
    "#64748b",
    "#7c3aed",
    "#ec4899",
    "#06b6d4",
    "#f59e0b",
    "#10b981",
  ];

  if (labels.length === 0 || total === 0) {
    return {
      labels: ["No Expenses Recorded"],
      datasets: [
        {
          data: [1],
          backgroundColor: ["#E2E8F0"],
          borderWidth: 2,
          borderColor: "#ffffff",
        },
      ],
    };
  }

  return {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: "#ffffff",
        hoverOffset: 6,
      },
    ],
  };
});

// ══════════════════════════════════════════════════
// ADMIN DASHBOARD
// ══════════════════════════════════════════════════

const adminKpis = computed(() => {
  const pendingApproval = rStore.items.filter((i) =>
    ["pending", "submitted"].includes(String(i.status || "").toLowerCase()),
  ).length;
  const pendingCashAdvance = caStore.items.filter(
    (i) => String(i.status || "").toLowerCase() === "pending",
  ).length;
  const pendingLiquidating = liqStore.settlements.filter((i) =>
    ["pending", "under-review"].includes(String(i.status || "").toLowerCase()),
  ).length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueLiquidation = caStore.items.filter((i) => {
    const s = String(i.status || "").toLowerCase();
    if (s === "overdue") return true;
    if (!["disbursed", "signed", "approved"].includes(s)) return false;
    const dueStr = i.expected_liquidation_date || i.dueDate;
    if (!dueStr) return false;
    const due = new Date(dueStr);
    return !isNaN(due.getTime()) && due < today;
  }).length;

  return [
    {
      label: "Pending Approval",
      value: pendingApproval,
      sub: "Awaiting sign-off",
      icon: Clock,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      accent: "bg-amber-500",
    },
    {
      label: "Pending Cash Advance",
      value: pendingCashAdvance,
      sub: "Unreleased requests",
      icon: Banknote,
      iconBg: "bg-accent-100",
      iconColor: "text-accent-600",
      accent: "bg-accent",
    },
    {
      label: "Pending Liquidating",
      value: pendingLiquidating,
      sub: "Under processing",
      icon: ReceiptText,
      iconBg: "bg-violet-100",
      iconColor: "text-violet-600",
      accent: "bg-violet-500",
    },
    {
      label: "Overdue Liquidation",
      value: overdueLiquidation,
      sub: "Past due date",
      icon: AlertTriangle,
      iconBg: "bg-red-100",
      iconColor: "text-red-500",
      accent: "bg-red-500",
    },
  ];
});

// Admin Bar Chart: Monthly Spending Trend (Reimbursements & Expenses)
const adminBarData = computed(() => {
  const monthlyReimbursements = new Array(12).fill(0);
  const monthlyExpenses = new Array(12).fill(0);

  (rStore.items || []).forEach((item) => {
    if (!item.date && !item.created_at) return;
    const date = new Date(item.date || item.created_at);
    if (!isNaN(date.getTime()) && date.getFullYear() === currentYear) {
      const month = date.getMonth();
      if (month >= 0 && month < 12) {
        monthlyReimbursements[month] += parseFloat(item.amount || 0);
      }
    }
  });

  (receiptsStore.receipts || []).forEach((r) => {
    if (r.isDeleted) return;
    const dateStr = r.date || r.transactionDate || r.transaction_date || r.createdAt;
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (!isNaN(date.getTime()) && date.getFullYear() === currentYear) {
      const month = date.getMonth();
      if (month >= 0 && month < 12) {
        monthlyExpenses[month] += Number(r.amount) || 0;
      }
    }
  });

  const hasExpenses = monthlyExpenses.some((v) => v > 0);

  const datasets = [
    {
      label: "Reimbursement",
      data: monthlyReimbursements,
      backgroundColor: "#2E85D8",
      borderRadius: 4,
      barPercentage: hasExpenses ? 0.6 : 0.5,
      categoryPercentage: hasExpenses ? 0.7 : 0.6,
    },
  ];

  if (hasExpenses) {
    datasets.unshift({
      label: "Expenses",
      data: monthlyExpenses,
      backgroundColor: "#059669",
      borderRadius: 4,
      barPercentage: 0.6,
      categoryPercentage: 0.7,
    });
  }

  return {
    labels: MONTH_LABELS,
    datasets,
  };
});

// Admin Pie Chart: Cash Advance Status Distribution
const adminCaStatusPieData = computed(() => {
  const statusConfig = {
    pending: { label: "Pending", color: "#D97706" },
    approved: { label: "Approved", color: "#059669" },
    disbursed: { label: "Disbursed", color: "#2E85D8" },
    signed: { label: "Signed", color: "#252578" },
    "under-review": { label: "Under Review", color: "#7c3aed" },
    liquidated: { label: "Liquidated", color: "#64748b" },
    overdue: { label: "Overdue", color: "#DC2626" },
    rejected: { label: "Rejected", color: "#ef4444" },
    settled: { label: "Settled", color: "#10b981" },
  };

  const counts = {};
  (caStore.items || []).forEach((item) => {
    const s = String(item.status || "").toLowerCase();
    if (s) {
      counts[s] = (counts[s] || 0) + 1;
    }
  });

  const activeKeys = Object.keys(counts).filter((k) => counts[k] > 0);
  const total = activeKeys.reduce((s, k) => s + counts[k], 0);

  if (total === 0) {
    return {
      labels: ["No Cash Advances"],
      datasets: [
        {
          data: [1],
          backgroundColor: ["#E2E8F0"],
          borderWidth: 2,
          borderColor: "#ffffff",
        },
      ],
    };
  }

  const labels = activeKeys.map(
    (k) => statusConfig[k]?.label || k.charAt(0).toUpperCase() + k.slice(1),
  );
  const colors = activeKeys.map((k) => statusConfig[k]?.color || "#94a3b8");
  const data = activeKeys.map((k) => counts[k]);

  return {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#ffffff",
        hoverOffset: 6,
      },
    ],
  };
});

// Admin Pie Chart: Advance vs Outstanding
const totalCashAdvanceAmount = computed(() =>
  (caStore.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0),
);
const totalOutstandingBalance = computed(() => caStore.totalOutstanding);
const totalLiquidatedOrSettled = computed(() =>
  Math.max(0, totalCashAdvanceAmount.value - totalOutstandingBalance.value),
);
const remainingOutstanding = computed(() => totalOutstandingBalance.value);

const adminBalancePieData = computed(() => {
  const totalCA = totalCashAdvanceAmount.value;
  const totalOut = totalOutstandingBalance.value;
  const settled = totalLiquidatedOrSettled.value;

  if (totalCA === 0 && totalOut === 0) {
    return {
      labels: ["No Cash Advances"],
      datasets: [
        {
          data: [1],
          backgroundColor: ["#E2E8F0"],
          borderWidth: 2,
          borderColor: "#ffffff",
        },
      ],
    };
  }

  return {
    labels: ["Liquidated / Settled", "Outstanding Balance"],
    datasets: [
      {
        data: [settled, totalOut],
        backgroundColor: ["#059669", "#DC2626"],
        borderWidth: 2,
        borderColor: "#ffffff",
        hoverOffset: 6,
      },
    ],
  };
});

// ══════════════════════════════════════════════════
// SHARED
// ══════════════════════════════════════════════════

// Liquidation Line Chart (shared)
const liquidationGranularity = ref("month");

const lineData = computed(() => {
  const labels = {
    day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    week: ["Week 1", "Week 2", "Week 3", "Week 4"],
    month: MONTH_LABELS,
  };

  const dayData = [0, 0, 0, 0, 0, 0, 0];
  const weekData = [0, 0, 0, 0];
  const monthData = new Array(12).fill(0);

  liqStore.settlements.forEach((item) => {
    const amount = Number(item.total_expense_amount) || 0;
    const dateStr =
      item.settlement_date ||
      item.created_at ||
      item.date ||
      item.cash_advance?.expected_liquidation_date ||
      item.cashAdvance?.expected_liquidation_date;
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return;

    const dayIdx = (date.getDay() + 6) % 7;
    dayData[dayIdx] += amount;

    const weekIdx = Math.min(Math.floor(date.getDate() / 7), 3);
    weekData[weekIdx] += amount;

    if (date.getFullYear() === currentYear) {
      const monthIdx = date.getMonth();
      if (monthIdx >= 0 && monthIdx < 12) {
        monthData[monthIdx] += amount;
      }
    }
  });

  const datasetMap = {
    day: dayData,
    week: weekData,
    month: monthData,
  };

  return {
    labels: labels[liquidationGranularity.value],
    datasets: [
      {
        label: "Liquidation Volume",
        data: datasetMap[liquidationGranularity.value],
        borderColor: "#252578",
        backgroundColor: "rgba(37, 37, 120, 0.05)",
        borderWidth: 2,
        pointBackgroundColor: "#252578",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: true,
      },
    ],
  };
});

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "#1e293b",
      titleFont: { family: "Poppins", size: 11, weight: "600" },
      bodyFont: { family: "Poppins", size: 12 },
      cornerRadius: 8,
      padding: 12,
      callbacks: {
        label: (ctx) => ` ₱${ctx.raw.toLocaleString()}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "#94a3b8", font: { family: "Poppins", size: 11 } },
    },
    y: {
      beginAtZero: true,
      suggestedMin: 0,
      grid: { color: "rgba(148,163,184,0.1)", borderDash: [4, 4] },
      ticks: {
        color: "#94a3b8",
        font: { family: "Poppins", size: 11 },
        callback: (v) => (v >= 1000 ? `₱${(v / 1000).toFixed(0)}K` : `₱${v}`),
      },
    },
  },
};

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "top",
      align: "end",
      labels: {
        boxWidth: 12,
        boxHeight: 12,
        padding: 16,
        color: "#475569",
        font: { family: "Poppins", size: 11 },
        usePointStyle: true,
        pointStyle: "rectRounded",
      },
    },
    tooltip: {
      backgroundColor: "#1e293b",
      titleFont: { family: "Poppins", size: 11, weight: "600" },
      bodyFont: { family: "Poppins", size: 12 },
      cornerRadius: 8,
      padding: 12,
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ₱${ctx.raw.toLocaleString()}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "#94a3b8", font: { family: "Poppins", size: 11 } },
    },
    y: {
      beginAtZero: true,
      suggestedMin: 0,
      grid: { color: "rgba(148,163,184,0.1)", borderDash: [4, 4] },
      ticks: {
        color: "#94a3b8",
        font: { family: "Poppins", size: 11 },
        callback: (v) => (v >= 1000 ? `₱${(v / 1000).toFixed(0)}K` : `₱${v}`),
      },
    },
  },
};

const pieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 10,
        boxHeight: 10,
        padding: 14,
        color: "#475569",
        font: { family: "Poppins", size: 11 },
        usePointStyle: true,
        pointStyle: "circle",
      },
    },
    tooltip: {
      backgroundColor: "#1e293b",
      titleFont: { family: "Poppins", size: 11 },
      bodyFont: { family: "Poppins", size: 12 },
      cornerRadius: 8,
      callbacks: {
        label: (ctx) => {
          if (typeof ctx.label === "string" && ctx.label.includes("No ")) {
            return " No data available";
          }
          return ` ${ctx.label}: ${ctx.raw}${typeof ctx.raw === "number" && ctx.raw > 100 ? "" : "%"}`;
        },
      },
    },
  },
};

const pieOptionsWithCurrency = {
  ...pieOptions,
  plugins: {
    ...pieOptions.plugins,
    tooltip: {
      ...pieOptions.plugins.tooltip,
      callbacks: {
        label: (ctx) => {
          if (typeof ctx.label === "string" && ctx.label.includes("No ")) {
            return " No data available";
          }
          return ` ${ctx.label}: ₱${typeof ctx.raw === "number" ? ctx.raw.toLocaleString() : ctx.raw}`;
        },
      },
    },
  },
};
</script>

<template>
  <div class="flex flex-col gap-6 animate-fade-up">
    <!-- Page Header -->
    <div>
      <h1 class="text-2xl font-bold text-slate-800">
        Welcome back, <span class="text-primary">{{ auth.user?.name?.split(" ")[0] }}</span>
      </h1>
      <p class="mt-1 text-sm text-slate-400">
        {{ auth.isAdmin ? "Here's your administrative overview." : "Here's your financial overview." }}
      </p>
    </div>

    <!-- ══════════════════════════════════════════ -->
    <!-- EMPLOYEE DASHBOARD -->
    <!-- ══════════════════════════════════════════ -->
    <template v-if="!auth.isAdmin">
      <!-- KPI Cards -->
      <BaseKpiGrid
        :kpis="employeeKpis"
        gridClasses="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        :isLoading="isDashboardLoading"
        :skeletonCount="4"
      />

      <!-- Charts Row 1: Bar + Pie -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="card p-6 lg:col-span-2">
          <div class="mb-5">
            <h3 class="text-sm font-medium text-slate-700">
              Monthly Spending Trend for Reimbursement and My Expense
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">January – December {{ currentYear }}</p>
          </div>
          <div v-if="isDashboardLoading" class="h-56">
            <SkeletonLoader variant="chart" />
          </div>
          <div v-else class="h-56">
            <Bar :data="employeeBarData" :options="barOptions" />
          </div>
        </div>

        <div class="card p-6">
          <div class="mb-5">
            <h3 class="text-sm font-medium text-slate-700">Spending by Category</h3>
            <p class="text-xs text-slate-400 mt-0.5">Expenses and reimbursement distribution</p>
          </div>
          <div v-if="isDashboardLoading" class="flex h-56 items-center justify-center">
            <div class="h-36 w-36 animate-pulse rounded-full bg-slate-200"></div>
          </div>
          <div v-else class="h-56">
            <Pie :data="employeePieData" :options="pieOptions" />
          </div>
        </div>
      </div>

      <!-- Liquidation Line Chart -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-5">
          <div>
            <h3 class="text-sm font-medium text-slate-700">Liquidation Trend</h3>
            <p class="text-xs text-slate-400 mt-0.5">Total liquidated volume over time</p>
          </div>
          <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button
              v-for="option in ['day', 'week', 'month']"
              :key="option"
              class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize"
              :class="liquidationGranularity === option
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700'"
              @click="liquidationGranularity = option"
            >
              {{ option }}
            </button>
          </div>
        </div>
        <div v-if="isDashboardLoading" class="h-56">
          <SkeletonLoader variant="chart" />
        </div>
        <div v-else class="h-56">
          <Line :data="lineData" :options="lineOptions" />
        </div>
      </div>
    </template>

    <!-- ══════════════════════════════════════════ -->
    <!-- ADMIN DASHBOARD -->
    <!-- ══════════════════════════════════════════ -->
    <template v-else>
      <!-- KPI Cards -->
      <BaseKpiGrid
        :kpis="adminKpis"
        gridClasses="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
        :isLoading="isDashboardLoading"
        :skeletonCount="4"
      />

      <!-- Charts Row 1: Bar Chart -->
      <div class="card p-6">
        <div class="mb-5">
          <h3 class="text-sm font-medium text-slate-700">Monthly Spending Trend</h3>
          <p class="text-xs text-slate-400 mt-0.5">
            Total claims and expenses across organization — January – December {{ currentYear }}
          </p>
        </div>
        <div v-if="isDashboardLoading" class="h-56">
          <SkeletonLoader variant="chart" />
        </div>
        <div v-else class="h-56">
          <Bar :data="adminBarData" :options="barOptions" />
        </div>
      </div>

      <!-- Charts Row 2: CA Status Pie + Liquidation Line -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Cash Advance Status Pie -->
        <div class="card p-6">
          <div class="mb-5">
            <h3 class="text-sm font-medium text-slate-700">Cash Advance Status Distribution</h3>
            <p class="text-xs text-slate-400 mt-0.5">Breakdown by current status</p>
          </div>
          <div v-if="isDashboardLoading" class="flex h-56 items-center justify-center">
            <div class="h-36 w-36 animate-pulse rounded-full bg-slate-200"></div>
          </div>
          <div v-else class="h-56">
            <Pie :data="adminCaStatusPieData" :options="pieOptions" />
          </div>
        </div>

        <!-- Liquidation Volume Line Chart -->
        <div class="card p-6 lg:col-span-2">
          <div class="flex items-center justify-between mb-5">
            <div>
              <h3 class="text-sm font-medium text-slate-700">Liquidation Volume</h3>
              <p class="text-xs text-slate-400 mt-0.5">Completed liquidations over time</p>
            </div>
            <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              <button
                v-for="option in ['day', 'week', 'month']"
                :key="option"
                class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize"
                :class="liquidationGranularity === option
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'"
                @click="liquidationGranularity = option"
              >
                {{ option }}
              </button>
            </div>
          </div>
          <div v-if="isDashboardLoading" class="h-56">
            <SkeletonLoader variant="chart" />
          </div>
          <div v-else class="h-56">
            <Line :data="lineData" :options="lineOptions" />
          </div>
        </div>
      </div>

      <!-- Charts Row 3: Advance vs Outstanding Pie -->
      <div class="card p-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <div>
            <h3 class="text-sm font-medium text-slate-700 mb-1">Advance vs Outstanding Balance</h3>
            <p class="text-xs text-slate-400 mb-4">Total cash advance compared to outstanding balances</p>
            <div v-if="isDashboardLoading" class="flex h-48 items-center justify-center">
              <div class="h-32 w-32 animate-pulse rounded-full bg-slate-200"></div>
            </div>
            <div v-else class="h-48">
              <Pie :data="adminBalancePieData" :options="pieOptionsWithCurrency" />
            </div>
          </div>
          <div class="flex flex-col gap-4 p-5 rounded-xl bg-slate-50 border border-slate-100">
            <div>
              <p class="text-xs text-slate-400 mb-0.5">Total Cash Advance</p>
              <p class="text-lg font-semibold text-primary">{{ formatPeso(totalCashAdvanceAmount) }}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400 mb-0.5">Total Outstanding Balance</p>
              <p class="text-lg font-semibold text-red-600">{{ formatPeso(totalOutstandingBalance) }}</p>
            </div>
            <div class="pt-3 border-t border-slate-200">
              <p class="text-xs text-slate-400 mb-0.5">Remaining Outstanding Amount</p>
              <p class="text-xl font-bold text-slate-800">{{ formatPeso(remainingOutstanding) }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
