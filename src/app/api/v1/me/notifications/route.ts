import { z } from "zod";
import { db } from "@/lib/db";
import { pageMeta, paginate, route } from "@/server/http";

export const GET = route(
  async ({ auth, query }) => {
    const { page, pageSize, skip, take } = paginate(query);
    const where = { userId: auth.user.id };
    const [items, total, unread] = await Promise.all([
      db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      db.notification.count({ where }),
      db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items, unread, meta: pageMeta(page, pageSize, total) };
  },
  { auth: "required" },
);

export const POST = route(
  async ({ auth, body }) => {
    const { ids } = await body(z.object({ ids: z.array(z.string()).max(200).optional() }));
    await db.notification.updateMany({ where: { userId: auth.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  },
  { auth: "required" },
);
