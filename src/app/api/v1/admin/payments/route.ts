import type { PaymentStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { pageMeta, paginate, route } from "@/server/http";
import { reconcilePending, verifyAndSettle } from "@/server/payments/process";
import { audit } from "@/server/audit";

export const GET = route(
  async ({ query }) => {
    const { page, pageSize, skip, take } = paginate(query);
    const status = query.get("status") as PaymentStatus | null;
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      db.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { user: { select: { email: true } } } }),
      db.payment.count({ where }),
    ]);
    return { items, meta: pageMeta(page, pageSize, total) };
  },
  { permission: "payments:read" },
);

/** Reconciliation: re-verify one payment, or every stale pending payment, with the provider. */
export const POST = route(
  async ({ auth, body, ip }) => {
    const input = await body(z.object({ reference: z.string().optional(), olderThanMinutes: z.coerce.number().int().min(0).default(15) }));
    await audit({ actorId: auth.user.id, action: "payments.reconcile", entityType: "payment", entityId: input.reference ?? null, ip });
    if (input.reference) {
      const p = await verifyAndSettle(input.reference);
      return { results: [{ reference: p.reference, status: p.status }] };
    }
    return { results: await reconcilePending(input.olderThanMinutes) };
  },
  { permission: "payments:manage" },
);
