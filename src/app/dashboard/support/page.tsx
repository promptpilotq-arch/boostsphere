import Link from "next/link";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { EmptyState, PageHeader, StatusBadge, Table, Td, fmtDateTime } from "@/components/ui";

export default async function SupportList() {
  const auth = await requireUserPage("/dashboard/support");
  const tickets = await db.supportTicket.findMany({ where: { userId: auth.user.id }, orderBy: { updatedAt: "desc" } });
  return (
    <>
      <PageHeader
        title="Support"
        actions={
          <Link href="/dashboard/support/new" className="btn-primary">
            New ticket
          </Link>
        }
      />
      {tickets.length ? (
        <Table head={["Ticket", "Subject", "Category", "Status", "Updated"]}>
          {tickets.map((t) => (
            <tr key={t.id} className="hover:bg-slate-50">
              <Td>
                <Link className="link" href={`/dashboard/support/${t.id}`}>
                  {t.number}
                </Link>
              </Td>
              <Td className="max-w-[280px] truncate">{t.subject}</Td>
              <Td>{t.category.toLowerCase()}</Td>
              <Td>
                <StatusBadge status={t.status} />
              </Td>
              <Td>{fmtDateTime(t.updatedAt)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No tickets" description="Need help with an order or payment? Open a ticket and our team will reply here." action={<Link href="/dashboard/support/new" className="btn-primary">New ticket</Link>} />
      )}
    </>
  );
}
