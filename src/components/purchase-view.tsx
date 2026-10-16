import Link from "next/link";
import type { getPurchaseForViewer } from "@/server/marketplace";
import { PURCHASE_STATUS_LABEL } from "@/lib/order-status";
import { ApiForm, SubmitButton } from "./client/api-form";
import { ActionButton } from "./client/action-button";
import { MilestoneSubmit } from "./client/milestone-submit";
import { Card, Money, Notice, PageHeader, StatusBadge, fmtDateTime } from "./ui";

type Data = Awaited<ReturnType<typeof getPurchaseForViewer>>;

/** Shared purchase page for buyer, seller and staff. Actions shown depend on the viewer's role. */
export function PurchaseView({ purchase: p, role }: Data) {
  const active = ["PAID", "TRANSFER_IN_PROGRESS", "AWAITING_VERIFICATION"].includes(p.status);
  const openDispute = p.disputes.find((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");
  const paid = p.payments.find((x) => ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(x.status));
  const nextIdx = p.milestones.findIndex((m) => m.status !== "CONFIRMED");
  const canAct = (who: string) => who === role || (who === "ADMIN" && role === "STAFF");

  return (
    <>
      <PageHeader
        eyebrow={`Purchase ${p.number} · you are the ${role.toLowerCase()}`}
        title={p.listing.title}
        description={`${p.listing.platform.name} · seller ${p.seller.displayName}`}
        actions={
          <>
            {role === "BUYER" && p.status === "PENDING_PAYMENT" && (
              <Link href={`/checkout/purchase/${p.id}`} className="btn-gradient">
                Complete payment
              </Link>
            )}
            {role === "BUYER" && paid && (
              <a className="btn-secondary" href={`/api/v1/receipts/${paid.reference}`}>
                Receipt
              </a>
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Notice tone="amber" title="Never share credentials">
            Ownership moves only through {p.listing.platform.name}&apos;s official tools. Do not send or request passwords, recovery codes or login codes — report anyone who asks.
          </Notice>
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Transfer steps</h2>
              <StatusBadge status={p.status} label={PURCHASE_STATUS_LABEL[p.status]} />
            </div>
            <p className="mb-4 text-sm text-slate-600">Transfer method: {p.listing.transferMethod}</p>
            <ol className="space-y-4">
              {p.milestones.map((m, i) => (
                <li key={m.id} className={`rounded-xl border p-4 ${i === nextIdx && active ? "border-brand/40 bg-brand/5" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {m.sortOrder}. {m.title}
                    </p>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{m.description}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Done by: {m.responsible.toLowerCase()} · confirmed by: {m.confirmer.toLowerCase()}
                  </p>
                  {m.evidenceNote && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{m.evidenceNote}</p>}
                  {m.evidenceKey && (
                    <a href={`/api/v1/files/${m.evidenceKey}`} target="_blank" rel="noopener" className="link mt-1 inline-block text-sm">
                      View attached evidence
                    </a>
                  )}
                  {active && i === nextIdx && (m.status === "PENDING" || m.status === "REJECTED") && canAct(m.responsible) && <MilestoneSubmit purchaseId={p.id} milestoneId={m.id} />}
                  {active && m.status === "SUBMITTED" && canAct(m.confirmer) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton endpoint={`/api/v1/purchases/${p.id}`} body={{ action: "confirm_milestone", milestoneId: m.id }} className="btn-primary" successMessage="Step confirmed" confirm={m.confirmer === "ADMIN" ? "Confirm final verification and complete this purchase?" : undefined}>
                        Confirm
                      </ActionButton>
                      <details>
                        <summary className="btn-secondary cursor-pointer list-none">Send back</summary>
                        <ApiForm action={`/api/v1/purchases/${p.id}`} extra={{ action: "reject_milestone", milestoneId: m.id }} success={{ message: "Returned with your note" }} className="mt-2 space-y-2">
                          <textarea name="note" required minLength={5} rows={2} className="input" aria-label="What is missing?" placeholder="What is missing?" />
                          <SubmitButton className="btn-secondary">Return step</SubmitButton>
                        </ApiForm>
                      </details>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Card>

          {p.disputes.map((d) => (
            <Card key={d.id} className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Dispute: {d.reason.replace(/_/g, " ").toLowerCase()}</h2>
                <StatusBadge status={d.status} />
              </div>
              <p className="mt-2 text-sm text-slate-700">{d.details}</p>
              <ul className="mt-4 space-y-3">
                {d.messages.map((m) => (
                  <li key={m.id} className={`rounded-xl p-3 text-sm ${m.authorRole === "STAFF" ? "bg-violet-50" : "bg-slate-50"}`}>
                    <p className="text-xs font-semibold text-slate-500">
                      {m.authorRole.toLowerCase()} · {fmtDateTime(m.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
              {(d.status === "OPEN" || d.status === "UNDER_REVIEW") && (
                <ApiForm action={`/api/v1/purchases/${p.id}`} extra={{ action: "dispute_message", disputeId: d.id }} success={{ reset: true }} className="mt-4 space-y-2">
                  <textarea name="body" rows={2} className="input" required aria-label="Message" placeholder="Add information or evidence for the reviewer" />
                  <SubmitButton className="btn-secondary">Send</SubmitButton>
                </ApiForm>
              )}
              {d.resolution && <p className="mt-3 text-sm font-medium">Resolution: {d.resolution}</p>}
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-3 font-semibold">Summary</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Price</dt>
                <dd>
                  <Money minor={p.priceMinor} currency={p.currency} />
                </dd>
              </div>
              {role !== "SELLER" && (
                <div className="flex justify-between">
                  <dt className="text-slate-600">Buyer fee</dt>
                  <dd>
                    <Money minor={p.buyerFeeMinor} currency={p.currency} />
                  </dd>
                </div>
              )}
              {role !== "BUYER" && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Commission</dt>
                    <dd>
                      −<Money minor={p.sellerCommissionMinor} currency={p.currency} />
                    </dd>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <dt>Seller proceeds</dt>
                    <dd>
                      <Money minor={p.sellerPayoutMinor} currency={p.currency} />
                    </dd>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <dt>Payout status</dt>
                    <dd>{p.payoutStatus.replace(/_/g, " ").toLowerCase()}</dd>
                  </div>
                </>
              )}
              {role !== "SELLER" && (
                <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                  <dt>Total paid</dt>
                  <dd>
                    <Money minor={p.totalMinor} currency={p.currency} />
                  </dd>
                </div>
              )}
            </dl>
          </Card>
          {role !== "STAFF" && !openDispute && (active || p.status === "COMPLETED") && (
            <details className="card p-6">
              <summary className="cursor-pointer font-semibold">Open a dispute</summary>
              <p className="mt-2 text-sm text-slate-600">An administrator will review evidence from both sides. The purchase cannot complete while a dispute is open.</p>
              <ApiForm action={`/api/v1/purchases/${p.id}`} extra={{ action: "open_dispute" }} idempotent success={{ message: "Dispute opened" }} className="mt-4 space-y-3">
                <select name="reason" className="input" aria-label="Reason">
                  <option value="TRANSFER_NOT_STARTED">Transfer not started</option>
                  <option value="ACCESS_NOT_GRANTED">Access not granted</option>
                  <option value="NOT_AS_DESCRIBED">Not as described</option>
                  <option value="SELLER_RECLAIMED_ACCESS">Seller reclaimed access</option>
                  <option value="BUYER_UNRESPONSIVE">Buyer unresponsive</option>
                  <option value="OTHER">Other</option>
                </select>
                <textarea name="details" rows={4} className="input" required minLength={20} aria-label="Details" placeholder="What happened? Include dates." />
                <SubmitButton className="btn-danger">Open dispute</SubmitButton>
              </ApiForm>
            </details>
          )}
        </div>
      </div>
    </>
  );
}
