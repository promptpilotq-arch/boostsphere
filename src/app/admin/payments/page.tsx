import Link from "next/link";
import type { PaymentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { providerStatuses } from "@/server/payments/registry";
import { ActionButton } from "@/components/client/action-button";
import { Badge, Card, EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, Td, fmtDateTime } from "@/components/ui";

const STATUSES: PaymentStatus[] = ["PENDING", "SUCCEEDED", "FAILED", "ABANDONED", "REFUNDED", "PARTIALLY_REFUNDED"];

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const auth = await requirePermissionPage("payments:read");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const status = STATUSES.find((s) => s === sp.status);
  const where: Prisma.PaymentWhereInput = { ...(status ? { status } : {}), ...(sp.q ? { OR: [{ reference: { contains: sp.q } }, { providerReference: { contains: sp.q } }, { user: { email: { contains: sp.q, mode: "insensitive" } } }] } : {}) };
  const [payments, total, events] = await Promise.all([
    db.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { user: { select: { email: true } } } }),
    db.payment.count({ where }),
    db.paymentWebhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 10 }),
  ]);
  const manage = can(auth.user.roles, "payments:manage");
  return (
    <>
      <PageHeader
        title="Payments & reconciliation"
        description="Orders are marked paid only after server-side verification with the provider. Use reconciliation to re-check pending payments."
        actions={
          manage && (
            <ActionButton endpoint="/api/v1/admin/payments" body={{ olderThanMinutes: 0 }} className="btn-primary" successMessage="Reconciliation complete">
              Reconcile all pending
            </ActionButton>
          )
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {providerStatuses().map((p) => (
          <Card key={p.key} className="p-4">
            <p className="font-medium">{p.displayName}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge tone={p.enabled ? "blue" : "gray"}>{p.enabled ? "Enabled" : "Disabled"}</Badge>
              <Badge tone={p.configured ? "green" : "amber"}>{p.configured ? "Configured" : "Not configured"}</Badge>
            </div>
          </Card>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2" action="/admin/payments">
        <input name="q" defaultValue={sp.q} placeholder="Reference or email" className="input max-w-xs" aria-label="Search" />
        <select name="status" defaultValue={status ?? ""} className="input max-w-[200px]" aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {payments.length ? (
        <Table head={["Created", "Reference", "Customer", "Provider", "Purpose", "Status", "Amount", "Fee", ""]}>
          {payments.map((p) => (
            <tr key={p.id}>
              <Td>{fmtDateTime(p.createdAt)}</Td>
              <Td className="font-mono text-xs">{p.reference}</Td>
              <Td>{p.user.email}</Td>
              <Td>{p.provider}</Td>
              <Td>
                {p.orderId ? (
                  <Link className="link" href={`/admin/orders/${p.orderId}`}>
                    order
                  </Link>
                ) : p.purchaseId ? (
                  <Link className="link" href={`/admin/purchases/${p.purchaseId}`}>
                    purchase
                  </Link>
                ) : (
                  "deposit"
                )}
              </Td>
              <Td>
                <StatusBadge status={p.status} />
                {p.failureReason && <span className="ml-1 text-xs text-slate-500">{p.failureReason.slice(0, 40)}</span>}
              </Td>
              <Td>
                <Money minor={p.amountMinor} currency={p.currency} />
              </Td>
              <Td>{p.providerFeeMinor != null ? <Money minor={p.providerFeeMinor} currency={p.currency} /> : "—"}</Td>
              <Td>
                {manage && p.status === "PENDING" && p.provider !== "wallet" && (
                  <ActionButton endpoint="/api/v1/admin/payments" body={{ reference: p.reference }} className="btn-ghost px-2 py-1" successMessage="Re-verified">
                    Verify
                  </ActionButton>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No payments match" />
      )}
      <Pagination page={page} totalPages={Math.ceil(total / 30)} hrefFor={(n) => `/admin/payments?page=${n}${status ? `&status=${status}` : ""}`} />
      <h2 className="mb-3 mt-10 text-lg font-semibold">Recent webhook events</h2>
      {events.length ? (
        <Table head={["Received", "Provider", "Event", "Reference", "Processed"]}>
          {events.map((e) => (
            <tr key={e.id}>
              <Td>{fmtDateTime(e.receivedAt)}</Td>
              <Td>{e.provider}</Td>
              <Td>{e.eventType}</Td>
              <Td className="font-mono text-xs">{e.reference}</Td>
              <Td>{e.processed ? "yes" : e.error ? `error: ${e.error.slice(0, 60)}` : "no"}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-slate-500">No webhook events received yet.</p>
      )}
    </>
  );
}
