import Link from "next/link";
import { requirePermissionPage } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getAnalytics } from "@/server/analytics";
import { Card, Money, PageHeader, Stat } from "@/components/ui";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const auth = await requirePermissionPage("admin:access");
  const requested = Number((await searchParams).days);
  const days = [7, 30, 90, 365].find((d) => d === requested) ?? 30;
  if (!can(auth.user.roles, "analytics:read")) {
    return (
      <>
        <PageHeader title="Admin" description="Use the navigation to work through the fulfillment queue, support tickets and disputes." />
      </>
    );
  }
  const a = await getAnalytics({ days });
  const c = a.currency;
  const maxPlatform = Math.max(1, ...a.salesByPlatform.map((p) => p.totalMinor));
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 1000) / 10}%`);
  return (
    <>
      <PageHeader
        title="Overview"
        description={`Live figures from the database for the last ${days} days. Revenue = verified payments for orders and marketplace purchases (excludes wallet deposits).`}
        actions={[7, 30, 90, 365].map((d) => (
          <Link key={d} href={`/admin?days=${d}`} className={d === days ? "btn-primary" : "btn-secondary"}>
            {d === 365 ? "1y" : `${d}d`}
          </Link>
        ))}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Gross revenue" value={<Money minor={a.grossRevenueMinor} currency={c} />} hint={`${a.paidTransactions} paid transactions`} />
        <Stat label="Net revenue" value={<Money minor={a.netRevenueMinor} currency={c} />} hint="Gross − refunds − reported provider fees" />
        <Stat label="Refunds issued" value={<Money minor={a.refundsMinor} currency={c} />} hint={`${a.pendingRefunds} refund requests open`} />
        <Stat label="Average order value" value={<Money minor={a.averageOrderValueMinor} currency={c} />} />
        <Stat label="Orders" value={a.orders.total} hint={`${a.orders.completed} completed · ${a.orders.active} active`} />
        <Stat label="Pending payment / cancelled" value={`${a.orders.pending} / ${a.orders.cancelled}`} />
        <Stat label="Payment success rate" value={pct(a.paymentSuccessRate)} hint="Provider payments, excluding wallet" />
        <Stat label="Customers" value={a.newCustomers} hint={`new · ${a.repeatCustomers} repeat of ${a.payingCustomers} paying (all time)`} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Sales by platform</h2>
          {a.salesByPlatform.length ? (
            <ul className="mt-4 space-y-3">
              {a.salesByPlatform.map((p) => (
                <li key={p.name}>
                  <div className="flex justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="tabular-nums">
                      <Money minor={p.totalMinor} currency={c} /> · {p.orders}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-gradient-to-r from-brand to-brand-accent" style={{ width: `${(p.totalMinor / maxPlatform) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No paid orders in this period yet.</p>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Popular services</h2>
          {a.popularServices.length ? (
            <ol className="mt-4 space-y-2 text-sm">
              {a.popularServices.map((s, i) => (
                <li key={s.name} className="flex justify-between gap-4">
                  <span>
                    {i + 1}. {s.name}
                  </span>
                  <span className="tabular-nums text-slate-600">{s.orders} orders</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No paid orders in this period yet.</p>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Marketplace</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {["PENDING_REVIEW", "APPROVED", "RESERVED", "SOLD", "SUSPENDED", "REJECTED"].map((s) => (
              <div key={s}>
                <dt className="text-xs text-slate-500">{s.replace("_", " ").toLowerCase()}</dt>
                <dd className="text-lg font-semibold">{a.listings[s] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm">
            Outstanding disputes: <strong>{a.openDisputes}</strong>
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Exports (CSV, last 90 days)</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {["orders", "payments", "refunds", "transactions"].map((k) => (
              <a key={k} href={`/api/v1/admin/export/${k}?days=90`} className="btn-secondary">
                {k}
              </a>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500">Pending payments awaiting provider confirmation: {a.pendingPayments}</p>
        </Card>
      </div>
    </>
  );
}
