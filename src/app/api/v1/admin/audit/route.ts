import { db } from "@/lib/db";
import { pageMeta, paginate, route } from "@/server/http";

export const GET = route(
  async ({ query }) => {
    const { page, pageSize, skip, take } = paginate(query, { pageSize: 50, max: 200 });
    const where = {
      ...(query.get("action") ? { action: { startsWith: query.get("action")! } } : {}),
      ...(query.get("entityId") ? { entityId: query.get("entityId")! } : {}),
    };
    const [items, total] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { actor: { select: { email: true } } } }),
      db.auditLog.count({ where }),
    ]);
    return { items, meta: pageMeta(page, pageSize, total) };
  },
  { permission: "audit:read" },
);
