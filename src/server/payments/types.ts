import type { Payment } from "@prisma/client";

export type InitiateInput = {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  callbackUrl: string;
  description: string;
  metadata: Record<string, string>;
};

export type InitiateResult = { checkoutUrl: string; providerReference?: string };

export type VerifyResult = {
  status: "succeeded" | "failed" | "pending" | "abandoned";
  amountMinor: number | null;
  currency: string | null;
  providerReference?: string;
  feeMinor?: number;
  rawStatus: string;
  failureReason?: string;
};

export type WebhookParseResult =
  | { valid: false; reason: string }
  | { valid: true; eventKey: string; eventType: string; reference: string | null; kind: "charge" | "refund" | "other"; refundId?: string; refundStatus?: string };

export type RefundResult = { providerRefundId: string; status: "pending" | "succeeded" };

/**
 * Adapter contract for a payment provider. Adapters only talk to the provider; all business
 * state changes happen in ./process.ts after a server-side verification call.
 */
export interface PaymentProvider {
  key: string;
  displayName: string;
  description: string;
  /** Whether credentials are present. Unconfigured providers are never offered at checkout. */
  isConfigured(): boolean;
  supportsCurrency(currency: string): boolean;
  /** Redirect-based checkout. Not used by the wallet provider. */
  initiate?(input: InitiateInput): Promise<InitiateResult>;
  /** Authoritative server-to-server status lookup by our reference. */
  verify?(payment: Payment): Promise<VerifyResult>;
  /** Validate the signature of a raw webhook body and extract identifiers. */
  parseWebhook?(rawBody: string, headers: Headers): WebhookParseResult;
  refund?(payment: Payment, amountMinor: number): Promise<RefundResult>;
}
