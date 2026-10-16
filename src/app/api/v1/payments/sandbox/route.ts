import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { hmacHex, randomToken } from "@/lib/crypto";
import { route } from "@/server/http";
import { handleWebhook } from "@/server/payments/process";
import { sandboxEnabled, sandboxSecret } from "@/server/payments/sandbox";

/**
 * DEVELOPMENT ONLY. Simulates the customer finishing (or failing) payment on the sandbox
 * hosted page, then delivers a signed webhook through the same pipeline real providers use.
 */
export const POST = route(
  async ({ auth, body }) => {
    if (!sandboxEnabled()) throw new AppError("NOT_FOUND", "Not found");
    const { reference, outcome } = await body(z.object({ reference: z.string().min(4), outcome: z.enum(["success", "failed"]) }));
    const payment = await db.payment.findUnique({ where: { reference } });
    if (!payment || payment.userId !== auth.user.id || payment.provider !== "sandbox") throw notFound("Payment");
    await db.sandboxCharge.update({ where: { reference }, data: { status: outcome } });
    const raw = JSON.stringify({ id: `evt_${randomToken(10)}`, event: outcome === "success" ? "charge.success" : "charge.failed", reference });
    const headers = new Headers({ "x-sandbox-signature": hmacHex("sha256", sandboxSecret(), raw) });
    const result = await handleWebhook("sandbox", raw, headers);
    return { webhookStatus: result.status, redirectUrl: `/checkout/return?reference=${reference}` };
  },
  { auth: "required" },
);
