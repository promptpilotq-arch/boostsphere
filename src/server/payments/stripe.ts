import { AppError } from "@/lib/errors";
import { hmacHex, safeEqual } from "@/lib/crypto";
import type { PaymentProvider, VerifyResult } from "./types";

// Stripe REST API (no SDK, form-encoded): https://docs.stripe.com/api
// Only enable where your business entity is supported by Stripe. Stripe does not currently onboard
// Nigerian-registered businesses directly; see docs/PAYMENTS.md.
const BASE = "https://api.stripe.com/v1";
const secret = () => process.env.STRIPE_SECRET_KEY ?? "";
const whsec = () => process.env.STRIPE_WEBHOOK_SECRET ?? "";

function form(obj: Record<string, string | number>) {
  return new URLSearchParams(Object.entries(obj).map(([k, v]) => [k, String(v)])).toString();
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new AppError("PAYMENT_PROVIDER_ERROR", `Stripe: ${json.error?.message ?? res.statusText}`);
  return json;
}

type CheckoutSession = { id: string; url: string; payment_status: string; status: string; amount_total: number; currency: string; payment_intent: string | null };

export const stripe: PaymentProvider = {
  key: "stripe",
  displayName: "Stripe",
  description: "International cards",
  isConfigured: () => secret().startsWith("sk_") && whsec().startsWith("whsec_"),
  supportsCurrency: (c) => ["USD", "GBP", "EUR"].includes(c),

  async initiate(input) {
    const s = await call<CheckoutSession>("/checkout/sessions", {
      method: "POST",
      body: form({
        mode: "payment",
        client_reference_id: input.reference,
        customer_email: input.email,
        success_url: `${input.callbackUrl}`,
        cancel_url: `${input.callbackUrl}`,
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": input.amountMinor,
        "line_items[0][price_data][product_data][name]": input.description,
        "metadata[reference]": input.reference,
      }),
    });
    return { checkoutUrl: s.url, providerReference: s.id };
  },

  async verify(payment): Promise<VerifyResult> {
    if (!payment.providerReference) return { status: "pending", amountMinor: null, currency: null, rawStatus: "no_session" };
    const s = await call<CheckoutSession>(`/checkout/sessions/${encodeURIComponent(payment.providerReference)}`);
    return {
      status: s.payment_status === "paid" ? "succeeded" : s.status === "expired" ? "abandoned" : "pending",
      amountMinor: s.amount_total,
      currency: s.currency.toUpperCase(),
      providerReference: s.id,
      rawStatus: `${s.status}/${s.payment_status}`,
    };
  },

  parseWebhook(rawBody, headers) {
    const header = headers.get("stripe-signature") ?? "";
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
    if (!whsec() || !parts.t || !parts.v1) return { valid: false, reason: "missing signature" };
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return { valid: false, reason: "timestamp outside tolerance" };
    if (!safeEqual(hmacHex("sha256", whsec(), `${parts.t}.${rawBody}`), parts.v1)) return { valid: false, reason: "bad signature" };
    const evt = JSON.parse(rawBody) as { id: string; type: string; data?: { object?: { client_reference_id?: string } } };
    return {
      valid: true,
      eventKey: evt.id,
      eventType: evt.type,
      reference: evt.data?.object?.client_reference_id ?? null,
      kind: evt.type.startsWith("checkout.session.") ? "charge" : "other",
    };
  },

  async refund(payment, amountMinor) {
    if (!payment.providerReference) throw new AppError("BAD_REQUEST", "Payment has no Stripe session");
    const s = await call<CheckoutSession>(`/checkout/sessions/${encodeURIComponent(payment.providerReference)}`);
    if (!s.payment_intent) throw new AppError("BAD_REQUEST", "Stripe session has no payment intent");
    const r = await call<{ id: string; status: string }>("/refunds", { method: "POST", body: form({ payment_intent: s.payment_intent, amount: amountMinor }) });
    return { providerRefundId: r.id, status: r.status === "succeeded" ? "succeeded" : "pending" };
  },
};
