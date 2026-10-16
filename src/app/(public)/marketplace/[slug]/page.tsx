import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAuth } from "@/server/auth/current";
import { isStaff } from "@/server/auth/rbac";
import { getListingForViewer } from "@/server/listings-query";
import { getSettings } from "@/server/settings";
import { bps } from "@/lib/money";
import { PlatformIcon } from "@/components/platform-icon";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { ActionButton } from "@/components/client/action-button";
import { Badge, Money, Notice, StatusBadge, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = await getListingForViewer((await params).slug, null);
  return r ? { title: r.listing.title, description: `${r.listing.platform.name} · ${r.listing.niche}` } : { robots: { index: false } };
}

export default async function ListingPage({ params }: { params: Params }) {
  const { slug } = await params;
  const auth = await getAuth();
  const r = await getListingForViewer(slug, auth ? { id: auth.user.id, staff: isStaff(auth.user.roles) } : null);
  if (!r) notFound();
  const { listing: l, isOwner } = r;
  const settings = await getSettings();
  const fee = bps(l.askingPriceMinor, settings.commerce.marketplaceBuyerFeeBps);
  const saved = auth ? await db.savedListing.findUnique({ where: { userId_listingId: { userId: auth.user.id, listingId: l.id } } }) : null;
  const facts: [string, React.ReactNode][] = [
    ["Platform", l.platform.name],
    ["Account type", l.accountType.toLowerCase()],
    ["Niche", l.niche],
    ["Audience", l.audienceSize != null ? `${l.audienceSize.toLocaleString()} ${l.audienceSizeVerified ? "(verified by moderator)" : "(seller-reported, not verified)"}` : "Not stated"],
    ["Account age", l.accountCreatedYear ? `Since ${l.accountCreatedYear} ${l.accountAgeVerified ? "(verified)" : "(seller-reported)"}` : "Not stated"],
    ["Audience location", l.audienceLocation ?? "Not stated"],
    ["Language", l.audienceLanguage ?? "Not stated"],
  ];

  return (
    <div className="container-page py-10">
      <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/marketplace" className="hover:text-slate-800">
          Marketplace
        </Link>{" "}
        / <span className="text-slate-800">{l.title}</span>
      </nav>
      <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <PlatformIcon iconKey={l.platform.iconKey} name={l.platform.name} color={l.platform.brandColor} />
            <StatusBadge status={l.status} label={l.status === "APPROVED" ? "Available" : undefined} />
          </div>
          <h1 className="mt-4 text-3xl font-bold">{l.title}</h1>
          {l.images.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {l.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={`/api/v1/files/${img.storageKey}`} alt={img.alt} className="aspect-video w-full rounded-xl border border-slate-200 object-cover" loading="lazy" />
              ))}
            </div>
          )}
          <dl className="card mt-6 grid gap-4 p-6 sm:grid-cols-2">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="mt-0.5 font-medium capitalize-first">{v}</dd>
              </div>
            ))}
          </dl>
          <section className="prose-body mt-8">
            <h2>Description</h2>
            {l.description.split("\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {l.engagementSummary && (
              <>
                <h2>Performance</h2>
                <p>{l.engagementSummary}</p>
              </>
            )}
            {l.analyticsSummary && (
              <>
                <h2>Historical analytics (redacted)</h2>
                <p>{l.analyticsSummary}</p>
              </>
            )}
            <h2>Transfer method</h2>
            <p>{l.transferMethod}</p>
            {l.platform.transferGuidance && <p className="text-sm">Platform guidance: {l.platform.transferGuidance}</p>}
            <h2>Transfer eligibility</h2>
            <p>
              The seller has confirmed they own this asset and that its transfer is permitted under {l.platform.name}&apos;s terms. Listings for stolen, compromised or non-transferable accounts are prohibited and removed.
            </p>
            <h2>Refunds &amp; disputes</h2>
            <p>
              If the seller does not complete the official transfer steps, or the asset is materially not as described, open a dispute from your purchase page. An administrator reviews evidence from both sides; if resolved in your favour you receive a full refund. See the{" "}
              <Link className="link" href="/legal/refunds">
                Refund Policy
              </Link>
              .
            </p>
          </section>
          <section className="card mt-8 p-6">
            <h2 className="font-semibold">Seller</h2>
            <p className="mt-2 font-medium">
              {l.seller.displayName} {l.seller.verificationStatus === "VERIFIED" && <Badge tone="green">Identity verified</Badge>}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {l.seller.completedSales} completed sale{l.seller.completedSales === 1 ? "" : "s"} · member since {fmtDate(l.seller.createdAt)}
            </p>
            {l.seller.bio && <p className="mt-3 text-sm text-slate-600">{l.seller.bio}</p>}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <p className="text-sm text-slate-500">Asking price</p>
            <Money minor={l.askingPriceMinor} currency={l.currency} className="text-3xl font-bold" />
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Marketplace service fee</dt>
                <dd>
                  <Money minor={fee} currency={l.currency} />
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
                <dt>Total</dt>
                <dd>
                  <Money minor={l.askingPriceMinor + fee} currency={l.currency} />
                </dd>
              </div>
            </dl>
            {l.status !== "APPROVED" ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">This listing is not currently available for purchase.</p>
            ) : isOwner ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">This is your listing.</p>
            ) : !auth ? (
              <Link href={`/login?next=/marketplace/${l.slug}`} className="btn-gradient mt-5 w-full">
                Sign in to buy
              </Link>
            ) : (
              <ApiForm action={`/api/v1/marketplace/listings/${l.id}`} extra={{ action: "purchase" }} idempotent success={{ redirect: "/checkout/purchase/{purchase.id}" }} className="mt-5 space-y-4">
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4" />
                  <span>
                    I understand the transfer happens only through {l.platform.name}&apos;s official tools, that I must never request or accept passwords or login codes, and I accept the{" "}
                    <Link href="/legal/terms" className="link" target="_blank">
                      purchase terms
                    </Link>
                    .
                  </span>
                </label>
                <SubmitButton className="btn-gradient w-full py-3">Buy now</SubmitButton>
                <p className="text-xs text-slate-500">The listing is reserved for you while you complete payment.</p>
              </ApiForm>
            )}
            {auth && !isOwner && (
              <ActionButton endpoint="/api/v1/me/saved-listings" body={{ listingId: l.id, saved: !saved }} className="btn-ghost mt-2 w-full" successMessage={saved ? "Removed from saved" : "Saved"}>
                {saved ? "★ Saved" : "☆ Save listing"}
              </ActionButton>
            )}
          </div>
          <Notice tone="amber" title="Stay safe">
            Never share passwords, recovery codes or 2FA codes with anyone — including the seller or our staff. Report anything suspicious.
          </Notice>
          <details className="card p-5">
            <summary className="cursor-pointer text-sm font-semibold">Report this listing</summary>
            <ApiForm action={`/api/v1/marketplace/listings/${l.id}`} extra={{ action: "report" }} success={{ message: "Thanks — our team will review this report.", reset: true }} className="mt-4 space-y-3">
              <select name="reason" className="input" aria-label="Reason" required>
                <option value="STOLEN_OR_COMPROMISED">Stolen or compromised account</option>
                <option value="PROHIBITED_TRANSFER">Transfer not permitted by the platform</option>
                <option value="MISLEADING">Misleading information</option>
                <option value="FRAUD">Fraud or scam</option>
                <option value="OTHER">Other</option>
              </select>
              <textarea name="details" className="input" rows={3} required minLength={10} placeholder="What did you notice?" aria-label="Details" />
              <SubmitButton className="btn-secondary w-full">Submit report</SubmitButton>
            </ApiForm>
          </details>
        </aside>
      </div>
    </div>
  );
}
