import { db } from "@/lib/db";
import { pageMeta, paginate, route } from "@/server/http";

/** Purchases where the user is the buyer or the seller. */
export const GET = route(
  async ({ auth, query }) => {
    const { page, pageSize, skip, take } = paginate(query);
    const where = { OR: [{ buyerId: auth.user.id }, { seller: { userId: auth.user.id } }] };
    const [items, total] = await Promise.all([
      db.purchaseTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: { id: true, number: true, status: true, totalMinor: true, currency: true, createdAt: true, buyerId: true, listing: { select: { title: true, slug: true } } },
      }),
      db.purchaseTransaction.count({ where }),
    ]);
    return { items: items.map((i) => ({ ...i, role: i.buyerId === auth.user.id ? "BUYER" : "SELLER" })), meta: pageMeta(page, pageSize, total) };
  },
  { auth: "required" },
);
