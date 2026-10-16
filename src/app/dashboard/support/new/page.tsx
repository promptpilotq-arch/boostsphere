import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Card, Field, PageHeader } from "@/components/ui";

export default async function NewTicket({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const auth = await requireUserPage("/dashboard/support/new");
  const { order } = await searchParams;
  const orders = await db.serviceOrder.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, number: true, service: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="New support ticket" />
      <Card className="max-w-2xl p-6">
        <ApiForm action="/api/v1/support/tickets" success={{ redirect: "/dashboard/support/{ticket.id}", message: "Ticket created" }} className="space-y-4">
          <Field label="Subject" htmlFor="subject" required>
            <input id="subject" name="subject" className="input" required minLength={4} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="category">
              <select id="category" name="category" className="input" defaultValue={order ? "ORDER" : "OTHER"}>
                <option value="ORDER">Order</option>
                <option value="PAYMENT">Payment</option>
                <option value="REFUND">Refund</option>
                <option value="MARKETPLACE">Marketplace</option>
                <option value="ACCOUNT">Account</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Related order" htmlFor="relatedOrderId">
              <select id="relatedOrderId" name="relatedOrderId" className="input" defaultValue={order ?? ""} data-nullable>
                <option value="">None</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} — {o.service.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="How can we help?" htmlFor="body" required hint="Never include passwords, login codes or card numbers.">
            <textarea id="body" name="body" rows={6} className="input" required minLength={10} />
          </Field>
          <SubmitButton>Create ticket</SubmitButton>
        </ApiForm>
      </Card>
    </>
  );
}
