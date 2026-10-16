import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ServiceEditor } from "@/components/service-editor";
import { PageHeader, StatusBadge } from "@/components/ui";

export default async function EditService({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionPage("catalog:manage");
  const { id } = await params;
  const platforms = await db.socialPlatform.findMany({ orderBy: { sortOrder: "asc" }, include: { categories: { orderBy: { sortOrder: "asc" } } } });
  if (id === "new") {
    return (
      <>
        <PageHeader title="New service" />
        <div className="max-w-4xl">
          <ServiceEditor platforms={platforms} />
        </div>
      </>
    );
  }
  const service = await db.service.findUnique({ where: { id }, include: { packages: { orderBy: { sortOrder: "asc" } } } });
  if (!service) notFound();
  return (
    <>
      <PageHeader
        title={service.name}
        actions={
          <>
            <StatusBadge status={service.status} />
            {service.status === "PUBLISHED" && (
              <Link className="btn-secondary" href={`/services/${service.slug}`} target="_blank">
                View live
              </Link>
            )}
          </>
        }
      />
      <div className="max-w-4xl">
        <ServiceEditor service={service} platforms={platforms} />
      </div>
    </>
  );
}
