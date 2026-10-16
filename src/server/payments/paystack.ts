import { AppError } from "@/lib/errors";
import { hmacHex, safeEqual, sha256 } from "@/lib/crypto";
import type { PaymentProvider, VerifyResult } from "./types";

// Paystack API reference: https://paystack.com/docs/api/
// Amounts are sent in the currency's subunit (kobo for NGN), matching our minor units.
const BASE = "https://api.paystack.co";
const secret = () => process.env.PAYSTACK_SECRET_KEY ?? "";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: unknown };
  if (!res.ok || json.status === false) throw new AppError("PAYMENT_PROVIDER_ERROR", `Paystack: ${json.message ?? res.statusText}`);
  return json.data as T;
}

export const paystack: PaymentProvider = {
  key: "paystack",
  displayName: "Paystack",
  description: "Card, bank transfer, USSD and more (Nigeria)",
  isConfigured: () => secret().startsWith("sk_"),
  supportsCurrency: (c) => ["NGN", "USD", "GHS", "ZAR", "KES"].includes(c),

  async initiate(input) {
    const data = await call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    return { checkoutUrl: data.authorization_url };
  },

  async verify(payment): Promise<VerifyResult> {
    const data = await call<{ status: string; amount: number; currency: string; id: number; fees?: number; gateway_response?: string }>(
      `/transaction/verify/${encodeURIComponent(payment.reference)}`,
    );
    const map: Record<string, VerifyResult["status"]> = { success: "succeeded", failed: "failed", abandoned: "abandoned", reversed: "failed" };
    return {
      status: map[data.status] ?? "pending",
      amountMinor: data.amount,
      currency: data.currency,
      providerReference: String(data.id),
      feeMinor: data.fees ?? undefined,
      rawStatus: data.status,
      failureReason: data.status === "success" ? undefined : data.gateway_response,
    };
  },

  parseWebhook(rawBody, headers) {
    // Paystack signs the raw body with HMAC-SHA512 using the secret key.
    const signature = headers.get("x-paystack-signature") ?? "";
    if (!secret() || !signature) return { valid: false, reason: "missing signature or secret" };
    if (!safeEqual(hmacHex("sha512", secret(), rawBody), signature)) return { valid: false, reason: "bad signature" };
    const evt = JSON.parse(rawBody) as { event: string; data?: { id?: number; reference?: string; status?: string; transaction_reference?: string } };
    const isRefund = evt.event.startsWith("refund.");
    return {
      valid: true,
      eventType: evt.event,
      // Paystack has no event id; the body hash dedupes exact redeliveries.
      eventKey: `${evt.event}:${evt.data?.id ?? ""}:${sha256(rawBody).slice(0, 24)}`,
      reference: (isRefund ? evt.data?.transaction_reference : evt.data?.reference) ?? null,
      kind: evt.event === "charge.success" ? "charge" : isRefund ? "refund" : "other",
      refundId: isRefund ? String(evt.data?.id ?? "") : undefined,
      refundStatus: isRefund ? evt.data?.status : undefined,
    };
  },

  async refund(payment, amountMinor) {
    const data = await call<{ id: number; status: string }>("/refund", {
      method: "POST",
      body: JSON.stringify({ transaction: payment.reference, amount: amountMinor }),
    });
    return { providerRefundId: String(data.id), status: data.status === "processed" ? "succeeded" : "pending" };
  },
};
