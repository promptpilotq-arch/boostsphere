import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { PageHeader, Pagination, Table, Td, fmtDateTime } from "@/components/ui";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await requirePermissionPage("audit:read");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const where = sp.action ? { action: { startsWith: sp.action } } : {};
  const [logs, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { actor: { select: { email: true } } } }), db.auditLog.count({ where })]);
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of security, financial and administrative actions." />
      <form className="mb-4 flex gap-2" action="/admin/audit">
        <input name="action" defaultValue={sp.action} placeholder="Filter by action prefix, e.g. payment. or refund." className="input max-w-sm" aria-label="Action filter" />
        <button className="btn-secondary">Filter</button>
      </form>
      <Table head={["Time", "Actor", "Action", "Entity", "IP", "Details"]}>
        {logs.map((l) => (
          <tr key={l.id}>
            <Td>{fmtDateTime(l.createdAt)}</Td>
            <Td>{l.actor?.email ?? "system"}</Td>
            <Td className="font-mono text-xs">{l.action}</Td>
            <Td className="text-xs">
              {l.entityType} {l.entityId?.slice(0, 12)}
            </Td>
            <Td className="text-xs">{l.ip ?? ""}</Td>
            <Td className="max-w-[320px] truncate font-mono text-xs" >{l.metadata ? JSON.stringify(l.metadata) : ""}</Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={Math.ceil(total / 50)} hrefFor={(p) => `/admin/audit?page=${p}${sp.action ? `&action=${sp.action}` : ""}`} />
    </>
  );
}
