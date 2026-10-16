import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { pageMeta, paginate, route } from "@/server/http";

export const GET = route(
  async ({ query }) => {
    const { page, pageSize, skip, take } = paginate(query);
    const status = query.get("status") as OrderStatus | null;
    const q = query.get("q");
    const where: Prisma.ServiceOrderWhereInput = {
      ...(status ? { status } : {}),
      ...(query.get("assignee") === "me" ? {} : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      db.serviceOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { service: { select: { name: true } }, user: { select: { email: true } } } }),
      db.serviceOrder.count({ where }),
    ]);
    return { items, meta: pageMeta(page, pageSize, total) };
  },
  { permission: "orders:manage" },
);
