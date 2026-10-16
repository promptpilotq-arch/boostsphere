import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { isStaff } from "@/server/auth/rbac";
import { getSettings } from "@/server/settings";
import { AppShell, type NavItem } from "@/components/app-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await requireUserPage("/dashboard");
  const [settings, unread] = await Promise.all([getSettings(), db.notification.count({ where: { userId: auth.user.id, readAt: null } })]);
  const nav: NavItem[] = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/orders", label: "Orders" },
    { href: "/dashboard/purchases", label: "Marketplace purchases" },
    ...(settings.features.walletEnabled ? [{ href: "/dashboard/wallet", label: "Wallet" }] : []),
    { href: "/dashboard/transactions", label: "Transactions & receipts" },
    { href: "/dashboard/saved", label: "Saved listings" },
    { href: "/dashboard/selling", label: "Selling" },
    { href: "/dashboard/support", label: "Support" },
    { href: "/dashboard/notifications", label: "Notifications", badge: unread },
    ...(settings.features.referralsEnabled ? [{ href: "/dashboard/referrals", label: "Referrals" }] : []),
    { href: "/dashboard/settings", label: "Profile" },
    { href: "/dashboard/security", label: "Security" },
  ];
  return (
    <AppShell nav={nav} title="Dashboard" user={auth.user} adminLink={isStaff(auth.user.roles) ? { href: "/admin", label: "Admin" } : undefined}>
      {children}
    </AppShell>
  );
}
