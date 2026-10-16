import type { Payment, PaymentPurpose } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { humanId } from "@/lib/crypto";
import type { AuthUser } from "../auth/session";
import { audit } from "../audit";
import { afterOrderPaid, markOrderPaid } from "../orders";
import { afterPurchasePaid, markPurchasePaid } from "../marketplace";
import { getSettings } from "../settings";
import { notify } from "../notify";
import { creditWallet, spendFromWallet } from "../wallet";
import { availableProviders, getProvider } from "./registry";
import type { VerifyResult } from "./types";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

type Target = { purpose: "SERVICE_ORDER"; orderId: string } | { purpose: "MARKETPLACE_PURCHASE"; purchaseId: string } | { purpose: "WALLET_DEPOSIT"; amountMinor: number; currency: string };

async function resolveTarget(user: AuthUser, target: Target) {
  if (target.purpose === "SERVICE_ORDER") {
    const order = await db.serviceOrder.findUnique({ where: { id: target.orderId }, include: { service: true } });
    if (!order || order.userId !== user.id) throw notFound("Order");
    if (order.status !== "PENDING_PAYMENT") throw new AppError("CONFLICT", "This order is not awaiting payment");
    return { amountMinor: order.totalMinor, currency: order.currency, description: `${order.service.name} (${order.number})`, orderId: order.id, purchaseId: null, allowWallet: true };
  }
  if (target.purpose === "MARKETPLACE_PURCHASE") {
    const p = await db.purchaseTransaction.findUnique({ where: { id: target.purchaseId }, include: { listing: true } });
    if (!p || p.buyerId !== user.id) throw notFound("Purchase");
    if (p.status !== "PENDING_PAYMENT") throw new AppError("CONFLICT", "This purchase is not awaiting payment");
    return { amountMinor: p.totalMinor, currency: p.currency, description: `${p.listing.title} (${p.number})`, orderId: null, purchaseId: p.id, allowWallet: true };
  }
  if (!Number.isInteger(target.amountMinor) || target.amountMinor < 10000) throw new AppError("VALIDATION_ERROR", "Minimum deposit is 100.00");
  if (target.amountMinor > 500_000_000) throw new AppError("VALIDATION_ERROR", "Deposit exceeds the maximum allowed");
  // Funding a wallet from the wallet makes no sense.
  return { amountMinor: target.amountMinor, currency: target.currency, description: "Wallet deposit", orderId: null, purchaseId: null, allowWallet: false };
}

/**
 * Create a PENDING payment record, then start checkout with the chosen provider.
 * The order/purchase stays unpaid until processVerification() sees a verified success.
 */
export async function initiatePayment(user: AuthUser, target: Target, providerKey: string) {
  const settings = await getSettings();
  const t = await resolveTarget(user, target);
  const provider = availableProviders(t.currency, { walletEnabled: settings.features.walletEnabled, allowWallet: t.allowWallet }).find((p) => p.key === providerKey);
  if (!provider) throw new AppError("VALIDATION_ERROR", "That payment method is not available for this currency");

  // Supersede any earlier pending attempt for the same target so only one can settle it.
  await db.payment.updateMany({
    where: { status: "PENDING", ...(t.orderId ? { orderId: t.orderId } : t.purchaseId ? { purchaseId: t.purchaseId } : { id: "__none__" }) },
    data: { status: "ABANDONED", failureReason: "Superseded by a new payment attempt" },
  });

  const payment = await db.payment.create({
    data: {
      reference: humanId("PAY", 12),
      provider: provider.key,
      purpose: target.purpose as PaymentPurpose,
      userId: user.id,
      orderId: t.orderId,
      purchaseId: t.purchaseId,
      amountMinor: t.amountMinor,
      currency: t.currency,
    },
  });
  await audit({ actorId: user.id, action: "payment.initiated", entityType: "payment", entityId: payment.id, metadata: { provider: provider.key, amountMinor: t.amountMinor, currency: t.currency } });

  if (provider.key === "wallet") {
    const result = await payWithWallet(payment);
    return { paymentId: payment.id, reference: payment.reference, status: result.status, redirectUrl: `/checkout/return?reference=${payment.reference}` };
  }

  if (!provider.initiate) throw new AppError("NOT_CONFIGURED", "Provider does not support checkout");
  try {
    const init = await provider.initiate({
      reference: payment.reference,
      amountMinor: t.amountMinor,
      currency: t.currency,
      email: user.email,
      callbackUrl: `${appUrl()}/checkout/return?reference=${payment.reference}`,
      description: t.description,
      metadata: { paymentId: payment.id, purpose: target.purpose },
    });
    await db.payment.update({ where: { id: payment.id }, data: { checkoutUrl: init.checkoutUrl, providerReference: init.providerReference ?? null } });
    return { paymentId: payment.id, reference: payment.reference, status: "PENDING", redirectUrl: init.checkoutUrl };
  } catch (e) {
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: e instanceof Error ? e.message.slice(0, 300) : "Initiation failed" } });
    throw e;
  }
}

