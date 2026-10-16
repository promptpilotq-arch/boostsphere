import type { OrderStatus, PurchaseStatus, Refund } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import type { AuthUser } from "./auth/session";
import { audit } from "./audit";
import { notify } from "./notify";
import { transitionOrder } from "./orders";
import { getProvider } from "./payments/registry";
import { creditWallet } from "./wallet";

export const refundRequestSchema = z.object({
  reason: z.string().trim().min(10, "Please describe why you are requesting a refund").max(2000),
});

const REFUNDABLE_ORDER: OrderStatus[] = ["PAYMENT_CONFIRMED", "PROCESSING", "IN_PROGRESS", "AWAITING_CUSTOMER_INFO", "COMPLETED"];

/** Total successfully refunded or in flight against a payment. */
async function committedRefunds(tx: Tx | typeof db, paymentId: string, excludeId?: string) {
  const r = await tx.refund.aggregate({
    where: { paymentId, status: { in: ["APPROVED", "PROCESSING", "SUCCEEDED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    _sum: { amountMinor: true },
  });
  return r._sum.amountMinor ?? 0;
}

export async function requestOrderRefund(user: AuthUser, orderId: string, input: z.infer<typeof refundRequestSchema>) {
  const order = await db.serviceOrder.findUnique({ where: { id: orderId }, include: { service: true, payments: { where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } } } } });
  if (!order || order.userId !== user.id) throw notFound("Order");
  if (!order.service.refundable) throw new AppError("CONFLICT", "This service is not eligible for refunds under its policy. Contact support if you believe there is an error.");
  if (!REFUNDABLE_ORDER.includes(order.status)) throw new AppError("CONFLICT", "This order is not eligible for a refund request");
  const payment = order.payments[0];
  if (!payment) throw new AppError("CONFLICT", "No settled payment found for this order");
  const open = await db.refund.count({ where: { orderId, status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } } });
  if (open) throw new AppError("CONFLICT", "A refund request is already in progress for this order");

  return db.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        orderId,
        paymentId: payment.id,
        requestedById: user.id,
        amountMinor: payment.amountMinor - (await committedRefunds(tx, payment.id)),
        currency: payment.currency,
        reason: input.reason,
        destination: payment.provider === "wallet" ? "WALLET" : "ORIGINAL_METHOD",
        previousStatus: order.status,
      },
    });
    await transitionOrder(tx, orderId, "REFUND_PENDING", { type: "CUSTOMER", id: user.id }, "Refund requested");
    await audit({ actorId: user.id, action: "refund.requested", entityType: "refund", entityId: refund.id }, tx);
    return refund;
  });
}

export const refundDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  amountMinor: z.coerce.number().int().positive().optional(),
  destination: z.enum(["ORIGINAL_METHOD", "WALLET"]).optional(),
  note: z.string().max(2000).default(""),
});

/** Admin decision. Approval issues the refund through the original provider or to the wallet ledger. */
export async function decideRefund(staff: AuthUser, refundId: string, input: z.infer<typeof refundDecisionSchema>, ip?: string) {
  const refund = await db.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
  if (!refund) throw notFound("Refund");
  // FAILED refunds (e.g. provider refund unavailable) can be re-decided, typically to the wallet.
  if (refund.status !== "REQUESTED" && refund.status !== "FAILED") throw new AppError("CONFLICT", "This refund has already been decided");

  if (input.decision === "REJECT") {
    await db.$transaction(async (tx) => {
      await tx.refund.update({ where: { id: refundId }, data: { status: "REJECTED", adminNote: input.note, processedById: staff.id, processedAt: new Date() } });
      await restoreAfterRefund(tx, refund, "rejected");
      await audit({ actorId: staff.id, action: "refund.rejected", entityType: "refund", entityId: refundId, metadata: { note: input.note }, ip }, tx);
    });
    await notify(refund.requestedById, { type: "refund.rejected", title: "Refund request declined", body: input.note || "Your refund request was reviewed and declined.", link: refundLink(refund) });
    return db.refund.findUniqueOrThrow({ where: { id: refundId } });
  }

  if (!refund.payment || refund.payment.status === "REFUNDED") throw new AppError("CONFLICT", "There is no refundable payment for this request");
  const remaining = refund.payment.amountMinor - (await committedRefunds(db, refund.payment.id, refund.id));
  const amount = input.amountMinor ?? refund.amountMinor;
  if (amount > remaining) throw new AppError("VALIDATION_ERROR", `Refund exceeds the refundable balance (${remaining})`);
  const destination = input.destination ?? refund.destination;

  await db.refund.update({ where: { id: refundId }, data: { status: "APPROVED", amountMinor: amount, destination, adminNote: input.note, processedById: staff.id } });
  await audit({ actorId: staff.id, action: "refund.approved", entityType: "refund", entityId: refundId, metadata: { amount, destination }, ip });
  return executeRefund(refundId);
}

