import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { can, type Permission } from "@/server/auth/rbac";
import { AppShell, type NavItem } from "@/components/app-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Server-side gate. Every admin API route enforces its own permission as well.
  const auth = await requirePermissionPage("admin:access");
  const [queue, refunds, listings, disputes, tickets, payouts] = await Promise.all([
    db.serviceOrder.count({ where: { status: { in: ["PAYMENT_CONFIRMED", "AWAITING_CUSTOMER_INFO"] } } }),
    db.refund.count({ where: { status: "REQUESTED" } }),
    db.marketplaceListing.count({ where: { status: "PENDING_REVIEW" } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING_STAFF"] } } }),
    db.payoutRequest.count({ where: { status: "REQUESTED" } }),
  ]);
  const items: (NavItem & { perm: Permission })[] = [
    { href: "/admin", label: "Overview", perm: "admin:access" },
    { href: "/admin/orders", label: "Fulfillment queue", perm: "orders:manage", badge: queue },
    { href: "/admin/payments", label: "Payments", perm: "payments:read" },
    { href: "/admin/refunds", label: "Refunds", perm: "payments:read", badge: refunds },
    { href: "/admin/payouts", label: "Withdrawals", perm: "payouts:manage", badge: payouts },
    { href: "/admin/services", label: "Services", perm: "catalog:manage" },
    { href: "/admin/catalog", label: "Platforms & content", perm: "catalog:manage" },
    { href: "/admin/coupons", label: "Coupons", perm: "coupons:manage" },
    { href: "/admin/marketplace", label: "Listing moderation", perm: "marketplace:moderate", badge: listings },
    { href: "/admin/sellers", label: "Seller verification", perm: "marketplace:moderate" },
    { href: "/admin/reports", label: "Reported listings", perm: "marketplace:moderate" },
    { href: "/admin/purchases", label: "Marketplace purchases", perm: "disputes:manage" },
    { href: "/admin/disputes", label: "Disputes", perm: "disputes:manage", badge: disputes },
    { href: "/admin/support", label: "Support", perm: "support:manage", badge: tickets },
    { href: "/admin/reviews", label: "Reviews", perm: "reviews:moderate" },
    { href: "/admin/users", label: "Users & roles", perm: "users:manage" },
    { href: "/admin/audit", label: "Audit log", perm: "audit:read" },
    { href: "/admin/settings", label: "Settings", perm: "settings:manage" },
  ];
  const nav = items.filter((i) => can(auth.user.roles, i.perm)).map(({ perm: _p, ...i }) => i);
  return (
    <AppShell nav={nav} title="Admin" user={auth.user} adminLink={{ href: "/dashboard", label: "My dashboard" }}>
      {children}
    </AppShell>
  );
}
