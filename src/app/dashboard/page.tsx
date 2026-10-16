import Link from "next/link";
import { db } from "@/lib/db";
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABEL } from "@/lib/order-status";
import { requireUserPage } from "@/server/auth/current";
import { getSettings } from "@/server/settings";
import { userBalances } from "@/server/wallet";
import { ActionButton } from "@/components/client/action-button";
import { EmptyState, Money, Notice, PageHeader, Stat, StatusBadge, Table, Td, fmtDate } from "@/components/ui";

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const auth = await requireUserPage();
  const uid = auth.user.id;
  const settings = await getSettings();
  const [recent, active, purchases, tickets, bal] = await Promise.all([
    db.serviceOrder.findMany({ where: { userId: uid }, orderBy: { createdAt: "desc" }, take: 5, include: { service: true } }),
    db.serviceOrder.count({ where: { userId: uid, status: { in: ACTIVE_ORDER_STATUSES } } }),
    db.purchaseTransaction.count({ where: { buyerId: uid, status: { notIn: ["CANCELLED", "COMPLETED", "REFUNDED"] } } }),
    db.supportTicket.count({ where: { userId: uid, status: { in: ["OPEN", "PENDING_CUSTOMER", "PENDING_STAFF"] } } }),
    userBalances(uid, settings.commerce.baseCurrency),
  ]);
  return (
    <>
      <PageHeader
        title={`Hi, ${auth.user.displayName.split(" ")[0]}`}
        description="Here's what's happening with your account."
        actions={
          <Link href="/services" className="btn-gradient">
            New order
          </Link>
        }
      />
      {denied && (
        <div className="mb-6">
          <Notice tone="red">You don&apos;t have permission to view that page.</Notice>
        </div>
      )}
      {!auth.user.emailVerifiedAt && (
        <div className="mb-6">
          <Notice tone="amber" title="Verify your email to start ordering">
            We sent a link to {auth.user.email}.{" "}
            <ActionButton endpoint="/api/v1/auth/email" body={{}} className="link inline p-0" successMessage="Verification email sent">
              Resend email
            </ActionButton>
          </Notice>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active campaigns" value={active} />
        <Stat label="Marketplace purchases in progress" value={purchases} />
        <Stat label="Open support tickets" value={tickets} />
        {settings.features.walletEnabled && <Stat label="Wallet balance" value={<Money minor={bal.available} currency={settings.commerce.baseCurrency} />} hint={bal.promotional ? `+ promotional credit` : undefined} />}
      </div>
      <h2 className="mb-3 mt-10 text-lg font-semibold">Recent orders</h2>
      {recent.length ? (
        <Table head={["Order", "Service", "Status", "Total", "Date"]}>
          {recent.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/dashboard/orders/${o.id}`} className="link">
                  {o.number}
                </Link>
              </Td>
              <Td>{o.service.name}</Td>
              <Td>
                <StatusBadge status={o.status} label={ORDER_STATUS_LABEL[o.status]} />
              </Td>
              <Td>
                <Money minor={o.totalMinor} currency={o.currency} />
              </Td>
              <Td>{fmtDate(o.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState
          title="No orders yet"
          description="Browse services to start your first campaign."
          action={
            <Link href="/services" className="btn-primary">
              Explore services
            </Link>
          }
        />
      )}
    </>
  );
}