/** Carry out an APPROVED refund. */
export async function executeRefund(refundId: string) {
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (refund.status !== "APPROVED") return refund;
  const payment = refund.payment!;

  if (refund.destination === "WALLET") {
    await db.$transaction(async (tx) => {
      await creditWallet(tx, payment.userId, refund.currency, refund.amountMinor, "AVAILABLE", "REFUND", `Refund for payment ${payment.reference}`, `refund:${refund.id}`, { type: "refund", id: refund.id });
      await completeRefund(tx, refund.id);
    });
  } else {
    const provider = getProvider(payment.provider);
    if (!provider?.refund || !provider.isConfigured()) {
      throw new AppError("NOT_CONFIGURED", `Refunds through ${payment.provider} are not configured. Refund to wallet instead, or process it in the provider dashboard and record it.`);
    }
    try {
      const r = await provider.refund(payment, refund.amountMinor);
      await db.refund.update({ where: { id: refund.id }, data: { status: "PROCESSING", providerRefundId: r.providerRefundId } });
      if (r.status === "succeeded") await db.$transaction((tx) => completeRefund(tx, refund.id));
    } catch (e) {
      await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED", adminNote: `${refund.adminNote ?? ""}\nProvider error: ${String(e).slice(0, 300)}`.trim() } });
      throw e;
    }
  }
  const done = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
  if (done.status === "SUCCEEDED") {
    await notify(done.requestedById, { type: "refund.succeeded", title: "Refund issued", body: `Your refund has been issued${done.destination === "WALLET" ? " to your wallet" : " to your original payment method"}.`, link: refundLink(done) });
  }
  return done;
}

/** Called from provider refund webhooks (e.g. Paystack refund.processed). */
export async function applyProviderRefundStatus(providerRefundId: string, status: string) {
  const refund = await db.refund.findFirst({ where: { providerRefundId } });
  if (!refund || refund.status !== "PROCESSING") return;
  if (["processed", "completed", "succeeded"].includes(status)) await db.$transaction((tx) => completeRefund(tx, refund.id));
  else if (["failed"].includes(status)) await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } });
}

/** Admin reconciliation: confirm a PROCESSING provider refund after checking the provider dashboard. */
export async function confirmProcessingRefund(staff: AuthUser, refundId: string, ip?: string) {
  const refund = await db.refund.findUnique({ where: { id: refundId } });
  if (!refund || refund.status !== "PROCESSING") throw new AppError("CONFLICT", "Only processing refunds can be confirmed");
  await db.$transaction(async (tx) => {
    await completeRefund(tx, refundId);
    await audit({ actorId: staff.id, action: "refund.confirmed_manually", entityType: "refund", entityId: refundId, ip }, tx);
  });
}

