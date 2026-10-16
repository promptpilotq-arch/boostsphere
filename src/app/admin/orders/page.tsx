import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { requirePermissionPage } from "@/server/auth/current";
import { EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, Td, fmtDateTime } from "@/components/ui";

const TABS: [string, OrderStatus[] | null][] = [
  ["Needs action", ["PAYMENT_CONFIRMED", "PROCESSING", "IN_PROGRESS", "UNDER_REVIEW"]],
  ["Awaiting customer", ["AWAITING_CUSTOMER_INFO"]],
  ["Refund pending", ["REFUND_PENDING"]],
  ["Unpaid", ["PENDING_PAYMENT"]],
  ["Completed", ["COMPLETED"]],
  ["All", null],
];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ t?: string; q?: string; mine?: string; page?: string }> }) {
  const auth = await requirePermissionPage("orders:manage");
  const sp = await searchParams;
  const t = Math.min(TABS.length - 1, Number(sp.t) || 0);
  const page = Number(sp.page) || 1;
  const where: Prisma.ServiceOrderWhereInput = {
    ...(TABS[t][1] ? { status: { in: TABS[t][1]! } } : {}),
    ...(sp.mine ? { assigneeId: auth.user.id } : {}),
    ...(sp.q ? { OR: [{ number: { contains: sp.q, mode: "insensitive" } }, { user: { email: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [orders, total] = await Promise.all([
    db.serviceOrder.findMany({ where, orderBy: { createdAt: t === 0 ? "asc" : "desc" }, skip: (page - 1) * 30, take: 30, include: { service: { include: { platform: true } }, user: { select: { email: true } }, assignee: { select: { email: true } } } }),
    db.serviceOrder.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Fulfillment queue" description="Oldest first in “Needs action”. Assign, update status, add internal notes and attach completion evidence." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([label], i) => (
          <Link key={label} href={`/admin/orders?t=${i}${sp.mine ? "&mine=1" : ""}`} className={`rounded-full border px-3 py-1.5 text-sm ${i === t ? "border-brand bg-brand/5 text-brand" : "border-slate-200 bg-white"}`}>
            {label}
          </Link>
        ))}
        <Link href={`/admin/orders?t=${t}${sp.mine ? "" : "&mine=1"}`} className="ml-auto text-sm text-brand">
          {sp.mine ? "Show everyone's" : "Assigned to me"}
        </Link>
      </div>
      <form className="mb-4 flex gap-2" action="/admin/orders">
        <input type="hidden" name="t" value={t} />
        <input name="q" defaultValue={sp.q} placeholder="Order number or customer email" className="input max-w-sm" aria-label="Search orders" />
        <button className="btn-secondary">Search</button>
      </form>
      {orders.length ? (
        <Table head={["Order", "Customer", "Service", "Fulfillment", "Status", "Assignee", "Total", "Created"]}>
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td>
                <Link className="link" href={`/admin/orders/${o.id}`}>
                  {o.number}
                </Link>
              </Td>
              <Td>{o.user.email}</Td>
              <Td className="max-w-[220px] truncate">
                {o.service.platform.name} · {o.service.name}
              </Td>
              <Td>{o.fulfillmentType.toLowerCase().replace("_", " ")}</Td>
              <Td>
                <StatusBadge status={o.status} label={ORDER_STATUS_LABEL[o.status]} />
              </Td>
              <Td>{o.assignee?.email ?? "—"}</Td>
              <Td>
                <Money minor={o.totalMinor} currency={o.currency} />
              </Td>
              <Td>{fmtDateTime(o.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="Queue is clear" />
      )}
      <Pagination page={page} totalPages={Math.ceil(total / 30)} hrefFor={(p) => `/admin/orders?t=${t}&page=${p}`} />
    </>
  );
}
