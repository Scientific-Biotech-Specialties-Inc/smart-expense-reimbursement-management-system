import {
  LayoutDashboard,
  Receipt,
  Wallet,
  FilePieChart,
  FileCheck,
  Banknote,
  ShieldAlert,
  ShieldCheck,
} from "lucide-vue-next";

const base = [
  { name: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { name: "Reimbursements", to: "/reimbursements", icon: Receipt },
  { name: "Cash Advances", to: "/cash-advances", icon: Wallet },
  { name: "Payout", to: "/payout", icon: Banknote },
  { name: "Liquidations", to: "/liquidations", icon: FilePieChart },
];

const employee = [
  { name: "My Expense", to: "/my-expense", icon: FileCheck },
  { name: "Penalties", to: "/penalties", icon: ShieldAlert },
];

const admin = [
  { divider: true },
  { header: "Administration" },
  { name: "Penalty Management", to: "/admin/penalties", icon: ShieldCheck },
];

export function buildNavLinks(isAdmin = false) {
  return isAdmin ? [...base, ...employee, ...admin] : [...base, ...employee];
}

