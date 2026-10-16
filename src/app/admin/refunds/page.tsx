import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { ActionButton } from "@/components/client/action-button";
import { Card, EmptyState, Money, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

export default async function AdminRefunds() {
  const auth = await requirePermissionPage("payments:read");
  const approve = can(auth.user.roles, "refunds:approve");
  const refunds = await db.refund.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { payment: true, order: { select: { number: true, id: true } }, purchase: { select: { number: true, id: true } } } });
  return (
    <>
      <PageHeader title="Refunds" description="Approve full or partial refunds to the original payment method or to the customer's wallet. Every decision is audit-logged." />
      {refunds.length ? (
        <div className="space-y-4">
          {refunds.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    <Money minor={r.amountMinor} currency={r.currency} /> · {r.destination === "WALLET" ? "to wallet" : `to ${r.payment?.provider ?? "original method"}`}
                  </p>
                  <p className="text-sm text-slate-600">
                    {r.order ? (
                      <Link className="link" href={`/admin/orders/${r.order.id}`}>
                        Order {r.order.number}
                      </Link>
                    ) : r.purchase ? (
                      <Link className="link" href={`/admin/purchases/${r.purchase.id}`}>
                        Purchase {r.purchase.number}
                      </Link>
                    ) : null}{" "}
                    · payment {r.payment?.reference} · requested {fmtDateTime(r.createdAt)}
                  </p>
                  <p className="mt-2 text-sm">{r.reason}</p>
                  {r.adminNote && <p className="mt-1 text-xs text-slate-500">Note: {r.adminNote}</p>}
                </div>
                <StatusBadge status={r.status} />
              </div>
              {approve && (r.status === "REQUESTED" || r.status === "FAILED") && (
                <ApiForm action={`/api/v1/admin/refunds/${r.id}`} success={{ message: "Decision recorded" }} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
                  <select name="decision" className="input" aria-label="Decision">
                    <option value="APPROVE">Approve</option>
                    <option value="REJECT">Reject</option>
                  </select>
                  <input name="amountMinor" data-money type="number" step="0.01" min="0.01" defaultValue={r.amountMinor / 100} className="input" aria-label="Amount" />
                  <select name="destination" defaultValue={r.destination} className="input" aria-label="Destination">
                    <option value="ORIGINAL_METHOD">Original method</option>
                    <option value="WALLET">Wallet</option>
                  </select>
                  <input name="note" placeholder="Note to customer" className="input" aria-label="Note" />
                  <div className="sm:col-span-4">
                    <SubmitButton>Submit decision</SubmitButton>
                  </div>
                </ApiForm>
              )}
              {approve && r.status === "PROCESSING" && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-sm text-slate-600">Provider accepted the refund (ref {r.providerRefundId}). Confirm once it shows as processed in the provider dashboard, or wait for the webhook.</p>
                  <ActionButton endpoint={`/api/v1/admin/refunds/${r.id}`} body={{ decision: "CONFIRM_PROCESSED" }} confirm="Confirm the provider has processed this refund?" successMessage="Refund marked succeeded">
                    Mark as processed
                  </ActionButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No refund requests" />
      )}
    </>
  );
}
