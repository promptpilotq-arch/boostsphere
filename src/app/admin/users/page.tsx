import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ActionButton } from "@/components/client/action-button";
import { Badge, Card, PageHeader, Pagination, StatusBadge, Table, Td, fmtDate, fmtDateTime } from "@/components/ui";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePermissionPage("users:manage");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const where: Prisma.UserWhereInput = sp.q ? { OR: [{ email: { contains: sp.q, mode: "insensitive" } }, { profile: { displayName: { contains: sp.q, mode: "insensitive" } } }] } : {};
  const [users, total, deletions] = await Promise.all([
    db.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { profile: true, roles: { include: { role: true } }, _count: { select: { orders: true } } } }),
    db.user.count({ where }),
    db.accountDeletionRequest.findMany({ where: { status: "PENDING" }, include: { user: { select: { email: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Users & roles" />
      {deletions.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="font-semibold">Account deletion requests</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {deletions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {d.user.email} · {fmtDateTime(d.createdAt)} {d.reason && `· “${d.reason}”`}
                </span>
                <span className="flex gap-2">
                  <ActionButton endpoint={`/api/v1/admin/users/${d.userId}`} body={{ action: "process_deletion", requestId: d.id, approve: true }} className="btn-danger px-3 py-1.5" confirm="Anonymise this account? Financial records are retained.">
                    Anonymise
                  </ActionButton>
                  <ActionButton endpoint={`/api/v1/admin/users/${d.userId}`} body={{ action: "process_deletion", requestId: d.id, approve: false }} className="btn-ghost px-3 py-1.5">
                    Decline
                  </ActionButton>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <form className="mb-4 flex gap-2" action="/admin/users">
        <input name="q" defaultValue={sp.q} placeholder="Search email or name" className="input max-w-sm" aria-label="Search users" />
        <button className="btn-secondary">Search</button>
      </form>
      <Table head={["User", "Roles", "Status", "Verified", "Orders", "Joined"]}>
        {users.map((u) => (
          <tr key={u.id}>
            <Td>
              <Link href={`/admin/users/${u.id}`} className="link">
                {u.email}
              </Link>
              <span className="block text-xs text-slate-500">{u.profile?.displayName}</span>
            </Td>
            <Td className="space-x-1">
              {u.roles.map((r) => (
                <Badge key={r.roleId} tone={r.role.key.includes("ADMIN") ? "purple" : r.role.key === "SUPPORT" ? "blue" : "gray"}>
                  {r.role.name}
                </Badge>
              ))}
            </Td>
            <Td>
              <StatusBadge status={u.status} />
            </Td>
            <Td>{u.emailVerifiedAt ? "yes" : "no"}</Td>
            <Td>{u._count.orders}</Td>
            <Td>{fmtDate(u.createdAt)}</Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={Math.ceil(total / 30)} hrefFor={(p) => `/admin/users?page=${p}${sp.q ? `&q=${sp.q}` : ""}`} />
    </>
  );
}
