import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { searchListings } from "@/server/listings-query";
import { getSettings } from "@/server/settings";
import { ListingCard } from "@/components/cards";
import { EmptyState, Notice, PageHeader, Pagination } from "@/components/ui";

export const metadata: Metadata = { title: "Marketplace", description: "Moderated listings of digital assets whose transfer is permitted by the platform, from verified sellers." };
export const dynamic = "force-dynamic";

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  if (!settings.features.marketplaceEnabled) {
    return (
      <div className="container-page py-16">
        <EmptyState title="The marketplace is currently closed" description="Please check back later." />
      </div>
    );
  }
  const page = Number(sp.page) || 1;
  const toMinor = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) * 100 : undefined);
  const [r, platforms] = await Promise.all([
    searchListings({ q: sp.q, platform: sp.platform, type: sp.type, sort: sp.sort, minPrice: toMinor(sp.min), maxPrice: toMinor(sp.max), page }),
    db.socialPlatform.findMany({ where: { status: "PUBLISHED", marketplaceEnabled: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const qs = (p: number) => `/marketplace?${new URLSearchParams(Object.fromEntries(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v)) as Record<string, string>)}`;

  return (
    <div className="container-page py-12">
      <PageHeader
        title="Marketplace"
        description="Digital assets from verified sellers, transferable through the platform's own official tools. Every listing is moderated before it appears here."
        actions={
          <Link href="/dashboard/selling" className="btn-secondary">
            Sell an asset
          </Link>
        }
      />
      <div className="mb-6">
        <Notice tone="blue" title="How buyer funds are handled">
          Your payment is collected by {settings.brand.name}, and the seller&apos;s proceeds are held on the platform until each transfer step is verified. This is a platform settlement hold — it is <strong>not</strong> a licensed escrow service. Disputes are reviewed by our team. Only platforms that permit ownership transfer are listed:{" "}
          {platforms.map((p) => p.name).join(", ") || "none yet"}.
        </Notice>
      </div>
      <form className="card mb-8 grid gap-3 p-4 md:grid-cols-6" role="search" action="/marketplace">
        <input aria-label="Search" name="q" defaultValue={sp.q} placeholder="Search niche or title…" className="input md:col-span-2" />
        <select aria-label="Platform" name="platform" defaultValue={sp.platform ?? ""} className="input">
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <select aria-label="Account type" name="type" defaultValue={sp.type ?? ""} className="input">
          <option value="">All types</option>
          <option value="CREATOR">Creator</option>
          <option value="BUSINESS">Business</option>
          <option value="BRAND">Brand</option>
          <option value="COMMUNITY">Community</option>
          <option value="OTHER">Other</option>
        </select>
        <select aria-label="Sort" name="sort" defaultValue={sp.sort ?? ""} className="input">
          <option value="">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="audience">Largest audience</option>
        </select>
        <button className="btn-primary" type="submit">
          Filter
        </button>
      </form>

      {r.items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {r.items.map((l) => (
            <ListingCard key={l.id} l={l} />
          ))}
        </div>
      ) : (
        <EmptyState title="No listings match" description="Try different filters, or check back as new listings are approved." />
      )}
      <Pagination page={r.page} totalPages={r.totalPages} hrefFor={qs} />
    </div>
  );
}
