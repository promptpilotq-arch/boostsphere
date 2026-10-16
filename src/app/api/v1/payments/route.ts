import { z } from "zod";
import { db } from "@/lib/db";
import { idempotent, pageMeta, paginate, route } from "@/server/http";
import { initiatePayment } from "@/server/payments/process";

const initiateSchema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("SERVICE_ORDER"), orderId: z.string().min(1), provider: z.string().min(1) }),
  z.object({ purpose: z.literal("MARKETPLACE_PURCHASE"), purchaseId: z.string().min(1), provider: z.string().min(1) }),
  z.object({ purpose: z.literal("WALLET_DEPOSIT"), amountMinor: z.coerce.number().int().positive(), currency: z.string().length(3).default("NGN"), provider: z.string().min(1) }),
]);

/** The signed-in user's payment history (transaction history / receipts). */
export const GET = route(
  async ({ auth, query }) => {
    const { page, pageSize, skip, take } = paginate(query);
    const where = { userId: auth.user.id };
    const [items, total] = await Promise.all([
      db.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: { id: true, reference: true, provider: true, purpose: true, status: true, amountMinor: true, currency: true, createdAt: true, verifiedAt: true, orderId: true, purchaseId: true },
      }),
      db.payment.count({ where }),
    ]);
    return { items, meta: pageMeta(page, pageSize, total) };
  },
  { auth: "required" },
);

/** Create a pending payment record and start checkout. Returns a redirect URL. */
export const POST = route(
  async (ctx) => {
    const input = await ctx.body(initiateSchema);
    return idempotent(ctx, "payments.initiate", input, async () => {
      const target =
        input.purpose === "SERVICE_ORDER"
          ? { purpose: input.purpose, orderId: input.orderId }
          : input.purpose === "MARKETPLACE_PURCHASE"
            ? { purpose: input.purpose, purchaseId: input.purchaseId }
            : { purpose: input.purpose, amountMinor: input.amountMinor, currency: input.currency };
      return initiatePayment(ctx.auth.user, target, input.provider);
    });
  },
  { auth: "required", rateLimit: { name: "payments", limit: 20, windowSec: 600, by: "user" } },
);
