import { db } from "@/lib/db";
import { route } from "@/server/http";
import { saveService, serviceSchema } from "@/server/catalog";

export const GET = route(
  async () => ({ items: await db.service.findMany({ orderBy: [{ platform: { sortOrder: "asc" } }, { sortOrder: "asc" }], include: { platform: true, category: true, packages: true, _count: { select: { orders: true } } } }) }),
  { permission: "catalog:manage" },
);

export const POST = route(async ({ auth, body, ip }) => ({ service: await saveService(auth.user, null, await body(serviceSchema), ip) }), { permission: "catalog:manage" });
