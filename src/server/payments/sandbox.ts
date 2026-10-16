import { db } from "@/lib/db";
import { createHash } from "node:crypto";
import { hmacHex, safeEqual, sha256 } from "@/lib/crypto";
import type { PaymentProvider, VerifyResult } from "./types";

/**
 * DEVELOPMENT-ONLY simulated payment provider.
 *
 * It mimics a real redirect provider end to end — hosted checkout page, signed webhook,
 * server-side verification — so the full payment pipeline can be exercised locally and in tests
 * without credentials. It is hard-disabled when NODE_ENV=production regardless of configuration.
 */
export const sandboxEnabled = () => process.env.PAYMENT_SANDBOX_ENABLED === "true" && process.env.NODE_ENV !== "production";

/** Webhook signing secret derived from the app key so no extra configuration is needed. */
export const sandboxSecret = () => createHash("sha256").update(`sandbox:${process.env.APP_ENCRYPTION_KEY ?? "dev"}`).digest("hex");

export const sandbox: PaymentProvider = {
  key: "sandbox",
  displayName: "Sandbox (test mode)",
  description: "Simulated payments for local development. No money moves.",
  isConfigured: sandboxEnabled,
  supportsCurrency: () => true,

  async initiate(input) {
    await db.sandboxCharge.upsert({
      where: { reference: input.reference },
      create: { reference: input.reference, status: "pending", amountMinor: input.amountMinor, currency: input.currency },
      update: {},
    });
    return { checkoutUrl: `/pay/sandbox/${encodeURIComponent(input.reference)}`, providerReference: `sbx_${input.reference}` };
  },

  async verify(payment): Promise<VerifyResult> {
    const charge = await db.sandboxCharge.findUnique({ where: { reference: payment.reference } });
    if (!charge) return { status: "pending", amountMinor: null, currency: null, rawStatus: "not_found" };
    const status = charge.status === "success" ? "succeeded" : charge.status === "failed" ? "failed" : "pending";
    return {
      status,
      amountMinor: charge.amountMinor,
      currency: charge.currency,
      providerReference: `sbx_${charge.reference}`,
      feeMinor: status === "succeeded" ? Math.round(charge.amountMinor * 0.015) : undefined,
      rawStatus: charge.status,
      failureReason: status === "failed" ? "Simulated decline" : undefined,
    };
  },

  parseWebhook(rawBody, headers) {
    const sig = headers.get("x-sandbox-signature") ?? "";
    if (!sandboxEnabled() || !safeEqual(hmacHex("sha256", sandboxSecret(), rawBody), sig)) return { valid: false, reason: "bad signature" };
    const evt = JSON.parse(rawBody) as { id: string; event: string; reference: string };
    return { valid: true, eventKey: evt.id, eventType: evt.event, reference: evt.reference, kind: "charge" };
  },

  async refund(payment) {
    return { providerRefundId: `sbx_rf_${sha256(payment.reference + Date.now()).slice(0, 12)}`, status: "succeeded" };
  },
};
