import { AppError } from "@/lib/errors";
import { safeEqual, sha256 } from "@/lib/crypto";
import { minorDigits } from "@/lib/money";
import type { PaymentProvider, VerifyResult } from "./types";

// Flutterwave v3 API: https://developer.flutterwave.com/docs
// Flutterwave amounts are in major units, so we convert at the boundary.
const BASE = "https://api.flutterwave.com/v3";
const secret = () => process.env.FLUTTERWAVE_SECRET_KEY ?? "";
const webhookHash = () => process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "";

const toMajor = (minor: number, c: string) => minor / 10 ** minorDigits(c);
const toMinor = (major: number, c: string) => Math.round(major * 10 ** minorDigits(c));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: unknown };
  if (!res.ok || json.status !== "success") throw new AppError("PAYMENT_PROVIDER_ERROR", `Flutterwave: ${json.message ?? res.statusText}`);
  return json.data as T;
}

export const flutterwave: PaymentProvider = {
  key: "flutterwave",
  displayName: "Flutterwave",
  description: "Cards, bank transfer, mobile money",
  isConfigured: () => secret().length > 10 && webhookHash().length > 0,
  supportsCurrency: (c) => ["NGN", "USD", "GHS", "KES", "ZAR", "GBP", "EUR"].includes(c),

  async initiate(input) {
    const data = await call<{ link: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: toMajor(input.amountMinor, input.currency),
        currency: input.currency,
        redirect_url: input.callbackUrl,
        customer: { email: input.email },
        customizations: { title: input.description },
        meta: input.metadata,
      }),
    });
    return { checkoutUrl: data.link };
  },

  async verify(payment): Promise<VerifyResult> {
    const data = await call<{ id: number; status: string; amount: number; currency: string; app_fee?: number; processor_response?: string }>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(payment.reference)}`,
    );
    const status: VerifyResult["status"] = data.status === "successful" ? "succeeded" : data.status === "failed" ? "failed" : "pending";
    return {
      status,
      amountMinor: toMinor(data.amount, data.currency),
      currency: data.currency,
      providerReference: String(data.id),
      feeMinor: data.app_fee != null ? toMinor(data.app_fee, data.currency) : undefined,
      rawStatus: data.status,
      failureReason: status === "failed" ? data.processor_response : undefined,
    };
  },

  parseWebhook(rawBody, headers) {
    // Flutterwave sends the dashboard-configured secret hash in the verif-hash header.
    const given = headers.get("verif-hash") ?? "";
    if (!webhookHash() || !given || !safeEqual(given, webhookHash())) return { valid: false, reason: "bad verif-hash" };
    const evt = JSON.parse(rawBody) as { event?: string; data?: { id?: number; tx_ref?: string; status?: string } };
    return {
      valid: true,
      eventType: evt.event ?? "unknown",
      eventKey: `${evt.event}:${evt.data?.id ?? ""}:${sha256(rawBody).slice(0, 24)}`,
      reference: evt.data?.tx_ref ?? null,
      kind: evt.event === "charge.completed" ? "charge" : "other",
    };
  },

  async refund(payment, amountMinor) {
    if (!payment.providerReference) throw new AppError("BAD_REQUEST", "Payment has no Flutterwave transaction id");
    const data = await call<{ id: number; status: string }>(`/transactions/${payment.providerReference}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount: toMajor(amountMinor, payment.currency) }),
    });
    return { providerRefundId: String(data.id), status: data.status === "completed" ? "succeeded" : "pending" };
  },
};
