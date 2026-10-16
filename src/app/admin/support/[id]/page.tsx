import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissionPage } from "@/server/auth/current";
import { getTicketForViewer } from "@/server/support";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { TicketThread } from "@/components/ticket-thread";
import { Card, PageHeader, StatusBadge } from "@/components/ui";

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionPage("support:manage");
  const t = await getTicketForViewer((await params).id, auth.user).catch(() => null);
  if (!t) notFound();
  return (
    <>
      <PageHeader
        eyebrow={`Ticket ${t.number} · ${t.category.toLowerCase()}`}
        title={t.subject}
        description={
          <>
            {t.user?.profile?.displayName} · {t.user?.email}
            {t.relatedOrderId && (
              <>
                {" "}
                ·{" "}
                <Link className="link" href={`/admin/orders/${t.relatedOrderId}`}>
                  related order
                </Link>
              </>
            )}
          </>
        }
        actions={<StatusBadge status={t.status} />}
      />
      <div className="max-w-3xl space-y-6">
        <TicketThread messages={t.messages} />
        <Card className="p-5">
          <ApiForm action={`/api/v1/support/tickets/${t.id}`} success={{ reset: true, message: "Saved" }} className="space-y-3">
            <textarea name="body" rows={4} className="input" required aria-label="Reply" placeholder="Reply to the customer, or add an internal note" />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="internal" /> Internal note (not visible to customer)
              </label>
              <select name="status" className="input max-w-[220px]" defaultValue="PENDING_CUSTOMER" aria-label="Set status">
                <option value="PENDING_CUSTOMER">Waiting on customer</option>
                <option value="PENDING_STAFF">Waiting on staff</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
              <SubmitButton>Send</SubmitButton>
            </div>
          </ApiForm>
        </Card>
      </div>
    </>
  );
}
