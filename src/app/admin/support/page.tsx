import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, fmtDateTime } from "@/components/ui";

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await requirePermissionPage("support:manage");
  const all = Boolean((await searchParams).all);
  const [tickets, contacts] = await Promise.all([
    db.supportTicket.findMany({ where: all ? {} : { status: { in: ["OPEN", "PENDING_STAFF", "PENDING_CUSTOMER"] } }, orderBy: { updatedAt: "asc" }, take: 100, include: { user: { select: { email: true } }, assignee: { select: { email: true } } } }),
    db.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader
        title="Support tickets"
        actions={
          <Link href={all ? "/admin/support" : "/admin/support?all=1"} className="btn-secondary">
            {all ? "Open only" : "Show all"}
          </Link>
        }
      />
      {tickets.length ? (
        <Table head={["Ticket", "Customer", "Subject", "Category", "Status", "Assignee", "Updated"]}>
          {tickets.map((t) => (
            <tr key={t.id}>
              <Td>
                <Link className="link" href={`/admin/support/${t.id}`}>
                  {t.number}
                </Link>
              </Td>
              <Td>{t.user?.email ?? t.guestEmail}</Td>
              <Td className="max-w-[260px] truncate">{t.subject}</Td>
              <Td>{t.category.toLowerCase()}</Td>
              <Td>
                <StatusBadge status={t.status} />
              </Td>
              <Td>{t.assignee?.email ?? "—"}</Td>
              <Td>{fmtDateTime(t.updatedAt)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No open tickets" />
      )}
      <h2 className="mb-3 mt-10 text-lg font-semibold">Contact form messages</h2>
      {contacts.length ? (
        <Card className="divide-y divide-slate-100">
          {contacts.map((c) => (
            <div key={c.id} className="p-4 text-sm">
              <p className="font-medium">
                {c.subject} — {c.name} &lt;
                <a className="link" href={`mailto:${c.email}`}>
                  {c.email}
                </a>
                &gt;
              </p>
              <p className="mt-1 whitespace-pre-wrap text-slate-600">{c.message}</p>
              <p className="mt-1 text-xs text-slate-400">{fmtDateTime(c.createdAt)}</p>
            </div>
          ))}
        </Card>
      ) : (
        <p className="text-sm text-slate-500">No contact messages.</p>
      )}
    </>
  );
}
