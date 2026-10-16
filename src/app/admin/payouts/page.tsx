import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { RevealAccount } from "@/components/client/reveal-account";
import { Card, EmptyState, Money, Notice, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

export default async function AdminPayouts({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await requirePermissionPage("payouts:manage");
  const all = Boolean((await searchParams).all);
  const payouts = await db.payoutRequest.findMany({
    where: all ? {} : { status: "REQUESTED" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { user: { select: { email: true, profile: { select: { displayName: true } }, sellerProfile: { select: { displayName: true, verificationStatus: true } } } } },
  });
  return (
    <>
      <PageHeader
        title="Withdrawals"
        description="Send the bank transfer first, then mark the request paid with the transfer reference. Requested funds are already held in the user's wallet."
        actions={
          <Link href={all ? "/admin/payouts" : "/admin/payouts?all=1"} className="btn-secondary">
            {all ? "Pending only" : "Show all"}
          </Link>
        }
      />
      <div className="mb-6">
        <Notice tone="amber">Check that the account name matches the user (or their verified business) before paying. Revealing an account number is audit-logged.</Notice>
      </div>
      {payouts.length === 0 && <EmptyState title="No withdrawal requests" />}
      <div className="space-y-4">
        {payouts.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">
                  <Money minor={p.amountMinor} currency={p.currency} /> · {p.number}
                </p>
                <p className="text-sm text-slate-600">
                  <Link href={`/admin/users/${p.userId}`} className="link">
                    {p.user.email}
                  </Link>{" "}
                  · {p.user.profile?.displayName}
                  {p.user.sellerProfile && ` · seller "${p.user.sellerProfile.displayName}" (${p.user.sellerProfile.verificationStatus.toLowerCase()})`}
                </p>
                <p className="mt-2 text-sm">
                  {p.bankName} · {p.accountName} · <RevealAccount payoutId={p.id} last4={p.accountLast4} />
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Requested {fmtDateTime(p.createdAt)}
                  {p.processedAt && ` · processed ${fmtDateTime(p.processedAt)}`}
                  {p.transferReference && ` · ref ${p.transferReference}`}
                </p>
                {p.adminNote && <p className="mt-1 text-xs text-slate-600">Note: {p.adminNote}</p>}
              </div>
              <StatusBadge status={p.status} />
            </div>
            {p.status === "REQUESTED" && (
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
                <ApiForm action={`/api/v1/admin/payouts/${p.id}`} extra={{ decision: "PAID" }} confirm="Confirm the bank transfer has been sent?" success={{ message: "Marked as paid" }} className="flex gap-2">
                  <input name="transferReference" required minLength={4} className="input" placeholder="Bank transfer reference" aria-label="Transfer reference" />
                  <SubmitButton>Mark paid</SubmitButton>
                </ApiForm>
                <ApiForm action={`/api/v1/admin/payouts/${p.id}`} extra={{ decision: "REJECTED" }} success={{ message: "Rejected; funds released" }} className="flex gap-2">
                  <input name="note" required minLength={5} className="input" placeholder="Reason (sent to user)" aria-label="Rejection reason" />
                  <SubmitButton className="btn-secondary">Reject</SubmitButton>
                </ApiForm>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
