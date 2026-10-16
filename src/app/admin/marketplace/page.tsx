import Link from "next/link";
import type { ListingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/server/auth/current";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { Badge, Card, EmptyState, Money, PageHeader, StatusBadge, fmtDateTime } from "@/components/ui";

const TABS: ListingStatus[] = ["PENDING_REVIEW", "APPROVED", "RESERVED", "SUSPENDED", "REJECTED", "SOLD", "DRAFT"];

export default async function AdminListings({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requirePermissionPage("marketplace:moderate");
  const { s } = await searchParams;
  const status = TABS.find((t) => t === s) ?? "PENDING_REVIEW";
  const listings = await db.marketplaceListing.findMany({
    where: { status },
    orderBy: { updatedAt: "asc" },
    take: 50,
    include: { platform: true, seller: { include: { user: { select: { email: true, createdAt: true } } } }, images: true, _count: { select: { reports: true } } },
  });
  return (
    <>
      <PageHeader title="Listing moderation" description="Approve only listings from verified sellers whose transfer is permitted by the platform. Check ownership evidence via support before approving." />
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t} href={`/admin/marketplace?s=${t}`} className={`rounded-full border px-3 py-1.5 text-sm ${t === status ? "border-brand bg-brand/5 text-brand" : "border-slate-200 bg-white"}`}>
            {t.replace("_", " ").toLowerCase()}
          </Link>
        ))}
      </div>
      {listings.length === 0 && <EmptyState title="Nothing in this queue" />}
      <div className="space-y-4">
        {listings.map((l) => (
          <Card key={l.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {l.title} <StatusBadge status={l.status} />
                </p>
                <p className="text-sm text-slate-600">
                  {l.platform.name} · {l.accountType.toLowerCase()} · {l.niche} · <Money minor={l.askingPriceMinor} currency={l.currency} />
                </p>
                <p className="mt-1 text-sm">
                  Seller: {l.seller.displayName} ({l.seller.user.email}) · <StatusBadge status={l.seller.verificationStatus} />
                  {l._count.reports > 0 && (
                    <Badge tone="red" className="ml-2">
                      {l._count.reports} report(s)
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">Updated {fmtDateTime(l.updatedAt)}</p>
              </div>
              <Link href={`/marketplace/${l.slug}`} className="btn-secondary" target="_blank">
                Preview
              </Link>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand">Details</summary>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <p className="whitespace-pre-wrap">{l.description}</p>
                <p>
                  <strong>Transfer method:</strong> {l.transferMethod}
                </p>
                <p>
                  <strong>Audience:</strong> {l.audienceSize?.toLocaleString() ?? "—"} · <strong>Since:</strong> {l.accountCreatedYear ?? "—"} · <strong>Eligibility attested:</strong> {l.transferEligibilityConfirmed ? "yes" : "no"}
                </p>
                {l.analyticsSummary && <p>Analytics: {l.analyticsSummary}</p>}
                <p className="text-xs text-slate-500">{l.images.length} image(s)</p>
              </div>
            </details>
            <ApiForm action="/api/v1/admin/marketplace" extra={{ action: "moderate_listing", listingId: l.id }} success={{ message: "Decision saved" }} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
              <select name="decision" className="input" aria-label="Decision">
                {l.status !== "APPROVED" && <option value="APPROVE">Approve</option>}
                {l.status !== "REJECTED" && <option value="REJECT">Reject</option>}
                {l.status !== "SUSPENDED" && <option value="SUSPEND">Suspend</option>}
              </select>
              <input name="note" placeholder="Note to seller (required when rejecting)" className="input" aria-label="Note" />
              <textarea name="ownershipEvidenceNote" placeholder="Internal: ownership/transfer evidence reviewed (never public)" defaultValue={l.ownershipEvidenceNote ?? ""} rows={2} className="input md:col-span-2" aria-label="Internal evidence note" />
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="audienceSizeVerified" defaultChecked={l.audienceSizeVerified} /> Audience size verified
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="accountAgeVerified" defaultChecked={l.accountAgeVerified} /> Account age verified
                </label>
              </div>
              <div className="md:text-right">
                <SubmitButton>Save decision</SubmitButton>
              </div>
            </ApiForm>
          </Card>
        ))}
      </div>
    </>
  );
}
