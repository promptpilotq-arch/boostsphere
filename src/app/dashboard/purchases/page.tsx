import Link from "next/link";
import { db } from "@/lib/db";
import { PURCHASE_STATUS_LABEL } from "@/lib/order-status";
import { requireUserPage } from "@/server/auth/current";
import { EmptyState, Money, PageHeader, StatusBadge, Table, Td, fmtDate } from "@/components/ui";

export default async function PurchasesPage() {
  const auth = await requireUserPage("/dashboard/purchases");
  const items = await db.purchaseTransaction.findMany({
    where: { OR: [{ buyerId: auth.user.id }, { seller: { userId: auth.user.id } }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { listing: { select: { title: true } } },
  });
  return (
    <>
      <PageHeader title="Marketplace purchases" description="Purchases you made and sales of your listings." />
      {items.length ? (
        <Table head={["Number", "Listing", "Role", "Status", "Amount", "Date"]}>
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td>
                <Link className="link" href={`/dashboard/purchases/${p.id}`}>
                  {p.number}
                </Link>
              </Td>
              <Td className="max-w-[240px] truncate">{p.listing.title}</Td>
              <Td>{p.buyerId === auth.user.id ? "Buyer" : "Seller"}</Td>
              <Td>
                <StatusBadge status={p.status} label={PURCHASE_STATUS_LABEL[p.status]} />
              </Td>
              <Td>
                <Money minor={p.buyerId === auth.user.id ? p.totalMinor : p.sellerPayoutMinor} currency={p.currency} />
              </Td>
              <Td>{fmtDate(p.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No marketplace activity yet" action={<Link href="/marketplace" className="btn-primary">Browse marketplace</Link>} />
      )}
    </>
  );
}
