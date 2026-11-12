import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const routes = [
  {
    path: "/auth/callback",
    name: "AuthCallback",
    component: () => import("@/views/AuthCallbackView.vue"),
    meta: { public: true },
  },
  {
    path: "/",
    component: () => import("@/layouts/AppLayout.vue"),
    meta: { requiresAuth: true },
    children: [
      {
        path: "",
        redirect: "/dashboard",
      },
      {
        path: "dashboard",
        name: "Dashboard",
        component: () => import("@/views/DashboardView.vue"),
        meta: { title: "Dashboard" },
      },
      {
        path: "reimbursements",
        name: "Reimbursements",
        component: () => import("@/views/ReimbursementsView.vue"),
        meta: { title: "Reimbursements" },
      },
      {
        path: "reimbursements/new",
        name: "ReimbursementForm",
        component: () => import("@/views/ReimbursementFormView.vue"),
        meta: { title: "New Reimbursement" },
      },
      {
        path: "reimbursements/:id/edit",
        name: "ReimbursementEdit",
        component: () => import("@/views/ReimbursementFormView.vue"),
        meta: { title: "Edit Reimbursement" },
        props: true,
      },

      {
        path: "cash-advances",
        name: "CashAdvances",
        component: () => import("@/views/CashAdvancesView.vue"),
        meta: { title: "Cash Advances" },
      },
      {
        path: "cash-advances/new",
        name: "CashAdvanceForm",
        component: () => import("@/views/CashAdvanceFormView.vue"),
        meta: { title: "New Cash Advance" },
      },
      {
        path: "cash-advances/:id/edit",
        name: "CashAdvanceEdit",
        component: () => import("@/views/CashAdvanceFormView.vue"),
        meta: { title: "Edit Cash Advance" },
        props: true,
      },
      {
        path: "liquidations",
        name: "Liquidations",
        component: () => import("@/views/LiquidationsView.vue"),
        meta: { title: "Liquidations" },
      },
      {
        path: "my-expense",
        name: "MyExpense",
        component: () => import("@/views/MyExpenseView.vue"),
        meta: { title: "My Expense" },
      },
      {
        path: "payout",
        name: "Payout",
        component: () => import("@/views/PayoutView.vue"),
        meta: { title: "Payout" },
      },
      {
        path: "notifications",
        name: "Notifications",
        component: () => import("@/views/NotificationsView.vue"),
        meta: { title: "Notifications" },
      },
      {
        path: "settings/notifications",
        name: "NotificationSettings",
        component: () => import("@/views/NotificationSettingsView.vue"),
        meta: { title: "Notification Settings" },
      },
      {
        path: "admin/policy",
        name: "Policy",
        component: () => import("@/views/admin/PolicyView.vue"),
        meta: { title: "Policy Management", requiresAdmin: true },
      },
      {
        path: "admin/audit",
        name: "Audit",
        component: () => import("@/views/admin/AuditView.vue"),
        meta: { title: "Audit Log", requiresAdmin: true },
      },
      {
        path: "admin/reports",
        name: "Reports",
        component: () => import("@/views/admin/ReportsView.vue"),
        meta: { title: "Reports & Exports", requiresAdmin: true },
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/dashboard",
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

// Navigation guard — redirect unauthenticated users to the capstone-auth-module
router.beforeEach(async (to) => {
  const auth = useAuthStore();

  const incomingToken = to.query.token;
  if (incomingToken && !to.meta.public) {
    try {
      auth.setToken(
        Array.isArray(incomingToken) ? incomingToken[0] : incomingToken,
      );
      await auth.fetchProfile();

      const query = { ...to.query };
      delete query.token;

      return {
        path: to.path,
        query,
        hash: to.hash,
        replace: true,
      };
    } catch {
      auth.clearSession();
    }
  }

  // Allow public routes
  if (to.meta.public) {
    return;
  }

  if (!auth.isAuthenticated) {
    try {
      await auth.fetchProfile();
    } catch {
      auth.clearSession();
    }
  }

  // Redirect to external auth module if not authenticated
  if (!auth.isAuthenticated) {
    auth.redirectToLogin(to.fullPath);
    // Return false to cancel the current navigation
    return false;
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: "Dashboard" };
  }
});

export default router;
