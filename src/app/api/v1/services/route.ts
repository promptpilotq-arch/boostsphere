import { route } from "@/server/http";
import { listPublishedPlatforms, searchServices } from "@/server/catalog";

const SORTS = ["relevance", "price_asc", "price_desc", "newest", "name"] as const;

/** Public catalog: published services on published platforms only. */
export const GET = route(async ({ query }) => {
  const sort = SORTS.find((s) => s === query.get("sort")) ?? "relevance";
  const result = await searchServices({
    q: query.get("q")?.slice(0, 100) || undefined,
    platform: query.get("platform") || undefined,
    category: query.get("category") || undefined,
    sort,
    page: Number(query.get("page")) || 1,
    pageSize: Number(query.get("pageSize")) || 12,
  });
  const platforms = await listPublishedPlatforms();
  return {
    items: result.items.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      summary: s.summary,
      platform: { slug: s.platform.slug, name: s.platform.name },
      category: { slug: s.category.slug, name: s.category.name },
      pricingModel: s.pricingModel,
      currency: s.currency,
      fromPriceMinor: s.fromPriceMinor,
      estimatedDuration: s.estimatedDuration,
      featured: s.featured,
    })),
    platforms: platforms.map((p) => ({ slug: p.slug, name: p.name })),
    meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
  };
});
