import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Badge, Card, Field, Money, PageHeader, Table, Td, fmtDate } from "@/components/ui";

export default async function AdminCoupons() {
  await requirePermissionPage("coupons:manage");
  const [coupons, platforms] = await Promise.all([db.coupon.findMany({ orderBy: { createdAt: "desc" } }), db.socialPlatform.findMany({ orderBy: { sortOrder: "asc" } })]);
  return (
    <>
      <PageHeader title="Coupons & discounts" description="Discounts are validated and applied on the server at quote and order time. Redemptions are counted only when payment is verified." />
      <Table head={["Code", "Discount", "Limits", "Window", "Redeemed", "Status"]}>
        {coupons.map((c) => (
          <tr key={c.id}>
            <Td className="font-mono">{c.code}</Td>
            <Td>{c.type === "PERCENT" ? `${c.value / 100}%` : <Money minor={c.value} currency={c.currency ?? "NGN"} />}{c.maxDiscountMinor ? <span className="text-xs text-slate-500"> (max <Money minor={c.maxDiscountMinor} currency={c.currency ?? "NGN"} />)</span> : null}</Td>
            <Td className="text-xs">
              {c.perUserLimit}/user{c.maxRedemptions ? ` · ${c.maxRedemptions} total` : ""}
              {c.minOrderMinor ? <> · min <Money minor={c.minOrderMinor} currency="NGN" /></> : null}
            </Td>
            <Td className="text-xs">
              {c.startsAt ? fmtDate(c.startsAt) : "now"} → {c.expiresAt ? fmtDate(c.expiresAt) : "no expiry"}
            </Td>
            <Td>{c.redemptionCount}</Td>
            <Td>{c.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
          </tr>
        ))}
      </Table>
      <Card className="mt-8 max-w-3xl p-6">
        <h2 className="font-semibold">Create coupon</h2>
        <ApiForm action="/api/v1/admin/catalog" extra={{ entity: "coupon" }} success={{ message: "Coupon created", reset: true }} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="code" required>
            <input id="code" name="data.code" required className="input uppercase" />
          </Field>
          <Field label="Description" htmlFor="desc">
            <input id="desc" name="data.description" className="input" />
          </Field>
          <Field label="Type" htmlFor="type">
            <select id="type" name="data.type" className="input">
              <option value="PERCENT">Percent (basis points)</option>
              <option value="FIXED">Fixed amount (minor units)</option>
            </select>
          </Field>
          <Field label="Value" htmlFor="value" hint="Percent: 1000 = 10%. Fixed: kobo, e.g. 500000 = ₦5,000.">
            <input id="value" name="data.value" type="number" min={1} required className="input" />
          </Field>
          <Field label="Currency (fixed only)" htmlFor="cur">
            <input id="cur" name="data.currency" defaultValue="NGN" className="input" data-nullable />
          </Field>
          <Field label="Max discount (₦)" htmlFor="maxd">
            <input id="maxd" name="data.maxDiscountMinor" data-money type="number" step="0.01" className="input" />
          </Field>
          <Field label="Minimum order (₦)" htmlFor="min">
            <input id="min" name="data.minOrderMinor" data-money type="number" step="0.01" className="input" />
          </Field>
          <Field label="Max redemptions" htmlFor="maxr">
            <input id="maxr" name="data.maxRedemptions" type="number" min={1} className="input" />
          </Field>
          <Field label="Per-user limit" htmlFor="pul">
            <input id="pul" name="data.perUserLimit" type="number" min={1} defaultValue={1} className="input" />
          </Field>
          <Field label="Platform restriction" htmlFor="plat">
            <select id="plat" name="data.platformId" className="input" data-nullable>
              <option value="">Any platform</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starts" htmlFor="sa">
            <input id="sa" name="data.startsAt" type="date" className="input" data-nullable />
          </Field>
          <Field label="Expires" htmlFor="ea">
            <input id="ea" name="data.expiresAt" type="date" className="input" data-nullable />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="data.active" defaultChecked /> Active
          </label>
          <div className="sm:col-span-2">
            <SubmitButton>Create coupon</SubmitButton>
          </div>
        </ApiForm>
      </Card>
    </>
  );
}
