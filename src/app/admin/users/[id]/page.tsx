import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { can } from "@/server/auth/rbac";
import { getSettings } from "@/server/settings";
import { userBalances } from "@/server/wallet";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Card, Field, Money, Notice, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

const ROLES = ["CUSTOMER", "SELLER", "SUPPORT", "ADMIN", "SUPER_ADMIN"] as const;

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermissionPage("users:manage");
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, include: { profile: true, roles: { include: { role: true } }, orders: { orderBy: { createdAt: "desc" }, take: 10 } } });
  if (!u) notFound();
  const s = await getSettings();
  const bal = await userBalances(u.id, s.commerce.baseCurrency);
  const current = u.roles.map((r) => r.role.key);
  const superAdmin = can(auth.user.roles, "roles:grant_admin");
  return (
    <>
      <PageHeader title={u.email} description={`${u.profile?.displayName ?? ""} · joined ${fmtDateTime(u.createdAt)} · last login ${u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "never"}`} actions={<StatusBadge status={u.status} />} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-semibold">Roles</h2>
          {!superAdmin && <p className="mt-1 text-xs text-slate-500">Only super administrators can grant or remove admin roles.</p>}
          <ApiForm action={`/api/v1/admin/users/${u.id}`} extra={{ action: "set_roles" }} success={{ message: "Roles updated" }} className="mt-4 space-y-2">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roles" value={r} data-array defaultChecked={current.includes(r)} disabled={!superAdmin && (r === "ADMIN" || r === "SUPER_ADMIN")} /> {r.replace("_", " ").toLowerCase()}
              </label>
            ))}
            {/* Disabled checkboxes are not submitted; keep existing privileged roles for non-super admins. */}
            {!superAdmin && current.filter((r) => r === "ADMIN" || r === "SUPER_ADMIN").map((r) => <input key={r} type="checkbox" name="roles" value={r} data-array defaultChecked hidden readOnly />)}
            <SubmitButton>Save roles</SubmitButton>
          </ApiForm>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Account status</h2>
          <ApiForm action={`/api/v1/admin/users/${u.id}`} extra={{ action: "set_status" }} success={{ message: "Status updated" }} className="mt-4 space-y-3">
            <select name="status" defaultValue={u.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"} className="input" aria-label="Status">
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended (signs out everywhere)</option>
            </select>
            <input name="reason" required minLength={3} className="input" placeholder="Reason (audit log)" aria-label="Reason" />
            <SubmitButton>Update status</SubmitButton>
          </ApiForm>
        </Card>
        {can(auth.user.roles, "wallet:adjust") && (
          <Card className="p-6">
            <h2 className="font-semibold">Wallet</h2>
            <p className="mt-1 text-sm">
              Available <Money minor={bal.available} currency={s.commerce.baseCurrency} /> · Promotional <Money minor={bal.promotional} currency={s.commerce.baseCurrency} /> · Pending <Money minor={bal.pending} currency={s.commerce.baseCurrency} />
            </p>
            <Notice tone="amber">Adjustments create an immutable ledger entry with your name and reason. Use negative amounts to debit (e.g. after a manual payout).</Notice>
            <ApiForm action={`/api/v1/admin/users/${u.id}`} extra={{ action: "wallet_adjustment", currency: s.commerce.baseCurrency, idempotencyKey: randomUUID() }} success={{ message: "Adjustment posted" }} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount (₦, ± allowed)" htmlFor="amt">
                  <input id="amt" name="amountMinor" data-money type="number" step="0.01" required className="input" />
                </Field>
                <Field label="Bucket" htmlFor="bucket">
                  <select id="bucket" name="bucket" className="input">
                    <option value="AVAILABLE">Available</option>
                    <option value="PROMOTIONAL">Promotional</option>
                  </select>
                </Field>
              </div>
              <input name="reason" required minLength={5} className="input" placeholder="Reason (required)" aria-label="Reason" />
              <SubmitButton>Post adjustment</SubmitButton>
            </ApiForm>
          </Card>
        )}
        <Card className="p-6">
          <h2 className="font-semibold">Recent orders</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {u.orders.map((o) => (
              <li key={o.id}>
                <Link className="link" href={`/admin/orders/${o.id}`}>
                  {o.number}
                </Link>{" "}
                · {o.status.toLowerCase()} · <Money minor={o.totalMinor} currency={o.currency} />
              </li>
            ))}
            {u.orders.length === 0 && <li className="text-slate-500">No orders</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