/** Mark a refund succeeded: journal, payment status, and order/purchase status — once. */
async function completeRefund(tx: Tx, refundId: string) {
  await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${refundId} FOR UPDATE`;
  const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (refund.status === "SUCCEEDED") return;
  await tx.refund.update({ where: { id: refundId }, data: { status: "SUCCEEDED", processedAt: new Date() } });
  await tx.transaction.create({
    data: { type: "REFUND_ISSUED", sourceType: "refund", sourceId: refundId, userId: refund.requestedById, amountMinor: -refund.amountMinor, currency: refund.currency, description: `Refund (${refund.destination.toLowerCase()}) for ${refund.payment?.reference ?? "payment"}` },
  });
  const payment = refund.payment!;
  const refunded = await tx.refund.aggregate({ where: { paymentId: payment.id, status: "SUCCEEDED" }, _sum: { amountMinor: true } });
  const full = (refunded._sum.amountMinor ?? 0) >= payment.amountMinor;
  await tx.payment.update({ where: { id: payment.id }, data: { status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });

  if (refund.orderId) {
    const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id: refund.orderId } });
    if (order.status === "REFUND_PENDING") {
      if (full) await transitionOrder(tx, order.id, "REFUNDED", { type: "SYSTEM" }, "Refund issued");
      else await restoreAfterRefund(tx, refund, "partial");
    }
  }
  if (refund.purchaseId) {
    const p = await tx.purchaseTransaction.findUniqueOrThrow({ where: { id: refund.purchaseId }, include: { seller: true } });
    if (full && p.status !== "REFUNDED") {
      await tx.purchaseTransaction.update({ where: { id: p.id }, data: { status: "REFUNDED", payoutStatus: "NOT_DUE" } });
      // Reverse the seller's held proceeds (PENDING bucket) — they were never released.
      if (p.paidAt && !p.completedAt) {
        await creditWallet(tx, p.seller.userId, p.currency, -p.sellerPayoutMinor, "PENDING", "REVERSAL", `Sale ${p.number} refunded to buyer`, `sale-reversal:${p.id}`, { type: "purchase", id: p.id });
      }
      // Send the listing back through moderation rather than straight back on sale.
      await tx.marketplaceListing.update({ where: { id: p.listingId }, data: { status: "PENDING_REVIEW" } });
    }
  }
}

async function restoreAfterRefund(tx: Tx, refund: Refund, why: "rejected" | "partial") {
  if (refund.orderId && refund.previousStatus) {
    const order = await tx.serviceOrder.findUnique({ where: { id: refund.orderId } });
    if (order?.status === "REFUND_PENDING") {
      await transitionOrder(tx, refund.orderId, refund.previousStatus as OrderStatus, { type: "SYSTEM" }, why === "rejected" ? "Refund request declined" : "Partial refund issued");
    }
  }
  if (refund.purchaseId && refund.previousStatus) {
    const p = await tx.purchaseTransaction.findUnique({ where: { id: refund.purchaseId } });
    if (p?.status === "REFUND_PENDING") await tx.purchaseTransaction.update({ where: { id: p.id }, data: { status: refund.previousStatus as PurchaseStatus } });
  }
}

/** Dispute resolved in the buyer's favour: record and execute a full refund of the purchase. */
export async function refundPurchaseForDispute(staff: AuthUser, purchaseId: string, note: string, ip?: string) {
  const p = await db.purchaseTransaction.findUniqueOrThrow({ where: { id: purchaseId }, include: { payments: { where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } } } } });
  const payment = p.payments[0];
  if (!payment) throw new AppError("CONFLICT", "No settled payment to refund");
  const refund = await db.$transaction(async (tx) => {
    const remaining = payment.amountMinor - (await committedRefunds(tx, payment.id));
    const r = await tx.refund.create({
      data: {
        purchaseId,
        paymentId: payment.id,
        requestedById: p.buyerId,
        amountMinor: remaining,
        currency: payment.currency,
        reason: `Dispute resolved in buyer's favour: ${note}`,
        destination: payment.provider === "wallet" ? "WALLET" : "ORIGINAL_METHOD",
        status: "APPROVED",
        processedById: staff.id,
        previousStatus: p.status,
      },
    });
    await tx.purchaseTransaction.update({ where: { id: purchaseId }, data: { status: "REFUND_PENDING" } });
    await audit({ actorId: staff.id, action: "refund.dispute", entityType: "refund", entityId: r.id, ip }, tx);
    return r;
  });
  try {
    return await executeRefund(refund.id);
  } catch (e) {
    // Provider refund unavailable: leave it APPROVED/FAILED for an admin to finish via wallet or provider dashboard.
    console.error("[refund] dispute refund needs manual completion", e);
    return db.refund.findUniqueOrThrow({ where: { id: refund.id } });
  }
}

function refundLink(r: Pick<Refund, "orderId" | "purchaseId">) {
  return r.orderId ? `/dashboard/orders/${r.orderId}` : r.purchaseId ? `/dashboard/purchases/${r.purchaseId}` : "/dashboard";
}