/** Wallet payment: debit the ledger and settle in one database transaction. */
async function payWithWallet(payment: Payment) {
  const post = await db.$transaction(async (tx) => {
    await spendFromWallet(tx, payment.userId, payment.currency, payment.amountMinor, { type: "payment", id: payment.id }, `Payment ${payment.reference}`);
    return settle(tx, payment.id, { status: "succeeded", amountMinor: payment.amountMinor, currency: payment.currency, rawStatus: "wallet_debit", providerReference: `wallet_${payment.id}` });
  });
  await runAfterEffects(post);
  return { status: post.status };
}

type SettleOutcome = { status: Payment["status"]; changed: boolean; effects: { kind: "order" | "purchase"; id: string } | null; payment: Payment };

/**
 * Apply a provider verification result to a payment. Idempotent: the payment row is locked and
 * a payment that is already SUCCEEDED is never processed again, so duplicate webhooks and
 * concurrent callback/webhook races settle exactly once.
 */
async function settle(tx: Tx, paymentId: string, v: VerifyResult): Promise<SettleOutcome> {
  await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

  if (payment.status !== "PENDING" && payment.status !== "ABANDONED" && payment.status !== "FAILED") {
    return { status: payment.status, changed: false, effects: null, payment };
  }

  if (v.status === "pending") {
    await tx.payment.update({ where: { id: paymentId }, data: { rawStatus: v.rawStatus } });
    return { status: payment.status, changed: false, effects: null, payment };
  }

  if (v.status !== "succeeded") {
    if (payment.status !== "PENDING") return { status: payment.status, changed: false, effects: null, payment };
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { status: v.status === "abandoned" ? "ABANDONED" : "FAILED", rawStatus: v.rawStatus, failureReason: v.failureReason ?? v.rawStatus, verifiedAt: new Date() },
    });
    await audit({ action: "payment.failed", entityType: "payment", entityId: paymentId, metadata: { rawStatus: v.rawStatus } }, tx);
    return { status: updated.status, changed: true, effects: null, payment: updated };
  }

  // Success claimed by the provider: amount and currency must match exactly what we charged.
  if (v.amountMinor !== payment.amountMinor || (v.currency ?? "").toUpperCase() !== payment.currency) {
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED", rawStatus: v.rawStatus, failureReason: `Amount/currency mismatch: got ${v.amountMinor} ${v.currency}`, verifiedAt: new Date() },
    });
    await audit({ action: "payment.mismatch", entityType: "payment", entityId: paymentId, metadata: { expected: payment.amountMinor, got: v.amountMinor, currency: v.currency } }, tx);
    return { status: updated.status, changed: true, effects: null, payment: updated };
  }

  const updated = await tx.payment.update({
    where: { id: paymentId },
    data: { status: "SUCCEEDED", rawStatus: v.rawStatus, providerReference: v.providerReference ?? payment.providerReference, providerFeeMinor: v.feeMinor ?? null, verifiedAt: new Date(), failureReason: null },
  });
  // Journal lines are unique per (source, type): a second attempt would violate the constraint.
  await tx.transaction.create({
    data: { type: "PAYMENT_RECEIVED", sourceType: "payment", sourceId: paymentId, userId: payment.userId, amountMinor: payment.amountMinor, currency: payment.currency, description: `Payment ${payment.reference} via ${payment.provider}` },
  });
  if (v.feeMinor) {
    await tx.transaction.create({
      data: { type: "PROVIDER_FEE", sourceType: "payment", sourceId: paymentId, amountMinor: -v.feeMinor, currency: payment.currency, description: `${payment.provider} fee for ${payment.reference}` },
    });
  }
  await audit({ action: "payment.succeeded", entityType: "payment", entityId: paymentId, metadata: { provider: payment.provider } }, tx);

  let effects: SettleOutcome["effects"] = null;
  if (payment.purpose === "SERVICE_ORDER" && payment.orderId) {
    const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id: payment.orderId } });
    if (order.status === "PENDING_PAYMENT") {
      await markOrderPaid(tx, order.id, paymentId);
      effects = { kind: "order", id: order.id };
    } else {
      await flagLatePayment(tx, updated, `Order ${order.number} was ${order.status} when payment arrived`);
    }
  } else if (payment.purpose === "MARKETPLACE_PURCHASE" && payment.purchaseId) {
    const p = await tx.purchaseTransaction.findUniqueOrThrow({ where: { id: payment.purchaseId } });
    if (p.status === "PENDING_PAYMENT") {
      await markPurchasePaid(tx, p.id, paymentId);
      effects = { kind: "purchase", id: p.id };
    } else {
      await flagLatePayment(tx, updated, `Purchase ${p.number} was ${p.status} when payment arrived`);
    }
  } else if (payment.purpose === "WALLET_DEPOSIT") {
    await creditWallet(tx, payment.userId, payment.currency, payment.amountMinor, "AVAILABLE", "DEPOSIT", `Deposit ${payment.reference}`, `deposit:${paymentId}`, { type: "payment", id: paymentId });
  }
  return { status: "SUCCEEDED", changed: true, effects, payment: updated };
}

