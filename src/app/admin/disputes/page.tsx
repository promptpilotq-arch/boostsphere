import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Card, EmptyState, Money, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

export default async function AdminDisputes() {
  await requirePermissionPage("disputes:manage");
  const disputes = await db.dispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: { purchase: { include: { listing: { select: { title: true } }, buyer: { select: { email: true } }, seller: { select: { displayName: true } } } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  return (
    <>
      <PageHeader title="Disputes" description="Resolving for the buyer issues a full refund and reverses the seller's held proceeds. Resolving for the seller returns the purchase to its previous step — it is not completed automatically." />
      {disputes.length === 0 && <EmptyState title="No disputes" />}
      <div className="space-y-4">
        {disputes.map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  <Link href={`/admin/purchases/${d.purchaseId}`} className="link">
                    {d.purchase.number}
                  </Link>{" "}
                  · {d.purchase.listing.title}
                </p>
                <p className="text-sm text-slate-600">
                  Buyer {d.purchase.buyer.email} · Seller {d.purchase.seller.displayName} · <Money minor={d.purchase.totalMinor} currency={d.purchase.currency} /> · opened {fmtDateTime(d.createdAt)}
                </p>
              </div>
              <StatusBadge status={d.status} />
            </div>
            <p className="mt-3 text-sm">
              <strong>{d.reason.replace(/_/g, " ").toLowerCase()}:</strong> {d.details}
            </p>
            {d.messages.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {d.messages.map((m) => (
                  <li key={m.id} className="rounded-lg bg-slate-50 p-2">
                    <span className="text-xs font-semibold text-slate-500">{m.authorRole}</span> {m.body}
                  </li>
                ))}
              </ul>
            )}
            {(d.status === "OPEN" || d.status === "UNDER_REVIEW") && (
              <ApiForm action={`/api/v1/admin/disputes/${d.id}`} success={{ message: "Dispute updated" }} confirm="Apply this dispute outcome?" className="mt-4 grid gap-2 border-t border-slate-100 pt-4 md:grid-cols-[200px_1fr_auto]">
                <select name="outcome" className="input" aria-label="Outcome">
                  <option value="UNDER_REVIEW">Mark under review</option>
                  <option value="RESOLVED_BUYER">Resolve for buyer (refund)</option>
                  <option value="RESOLVED_SELLER">Resolve for seller</option>
                  <option value="CLOSED">Close (withdrawn)</option>
                </select>
                <input name="resolution" required minLength={5} className="input" placeholder="Explanation sent to both parties" aria-label="Resolution" />
                <SubmitButton>Apply</SubmitButton>
              </ApiForm>
            )}
            {d.resolution && <p className="mt-3 text-sm">Resolution: {d.resolution}</p>}
          </Card>
        ))}
      </div>
    </>
  );
}
