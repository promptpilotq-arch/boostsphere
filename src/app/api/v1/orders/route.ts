import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { idempotent, pageMeta, paginate, route } from "@/server/http";
import { createOrder, createOrderSchema } from "@/server/orders";

export const GET = route(
  async ({ auth, query }) => {
    const { page, pageSize, skip, take } = paginate(query);
    const status = query.get("status") as OrderStatus | null;
    const where = { userId: auth.user.id, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      db.serviceOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: { id: true, number: true, status: true, totalMinor: true, currency: true, createdAt: true, service: { select: { name: true, slug: true } }, package: { select: { name: true } } },
      }),
      db.serviceOrder.count({ where }),
    ]);
    return { items, meta: pageMeta(page, pageSize, total) };
  },
  { auth: "required" },
);

/** Create a PENDING_PAYMENT order. Prices are recalculated on the server; client totals are ignored. */
export const POST = route(
  async (ctx) => {
    const input = await ctx.body(createOrderSchema);
    return idempotent(ctx, "orders.create", input, async () => {
      const order = await createOrder(ctx.auth.user, input);
      return { order: { id: order.id, number: order.number, status: order.status, totalMinor: order.totalMinor, currency: order.currency } };
    });
  },
  { auth: "required", rateLimit: { name: "orders", limit: 30, windowSec: 600, by: "user" } },
);
