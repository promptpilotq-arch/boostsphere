import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ActionButton } from "@/components/client/action-button";
import { Badge, Money, PageHeader, StatusBadge, Table, Td } from "@/components/ui";

export default async function AdminServices({ searchParams }: { searchParams: Promise<{ platform?: string }> }) {
  await requirePermissionPage("catalog:manage");
  const { platform } = await searchParams;
  const [services, platforms] = await Promise.all([
    db.service.findMany({
      where: platform ? { platform: { slug: platform } } : {},
      orderBy: [{ platform: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      include: { platform: true, category: true, packages: { where: { active: true }, orderBy: { priceMinor: "asc" } }, _count: { select: { orders: true } } },
    }),
    db.socialPlatform.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="Services"
        description="Create service types without code changes. Paused or draft services are hidden from customers immediately."
        actions={
          <Link href="/admin/services/new" className="btn-primary">
            New service
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/services" className={`rounded-full border px-3 py-1 text-sm ${!platform ? "border-brand text-brand" : "border-slate-200 bg-white"}`}>
          All
        </Link>
        {platforms.map((p) => (
          <Link key={p.id} href={`/admin/services?platform=${p.slug}`} className={`rounded-full border px-3 py-1 text-sm ${platform === p.slug ? "border-brand text-brand" : "border-slate-200 bg-white"}`}>
            {p.name}
          </Link>
        ))}
      </div>
      <Table head={["Service", "Platform / category", "Pricing", "Fulfillment", "Orders", "Status", "Actions"]}>
        {services.map((s) => (
          <tr key={s.id}>
            <Td className="max-w-[260px] truncate">
              <Link className="link" href={`/admin/services/${s.id}`}>
                {s.name}
              </Link>
              {s.featured && <Badge tone="purple" className="ml-2">Featured</Badge>}
            </Td>
            <Td>
              {s.platform.name} · {s.category.name}
            </Td>
            <Td>{s.pricingModel === "PACKAGE" ? (s.packages[0] ? <>from <Money minor={s.packages[0].priceMinor} currency={s.packages[0].currency} /></> : "no packages") : s.unitPriceMinor != null ? <><Money minor={s.unitPriceMinor} currency={s.currency} /> / {s.unitSize} {s.unitLabel}</> : "—"}</Td>
            <Td>{s.fulfillmentType.toLowerCase().replace("_", " ")}</Td>
            <Td>{s._count.orders}</Td>
            <Td>
              <StatusBadge status={s.status} />
            </Td>
            <Td className="space-x-1">
              {s.status !== "PUBLISHED" && (
                <ActionButton endpoint={`/api/v1/admin/services/${s.id}`} body={{ status: "PUBLISHED" }} className="btn-primary px-2.5 py-1" successMessage="Published">
                  Publish
                </ActionButton>
              )}
              {s.status === "PUBLISHED" && (
                <ActionButton endpoint={`/api/v1/admin/services/${s.id}`} body={{ status: "PAUSED" }} className="btn-secondary px-2.5 py-1" successMessage="Paused">
                  Pause
                </ActionButton>
              )}
              {s.status !== "ARCHIVED" && (
                <ActionButton endpoint={`/api/v1/admin/services/${s.id}`} body={{ status: "ARCHIVED" }} className="btn-ghost px-2.5 py-1" confirm="Archive this service?">
                  Archive
                </ActionButton>
              )}
              {s._count.orders === 0 && (
                <ActionButton endpoint={`/api/v1/admin/services/${s.id}`} method="DELETE" className="btn-ghost px-2.5 py-1 text-red-700" confirm="Permanently delete this service? This cannot be undone.">
                  Delete
                </ActionButton>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
