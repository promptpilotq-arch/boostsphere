import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Card, EmptyState, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

export default async function AdminReports() {
  await requirePermissionPage("marketplace:moderate");
  const reports = await db.listingReport.findMany({ orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 100, include: { listing: { select: { title: true, slug: true, status: true } } } });
  return (
    <>
      <PageHeader title="Reported listings" description="Fraud and policy reports from users. Suspend first if a listing may involve a stolen or compromised account." />
      {reports.length === 0 && <EmptyState title="No reports" />}
      <div className="space-y-4">
        {reports.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">
                {r.reason.replace(/_/g, " ").toLowerCase()} ·{" "}
                <Link href={`/marketplace/${r.listing.slug}`} className="link" target="_blank">
                  {r.listing.title}
                </Link>{" "}
                <StatusBadge status={r.listing.status} />
              </p>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-2 text-sm text-slate-700">{r.details}</p>
            <p className="text-xs text-slate-500">{fmtDateTime(r.createdAt)}</p>
            {r.status === "OPEN" ? (
              <ApiForm action="/api/v1/admin/marketplace" extra={{ action: "resolve_report", reportId: r.id }} success={{ message: "Report resolved" }} className="mt-3 flex flex-wrap items-center gap-2">
                <select name="outcome" className="input max-w-[160px]" aria-label="Outcome">
                  <option value="ACTIONED">Actioned</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
                <input name="resolution" required minLength={3} className="input max-w-md" placeholder="Resolution" aria-label="Resolution" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="suspendListing" /> Suspend listing
                </label>
                <SubmitButton>Save</SubmitButton>
              </ApiForm>
            ) : (
              <p className="mt-2 text-sm">Resolution: {r.resolution}</p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
