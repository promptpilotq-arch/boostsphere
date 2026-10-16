import { z } from "zod";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { route } from "@/server/http";
import { verifyAndSettle } from "@/server/payments/process";

/**
 * Called after the customer returns from checkout. The redirect itself proves nothing:
 * this endpoint asks the provider server-to-server for the real status.
 */
export const POST = route(
  async ({ auth, body }) => {
    const { reference } = await body(z.object({ reference: z.string().min(4).max(64) }));
    const payment = await db.payment.findUnique({ where: { reference } });
    if (!payment || payment.userId !== auth.user.id) throw notFound("Payment");
    const p = await verifyAndSettle(reference);
    return { payment: { reference: p.reference, status: p.status, purpose: p.purpose, orderId: p.orderId, purchaseId: p.purchaseId, failureReason: p.failureReason } };
  },
  { auth: "required", rateLimit: { name: "payment-verify", limit: 60, windowSec: 600, by: "user" } },
);
