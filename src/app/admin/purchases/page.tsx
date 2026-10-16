import Link from "next/link";
import { db } from "@/lib/db";
import { PURCHASE_STATUS_LABEL } from "@/lib/order-status";
import { requirePermissionPage } from "@/server/auth/current";
import { EmptyState, Money, PageHeader, StatusBadge, Table, Td, fmtDateTime } from "@/components/ui";

export default async function AdminPurchases() {
  await requirePermissionPage("disputes:manage");
  const items = await db.purchaseTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { listing: { select: { title: true } }, buyer: { select: { email: true } }, seller: { select: { displayName: true } }, milestones: { select: { status: true } } },
  });
  return (
    <>
      <PageHeader title="Marketplace purchases" description="Items “Awaiting verification” need an administrator to review evidence and confirm the final step." />
      {items.length ? (
        <Table head={["Number", "Listing", "Buyer", "Seller", "Steps", "Status", "Total", "Payout", "Created"]}>
          {items.map((p) => (
            <tr key={p.id}>
              <Td>
                <Link className="link" href={`/admin/purchases/${p.id}`}>
                  {p.number}
                </Link>
              </Td>
              <Td className="max-w-[200px] truncate">{p.listing.title}</Td>
              <Td>{p.buyer.email}</Td>
              <Td>{p.seller.displayName}</Td>
              <Td>
                {p.milestones.filter((m) => m.status === "CONFIRMED").length}/{p.milestones.length}
              </Td>
              <Td>
                <StatusBadge status={p.status} label={PURCHASE_STATUS_LABEL[p.status]} />
              </Td>
              <Td>
                <Money minor={p.totalMinor} currency={p.currency} />
              </Td>
              <Td>{p.payoutStatus.toLowerCase().replace("_", " ")}</Td>
              <Td>{fmtDateTime(p.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No marketplace purchases yet" />
      )}
    </>
  );
}
