import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS_LABEL, ORDER_TRANSITIONS } from "@/lib/order-status";
import { requirePermissionPage } from "@/server/auth/current";
import { getOrderForViewer } from "@/server/orders";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { OrderTimeline } from "@/components/order-timeline";
import { Card, Field, Money, PageHeader, StatusBadge } from "@/components/ui";

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePermissionPage("orders:manage");
  const order = await getOrderForViewer(id, auth.user).catch(() => null);
  if (!order) notFound();
  const [staff, customer] = await Promise.all([
    db.user.findMany({ where: { roles: { some: { role: { key: { in: ["SUPPORT", "ADMIN", "SUPER_ADMIN"] } } } }, status: "ACTIVE" }, select: { id: true, email: true } }),
    db.user.findUnique({ where: { id: order.userId }, select: { email: true, profile: { select: { displayName: true } } } }),
  ]);
  // Only transitions staff may perform from the current state.
  const next = Object.entries(ORDER_TRANSITIONS[order.status])
    .filter(([, actors]) => actors?.includes("STAFF"))
    .map(([s]) => s)
    .filter((s) => s !== "REFUND_PENDING");
  const snap = order.pricingSnapshot as { lines: { label: string; amountMinor: number }[] };

  return (
    <>
      <PageHeader
        eyebrow={`Order ${order.number}`}
        title={order.service.name}
        description={
          <>
            {customer?.profile?.displayName} · {customer?.email} · fulfillment: {order.fulfillmentType.toLowerCase().replace("_", " ")}
          </>
        }
        actions={<StatusBadge status={order.status} label={ORDER_STATUS_LABEL[order.status]} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Customer inputs</h2>
            <dl className="space-y-2 text-sm">
              {Object.entries(order.inputs as Record<string, string>).map(([k, v]) => (
                <div key={k} className="grid gap-1 sm:grid-cols-[180px_1fr]">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="break-all">{/^https?:\/\//.test(v) ? <a className="link" href={v} target="_blank" rel="noopener noreferrer nofollow">{v}</a> : v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Timeline</h2>
            <OrderTimeline status={order.status} events={order.events} showInternal />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold">Update order</h2>
            <ApiForm action={`/api/v1/admin/orders/${order.id}`} method="PATCH" success={{ message: "Order updated", reset: true }} className="mt-4 space-y-4">
              <Field label="Change status" htmlFor="status">
                <select id="status" name="status" className="input" defaultValue="" data-nullable>
                  <option value="">Keep “{ORDER_STATUS_LABEL[order.status]}”</option>
                  {next.map((s) => (
                    <option key={s} value={s}>
                      → {ORDER_STATUS_LABEL[s as keyof typeof ORDER_STATUS_LABEL]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Message to customer" htmlFor="message" hint="Visible on the customer's timeline and sent as a notification.">
                <textarea id="message" name="message" rows={3} className="input" />
              </Field>
              <Field label="Internal note" htmlFor="internalNote" hint="Staff only.">
                <textarea id="internalNote" name="internalNote" rows={2} className="input" />
              </Field>
              <Field label="Completion evidence" htmlFor="completionEvidence" hint="Required before completing: campaign report link, deliverable URL, session summary.">
                <textarea id="completionEvidence" name="completionEvidence" rows={2} className="input" defaultValue="" />
              </Field>
              <Field label="Assignee" htmlFor="assigneeId">
                <select id="assigneeId" name="assigneeId" className="input" defaultValue={order.assigneeId ?? ""} data-nullable>
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.email}
                      {s.id === auth.user.id ? " (me)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <SubmitButton>Save update</SubmitButton>
            </ApiForm>
          </Card>
          <Card className="p-6">
            <h2 className="mb-3 font-semibold">Payment</h2>
            <dl className="space-y-1 text-sm">
              {snap.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <dt className="text-slate-600">{l.label}</dt>
                  <dd>{formatMoney(l.amountMinor, order.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <dt>Total</dt>
                <dd>
                  <Money minor={order.totalMinor} currency={order.currency} />
                </dd>
              </div>
            </dl>
            <ul className="mt-3 space-y-1 text-xs">
              {order.payments.map((p) => (
                <li key={p.id}>
                  <Link className="link" href={`/admin/payments?q=${p.reference}`}>
                    {p.reference}
                  </Link>{" "}
                  · {p.provider} · {p.status}
                </li>
              ))}
            </ul>
            {order.refunds.length > 0 && (
              <Link href="/admin/refunds" className="link mt-3 inline-block text-sm">
                {order.refunds.length} refund record(s) →
              </Link>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
