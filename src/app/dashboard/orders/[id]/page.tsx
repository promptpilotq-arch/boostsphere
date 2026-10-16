import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { requireUserPage } from "@/server/auth/current";
import { getOrderForViewer } from "@/server/orders";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { ActionButton } from "@/components/client/action-button";
import { OrderTimeline } from "@/components/order-timeline";
import { Card, Money, Notice, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

const REFUNDABLE = ["PAYMENT_CONFIRMED", "PROCESSING", "IN_PROGRESS", "AWAITING_CUSTOMER_INFO", "COMPLETED"];

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUserPage(`/dashboard/orders/${id}`);
  const order = await getOrderForViewer(id, auth.user).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  if (order.userId !== auth.user.id) notFound(); // staff use the admin view
  const review = await db.review.findFirst({ where: { orderId: order.id, userId: auth.user.id } });
  const snap = order.pricingSnapshot as { lines: { label: string; amountMinor: number }[] };
  const inputs = order.inputs as Record<string, string>;
  const paid = order.payments.find((p) => ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status));
  const openRefund = order.refunds.find((r) => ["REQUESTED", "APPROVED", "PROCESSING"].includes(r.status));

  return (
    <>
      <PageHeader
        eyebrow={`Order ${order.number}`}
        title={order.service.name}
        description={`${order.service.platform.name}${order.package ? ` · ${order.package.name}` : ` · ${order.quantity} ${order.service.unitLabel}`} · placed ${fmtDateTime(order.createdAt)}`}
        actions={
          <>
            {order.status === "PENDING_PAYMENT" && (
              <Link className="btn-gradient" href={`/checkout/${order.id}`}>
                Pay now
              </Link>
            )}
            {paid && (
              <a className="btn-secondary" href={`/api/v1/receipts/${paid.reference}`}>
                Download receipt
              </a>
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-semibold">Progress</h2>
              <StatusBadge status={order.status} label={ORDER_STATUS_LABEL[order.status]} />
            </div>
            <OrderTimeline status={order.status} events={order.events} />
          </Card>

          {order.status === "AWAITING_CUSTOMER_INFO" && (
            <Card className="border-amber-300 p-6">
              <h2 className="font-semibold">We need some information</h2>
              <p className="mt-1 text-sm text-slate-600">See the latest update above, then reply here. Never send passwords or login codes.</p>
              <ApiForm action={`/api/v1/orders/${order.id}`} extra={{ action: "provide_info" }} success={{ message: "Thanks — sent to our team." }} className="mt-4 space-y-3">
                <textarea name="message" rows={4} className="input" required aria-label="Your reply" />
                <SubmitButton>Send information</SubmitButton>
              </ApiForm>
            </Card>
          )}

          {order.completionEvidence && (
            <Card className="p-6">
              <h2 className="font-semibold">Completion evidence</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{order.completionEvidence}</p>
            </Card>
          )}

          {order.status === "COMPLETED" && !review && (
            <Card className="p-6">
              <h2 className="font-semibold">How did it go?</h2>
              <p className="mt-1 text-sm text-slate-600">Reviews are moderated and shown with your first name only.</p>
              <ApiForm action="/api/v1/reviews" extra={{ orderId: order.id }} success={{ message: "Thanks for your review!" }} className="mt-4 space-y-3">
                <select name="rating" className="input" aria-label="Rating" defaultValue="5">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)} ({n})
                    </option>
                  ))}
                </select>
                <input name="title" className="input" placeholder="Title" required aria-label="Review title" />
                <textarea name="body" rows={3} className="input" placeholder="Tell others about your experience" required aria-label="Review" />
                <SubmitButton>Submit review</SubmitButton>
              </ApiForm>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-3 font-semibold">Order details</h2>
            <dl className="space-y-2 text-sm">
              {Object.entries(inputs).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">{k.replace(/_/g, " ")}</dt>
                  <dd className="break-all">{v}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Estimated duration</dt>
                <dd>{order.service.estimatedDuration}</dd>
              </div>
            </dl>
          </Card>
          <Card className="p-6">
            <h2 className="mb-3 font-semibold">Payment</h2>
            <dl className="space-y-1.5 text-sm">
              {snap.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <dt className="text-slate-600">{l.label}</dt>
                  <dd className="tabular-nums">{formatMoney(l.amountMinor, order.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                <dt>Total</dt>
                <dd>
                  <Money minor={order.totalMinor} currency={order.currency} />
                </dd>
              </div>
            </dl>
            {order.payments.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-slate-500">
                {order.payments.map((p) => (
                  <li key={p.id}>
                    {p.reference} · {p.provider} · <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {order.refunds.length > 0 && (
            <Card className="p-6">
              <h2 className="mb-3 font-semibold">Refunds</h2>
              <ul className="space-y-3 text-sm">
                {order.refunds.map((r) => (
                  <li key={r.id}>
                    <div className="flex items-center justify-between">
                      <Money minor={r.amountMinor} currency={r.currency} />
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500">{r.adminNote || r.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {REFUNDABLE.includes(order.status) && !openRefund && (
            <details className="card p-6">
              <summary className="cursor-pointer font-semibold">Request a refund</summary>
              <p className="mt-2 text-sm text-slate-600">{order.service.refundable ? order.service.refundPolicy : "This service is marked non-refundable. You can still contact support."}</p>
              {order.service.refundable && (
                <ApiForm action={`/api/v1/orders/${order.id}`} extra={{ action: "request_refund" }} idempotent success={{ message: "Refund requested. We'll review it shortly." }} className="mt-4 space-y-3">
                  <textarea name="reason" rows={3} className="input" required minLength={10} placeholder="Why are you requesting a refund?" aria-label="Refund reason" />
                  <SubmitButton className="btn-secondary">Submit request</SubmitButton>
                </ApiForm>
              )}
            </details>
          )}
          {order.status === "PENDING_PAYMENT" && (
            <ActionButton endpoint={`/api/v1/orders/${order.id}`} body={{ action: "cancel" }} confirm="Cancel this order?" className="btn-ghost w-full" successMessage="Order cancelled">
              Cancel order
            </ActionButton>
          )}
          <Notice>
            Questions?{" "}
            <Link href={`/dashboard/support/new?order=${order.id}`} className="link">
              Open a support ticket
            </Link>{" "}
            about this order.
          </Notice>
        </div>
      </div>
    </>
  );
}
