import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedPlatforms, searchServices } from "@/server/catalog";
import { ServiceCard } from "@/components/cards";
import { EmptyState, PageHeader, Pagination } from "@/components/ui";

export const metadata: Metadata = { title: "Services", description: "Social media promotion, creator marketing, optimization and consulting services across 10 platforms." };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

export default async function ServicesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const sort = (["relevance", "price_asc", "price_desc", "newest", "name"] as const).find((s) => s === sp.sort) ?? "relevance";
  const page = Number(sp.page) || 1;
  const [result, platforms] = await Promise.all([searchServices({ q: sp.q, platform: sp.platform, category: sp.category, sort, page }), listPublishedPlatforms()]);
  const href = (p: number) => `/services?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.platform ? { platform: sp.platform } : {}), ...(sp.category ? { category: sp.category } : {}), sort, page: String(p) })}`;

  return (
    <div className="container-page py-12">
      <PageHeader title="Services" description="Every service runs through authorized channels. Prices include an itemised breakdown at checkout." />
      <form className="card mb-8 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]" role="search" action="/services">
        <label className="sr-only" htmlFor="q">
          Search services
        </label>
        <input id="q" name="q" defaultValue={sp.q} placeholder="Search services…" className="input" />
        <label className="sr-only" htmlFor="platform">
          Platform
        </label>
        <select id="platform" name="platform" defaultValue={sp.platform ?? ""} className="input">
          <option value="">All platforms</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="category">
          Category
        </label>
        <select id="category" name="category" defaultValue={sp.category ?? ""} className="input">
          <option value="">All categories</option>
          <option value="promotion">Promotion &amp; Ads</option>
          <option value="creator-marketing">Creator Marketing</option>
          <option value="optimization">Optimization</option>
          <option value="consulting">Consulting</option>
        </select>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="sort">
            Sort by
          </label>
          <select id="sort" name="sort" defaultValue={sort} className="input">
            <option value="relevance">Relevance</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="newest">Newest</option>
            <option value="name">Name</option>
          </select>
          <button className="btn-primary" type="submit">
            Apply
          </button>
        </div>
      </form>

      <p className="mb-4 text-sm text-slate-600" aria-live="polite">
        {result.total} service{result.total === 1 ? "" : "s"}
      </p>
      {result.items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((s) => (
            <ServiceCard key={s.id} s={s} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No services match your filters"
          description="Try a different search term or platform."
          action={
            <Link href="/services" className="btn-secondary">
              Clear filters
            </Link>
          }
        />
      )}
      <Pagination page={result.page} totalPages={result.totalPages} hrefFor={href} />
    </div>
  );
}
