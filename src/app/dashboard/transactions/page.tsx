import Link from "next/link";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { EmptyState, Money, PageHeader, Pagination, StatusBadge, Table, Td, fmtDateTime } from "@/components/ui";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const auth = await requireUserPage("/dashboard/transactions");
  const page = Number((await searchParams).page) || 1;
  const [items, total] = await Promise.all([
    db.payment.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25 }),
    db.payment.count({ where: { userId: auth.user.id } }),
  ]);
  return (
    <>
      <PageHeader title="Transactions & receipts" description="Every payment attempt, with downloadable receipts for successful payments." />
      {items.length ? (
        <Table head={["Date", "Reference", "For", "Method", "Status", "Amount", ""]}>
          {items.map((p) => (
            <tr key={p.id}>
              <Td>{fmtDateTime(p.createdAt)}</Td>
              <Td className="font-mono text-xs">{p.reference}</Td>
              <Td>
                {p.orderId ? (
                  <Link className="link" href={`/dashboard/orders/${p.orderId}`}>
                    Service order
                  </Link>
                ) : p.purchaseId ? (
                  <Link className="link" href={`/dashboard/purchases/${p.purchaseId}`}>
                    Marketplace
                  </Link>
                ) : (
                  "Wallet deposit"
                )}
              </Td>
              <Td>{p.provider}</Td>
              <Td>
                <StatusBadge status={p.status} />
              </Td>
              <Td>
                <Money minor={p.amountMinor} currency={p.currency} />
              </Td>
              <Td>
                {["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status) && (
                  <a className="link" href={`/api/v1/receipts/${p.reference}`}>
                    Receipt
                  </a>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No transactions yet" />
      )}
      <Pagination page={page} totalPages={Math.ceil(total / 25)} hrefFor={(n) => `/dashboard/transactions?page=${n}`} />
    </>
  );
}