/** Money arrived for something that can no longer be fulfilled (e.g. cancelled). Queue a refund for review. */
async function flagLatePayment(tx: Tx, payment: Payment, reason: string) {
  await tx.refund.create({
    data: {
      orderId: payment.orderId,
      purchaseId: payment.purchaseId,
      paymentId: payment.id,
      requestedById: payment.userId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      reason: `Automatic: ${reason}. Payment must be returned.`,
      destination: "ORIGINAL_METHOD",
      status: "REQUESTED",
    },
  });
  await audit({ action: "payment.late", entityType: "payment", entityId: payment.id, metadata: { reason } }, tx);
}

async function runAfterEffects(outcome: SettleOutcome) {
  if (!outcome.changed) return;
  if (outcome.effects?.kind === "order") await afterOrderPaid(outcome.effects.id);
  if (outcome.effects?.kind === "purchase") await afterPurchasePaid(outcome.effects.id);
  if (outcome.status === "FAILED" || outcome.status === "ABANDONED") {
    await notify(outcome.payment.userId, {
      type: "payment.failed",
      title: "Payment not completed",
      body: `Payment ${outcome.payment.reference} was not successful. You have not been charged for this attempt. You can retry from your dashboard.`,
      link: outcome.payment.orderId ? `/dashboard/orders/${outcome.payment.orderId}` : outcome.payment.purchaseId ? `/dashboard/purchases/${outcome.payment.purchaseId}` : "/dashboard/wallet",
      email: false,
    });
  }
  if (outcome.status === "SUCCEEDED" && outcome.payment.purpose === "WALLET_DEPOSIT") {
    await notify(outcome.payment.userId, { type: "wallet.deposit", title: "Wallet deposit received", body: `Deposit ${outcome.payment.reference} has been added to your wallet.`, link: "/dashboard/wallet" });
  }
}

/** Ask the provider (server to server) for the authoritative status and apply it. */
export async function verifyAndSettle(reference: string) {
  const payment = await db.payment.findUnique({ where: { reference } });
  if (!payment) throw notFound("Payment");
  if (payment.status === "SUCCEEDED" || payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED") return payment;
  const provider = getProvider(payment.provider);
  if (!provider?.verify || !provider.isConfigured()) return payment;
  const result = await provider.verify(payment);
  const outcome = await db.$transaction((tx) => settle(tx, payment.id, result));
  await runAfterEffects(outcome);
  return outcome.payment;
}

/**
 * Webhook entry point. 1) verify signature 2) dedupe by event key 3) re-verify with the provider
 * API rather than trusting the webhook body 4) settle idempotently.
 */
export async function handleWebhook(providerKey: string, rawBody: string, headers: Headers): Promise<{ status: number; body: Record<string, unknown> }> {
  const provider = getProvider(providerKey);
  if (!provider?.parseWebhook || !provider.isConfigured()) return { status: 404, body: { error: "unknown provider" } };
  let parsed;
  try {
    parsed = provider.parseWebhook(rawBody, headers);
  } catch {
    return { status: 400, body: { error: "malformed payload" } };
  }
  if (!parsed.valid) {
    await audit({ action: "webhook.rejected", entityType: "webhook", metadata: { provider: providerKey, reason: parsed.reason } });
    return { status: 401, body: { error: "invalid signature" } };
  }

  try {
    await db.paymentWebhookEvent.create({ data: { provider: providerKey, eventKey: parsed.eventKey, eventType: parsed.eventType, reference: parsed.reference } });
  } catch {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    if (parsed.kind === "charge" && parsed.reference) {
      await verifyAndSettle(parsed.reference);
    } else if (parsed.kind === "refund" && parsed.refundId) {
      const { applyProviderRefundStatus } = await import("../refunds");
      await applyProviderRefundStatus(parsed.refundId, parsed.refundStatus ?? "");
    }
    await db.paymentWebhookEvent.update({ where: { provider_eventKey: { provider: providerKey, eventKey: parsed.eventKey } }, data: { processed: true } });
    return { status: 200, body: { received: true } };
  } catch (e) {
    await db.paymentWebhookEvent.update({ where: { provider_eventKey: { provider: providerKey, eventKey: parsed.eventKey } }, data: { error: String(e).slice(0, 500) } });
    // Remove the dedupe row so the provider's retry is processed.
    await db.paymentWebhookEvent.delete({ where: { provider_eventKey: { provider: providerKey, eventKey: parsed.eventKey } } }).catch(() => {});
    return { status: 500, body: { error: "processing failed" } };
  }
}

/** Reconciliation: re-verify every pending payment older than `minutes` with its provider. */
export async function reconcilePending(minutes = 15) {
  const pending = await db.payment.findMany({ where: { status: "PENDING", provider: { not: "wallet" }, createdAt: { lt: new Date(Date.now() - minutes * 60_000) } }, take: 200 });
  const results: { reference: string; status: string; error?: string }[] = [];
  for (const p of pending) {
    try {
      const r = await verifyAndSettle(p.reference);
      results.push({ reference: p.reference, status: r.status });
    } catch (e) {
      results.push({ reference: p.reference, status: p.status, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
