import { notFound } from "next/navigation";
import { requireUserPage } from "@/server/auth/current";
import { getTicketForViewer } from "@/server/support";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { TicketThread } from "@/components/ticket-thread";
import { Card, PageHeader, StatusBadge } from "@/components/ui";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUserPage(`/dashboard/support/${id}`);
  const t = await getTicketForViewer(id, auth.user).catch(() => null);
  if (!t || t.userId !== auth.user.id) notFound();
  return (
    <>
      <PageHeader eyebrow={`Ticket ${t.number}`} title={t.subject} actions={<StatusBadge status={t.status} />} />
      <div className="max-w-3xl space-y-6">
        <TicketThread messages={t.messages} />
        {t.status !== "CLOSED" && (
          <Card className="p-5">
            <ApiForm action={`/api/v1/support/tickets/${t.id}`} success={{ reset: true, message: "Reply sent" }} className="space-y-3">
              <label htmlFor="body" className="label">
                Reply
              </label>
              <textarea id="body" name="body" rows={4} className="input" required />
              <SubmitButton>Send reply</SubmitButton>
            </ApiForm>
          </Card>
        )}
      </div>
    </>
  );
}
