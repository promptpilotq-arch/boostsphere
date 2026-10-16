import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { requireUserPage } from "@/server/auth/current";
import { EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, Td, fmtDate } from "@/components/ui";

const FILTERS: [string, OrderStatus[] | null][] = [
  ["All", null],
  ["Awaiting payment", ["PENDING_PAYMENT"]],
  ["Active", ["PAYMENT_CONFIRMED", "PROCESSING", "IN_PROGRESS", "AWAITING_CUSTOMER_INFO", "UNDER_REVIEW"]],
  ["Completed", ["COMPLETED"]],
  ["Refunds & cancelled", ["REFUND_PENDING", "REFUNDED", "CANCELLED"]],
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ f?: string; page?: string }> }) {
  const sp = await searchParams;
  const auth = await requireUserPage("/dashboard/orders");
  const fi = Math.min(FILTERS.length - 1, Math.max(0, Number(sp.f) || 0));
  const statuses = FILTERS[fi][1];
  const page = Number(sp.page) || 1;
  const where = { userId: auth.user.id, ...(statuses ? { status: { in: statuses } } : {}) };
  const [orders, total] = await Promise.all([
    db.serviceOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20, include: { service: { include: { platform: true } } } }),
    db.serviceOrder.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Orders" description="Track progress on your promotion and consulting orders." />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([label], i) => (
          <Link key={label} href={`/dashboard/orders?f=${i}`} className={`rounded-full border px-3 py-1.5 text-sm ${i === fi ? "border-brand bg-brand/5 text-brand" : "border-slate-200 bg-white text-slate-700"}`}>
            {label}
          </Link>
        ))}
      </div>
      {orders.length ? (
        <Table head={["Order", "Service", "Platform", "Status", "Total", "Placed"]}>
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td>
                <Link className="link" href={`/dashboard/orders/${o.id}`}>
                  {o.number}
                </Link>
              </Td>
              <Td>{o.service.name}</Td>
              <Td>{o.service.platform.name}</Td>
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
        <EmptyState title="No orders here" action={<Link href="/services" className="btn-primary">Browse services</Link>} />
      )}
      <Pagination page={page} totalPages={Math.ceil(total / 20)} hrefFor={(p) => `/dashboard/orders?f=${fi}&page=${p}`} />
    </>
  );
}
