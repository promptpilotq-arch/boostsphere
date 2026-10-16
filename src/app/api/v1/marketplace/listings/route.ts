import { route } from "@/server/http";
import { searchListings } from "@/server/listings-query";

export const GET = route(async ({ query }) => {
  const num = (k: string) => (query.get(k) ? Number(query.get(k)) : undefined);
  const r = await searchListings({
    q: query.get("q")?.slice(0, 100) || undefined,
    platform: query.get("platform") || undefined,
    type: query.get("type") || undefined,
    sort: query.get("sort") || undefined,
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    page: num("page"),
    pageSize: num("pageSize"),
  });
  return { items: r.items, meta: { page: r.page, pageSize: r.pageSize, total: r.total, totalPages: r.totalPages } };
});
