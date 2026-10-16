import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ActionButton } from "@/components/client/action-button";
import { Card, EmptyState, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

export default async function AdminReviews() {
  await requirePermissionPage("reviews:moderate");
  const reviews = await db.review.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { user: { select: { email: true } }, service: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="Reviews" description="Reviews can only be written by customers with a completed order or purchase. Approve genuine reviews; never edit their content." />
      {reviews.length === 0 && <EmptyState title="No reviews yet" />}
      <div className="space-y-3">
        {reviews.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">
                {"★".repeat(r.rating)} {r.title}
              </p>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-1 text-sm text-slate-700">{r.body}</p>
            <p className="mt-1 text-xs text-slate-500">
              {r.user.email} · {r.service?.name ?? "Marketplace purchase"} · {fmtDateTime(r.createdAt)} {r.featured && "· featured on home page"}
            </p>
            <div className="mt-3 flex gap-2">
              {r.status !== "APPROVED" && (
                <ActionButton endpoint={`/api/v1/admin/reviews/${r.id}`} body={{ status: "APPROVED" }} className="btn-primary px-3 py-1.5">
                  Approve
                </ActionButton>
              )}
              {!r.featured && (
                <ActionButton endpoint={`/api/v1/admin/reviews/${r.id}`} body={{ status: "APPROVED", featured: true }} className="btn-secondary px-3 py-1.5">
                  Approve & feature
                </ActionButton>
              )}
              {r.status !== "REJECTED" && (
                <ActionButton endpoint={`/api/v1/admin/reviews/${r.id}`} body={{ status: "REJECTED" }} className="btn-ghost px-3 py-1.5">
                  Reject
                </ActionButton>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
