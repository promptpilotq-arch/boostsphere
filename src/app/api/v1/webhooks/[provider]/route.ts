import { NextResponse } from "next/server";
import { handleWebhook } from "@/server/payments/process";

/**
 * Payment provider webhooks: /api/v1/webhooks/paystack | flutterwave | stripe | sandbox
 * Signature is verified against the RAW body, events are de-duplicated, and the payment is
 * re-verified with the provider API before any state changes. No session/CSRF — the signature is the auth.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await req.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const result = await handleWebhook(provider.toLowerCase(), raw, req.headers);
  return NextResponse.json(result.body, { status: result.status });
}
