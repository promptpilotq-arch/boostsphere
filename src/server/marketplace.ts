import type { MarketplaceListing, PurchaseStatus } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { humanId, randomToken } from "@/lib/crypto";
import { bps } from "@/lib/money";
import { isStaff } from "./auth/rbac";
import type { AuthUser } from "./auth/session";
import { audit } from "./audit";
import { notify, notifyStaff } from "./notify";
import { getSettings } from "./settings";
import { creditWallet, moveBetweenBuckets } from "./wallet";

// ───────────── Listings ─────────────

const SECRET_PATTERN = /(password|passcode|recovery code|backup code|2fa|otp|session cookie|auth token)\s*[:=]/i;

const noSecrets = (field: string) => (v: string | undefined | null) => !v || !SECRET_PATTERN.test(v) || `${field} appears to contain credentials. Never include passwords, codes or session data.`;

export const listingInputSchema = z
  .object({
    platformId: z.string().min(1),
    title: z.string().trim().min(8).max(120),
    accountType: z.enum(["CREATOR", "BUSINESS", "BRAND", "COMMUNITY", "OTHER"]),
    description: z.string().trim().min(40).max(5000),
    niche: z.string().trim().min(2).max(60),
    askingPriceMinor: z.coerce.number().int().min(100).max(10_000_000_000),
    currency: z.string().length(3).default("NGN"),
    audienceSize: z.coerce.number().int().min(0).optional().nullable(),
    engagementSummary: z.string().max(1000).optional().nullable(),
    accountCreatedYear: z.coerce.number().int().min(2004).max(new Date().getFullYear()).optional().nullable(),
    audienceLocation: z.string().max(120).optional().nullable(),
    audienceLanguage: z.string().max(60).optional().nullable(),
    analyticsSummary: z.string().max(3000).optional().nullable(),
    transferMethod: z.string().trim().min(20).max(2000),
    transferEligibilityConfirmed: z.literal(true, {
      errorMap: () => ({ message: "Confirm that you own this asset and that its transfer is permitted by the platform" }),
    }),
  })
  .superRefine((v, ctx) => {
    for (const k of ["description", "analyticsSummary", "transferMethod", "engagementSummary"] as const) {
      const r = noSecrets(k)(v[k]);
      if (r !== true) ctx.addIssue({ code: "custom", path: [k], message: r });
    }
  });

/** Fields safe for public display. Moderation notes and internal evidence are never exposed. */
export function publicListing<T extends MarketplaceListing>(l: T) {
  const { ownershipEvidenceNote: _a, moderationNote: _b, reviewedById: _c, ...rest } = l;
  return rest;
}

async function sellerFor(user: AuthUser) {
  const seller = await db.sellerProfile.findUnique({ where: { userId: user.id } });
  if (!seller) throw new AppError("FORBIDDEN", "Create a seller profile first");
  return seller;
}

export async function upsertSellerProfile(user: AuthUser, input: { displayName: string; bio: string }) {
  const profile = await db.sellerProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, displayName: input.displayName, bio: input.bio },
    update: { displayName: input.displayName, bio: input.bio },
  });
  const sellerRole = await db.role.findUnique({ where: { key: "SELLER" } });
  if (sellerRole) await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: sellerRole.id } }, create: { userId: user.id, roleId: sellerRole.id }, update: {} });
  return profile;
}

export async function requestSellerVerification(user: AuthUser, statement: string) {
  const seller = await sellerFor(user);
  if (seller.verificationStatus === "VERIFIED") throw new AppError("CONFLICT", "You are already verified");
  const updated = await db.sellerProfile.update({
    where: { id: seller.id },
    data: { verificationStatus: "PENDING", verificationSubmittedAt: new Date(), verificationNote: statement },
  });
  await notifyStaff({ type: "seller.verification", title: "Seller verification requested", body: `${seller.displayName} requested verification.`, link: "/admin/sellers" });
  return updated;
}

export async function verifySeller(staff: AuthUser, sellerId: string, decision: "VERIFIED" | "REJECTED", note: string, ip?: string) {
  const seller = await db.sellerProfile.update({
    where: { id: sellerId },
    data: { verificationStatus: decision, verificationNote: note, verifiedAt: decision === "VERIFIED" ? new Date() : null },
  });
  await audit({ actorId: staff.id, action: `seller.${decision.toLowerCase()}`, entityType: "seller", entityId: sellerId, metadata: { note }, ip });
  await notify(seller.userId, {
    type: "seller.verification",
    title: decision === "VERIFIED" ? "Your seller profile is verified" : "Seller verification was not approved",
    body: note || (decision === "VERIFIED" ? "You can now submit listings for review." : "Contact support for details."),
    link: "/dashboard/selling",
  });
  return seller;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function createListing(user: AuthUser, input: z.infer<typeof listingInputSchema>) {
  const seller = await sellerFor(user);
  const platform = await db.socialPlatform.findUnique({ where: { id: input.platformId } });
  if (!platform || !platform.marketplaceEnabled) throw new AppError("VALIDATION_ERROR", "The marketplace is not open for this platform");
  const { transferEligibilityConfirmed, ...data } = input;
  return db.marketplaceListing.create({
    data: { ...data, transferEligibilityConfirmed, sellerId: seller.id, slug: `${slugify(input.title)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "")}`, status: "DRAFT" },
  });
}

async function ownListing(user: AuthUser, listingId: string) {
  const seller = await sellerFor(user);
  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.sellerId !== seller.id) throw notFound("Listing");
  return { seller, listing };
}

export async function updateListing(user: AuthUser, listingId: string, input: z.infer<typeof listingInputSchema>) {
  const { listing } = await ownListing(user, listingId);
  if (["RESERVED", "SOLD", "SUSPENDED"].includes(listing.status)) throw new AppError("CONFLICT", "This listing can no longer be edited");
  const { transferEligibilityConfirmed, ...data } = input;
  // Any edit to an approved listing sends it back through moderation; verified flags reset.
  return db.marketplaceListing.update({
    where: { id: listingId },
    data: {
      ...data,
      transferEligibilityConfirmed,
      status: listing.status === "APPROVED" ? "PENDING_REVIEW" : listing.status,
      audienceSizeVerified: false,
      accountAgeVerified: false,
    },
  });
}

export async function submitListing(user: AuthUser, listingId: string) {
  const { listing, seller } = await ownListing(user, listingId);
  if (!["DRAFT", "REJECTED", "WITHDRAWN"].includes(listing.status)) throw new AppError("CONFLICT", "Listing is not in a submittable state");
  const updated = await db.marketplaceListing.update({ where: { id: listingId }, data: { status: "PENDING_REVIEW" } });
  await notifyStaff({ type: "listing.review", title: "Listing awaiting review", body: `${seller.displayName}: ${listing.title}`, link: "/admin/marketplace" });
  return updated;
}

export async function withdrawListing(user: AuthUser, listingId: string) {
  const { listing } = await ownListing(user, listingId);
  if (["RESERVED", "SOLD"].includes(listing.status)) throw new AppError("CONFLICT", "A purchase is in progress for this listing");
  return db.marketplaceListing.update({ where: { id: listingId }, data: { status: "WITHDRAWN" } });
}

export const moderationSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "SUSPEND"]),
  note: z.string().max(2000).default(""),
  audienceSizeVerified: z.boolean().optional(),
  accountAgeVerified: z.boolean().optional(),
  ownershipEvidenceNote: z.string().max(2000).optional(),
});

export async function moderateListing(staff: AuthUser, listingId: string, input: z.infer<typeof moderationSchema>, ip?: string) {
  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId }, include: { seller: true } });
  if (!listing) throw notFound("Listing");
  if (input.decision === "APPROVE") {
    if (listing.seller.verificationStatus !== "VERIFIED") throw new AppError("CONFLICT", "The seller must be verified before a listing can be approved");
    if (!listing.transferEligibilityConfirmed) throw new AppError("CONFLICT", "Seller has not confirmed transfer eligibility");
    if (!["PENDING_REVIEW", "SUSPENDED"].includes(listing.status)) throw new AppError("CONFLICT", "Only listings pending review or suspended can be approved");
  }
  if (input.decision === "SUSPEND" && listing.status === "SOLD") throw new AppError("CONFLICT", "Sold listings cannot be suspended");
  const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "SUSPENDED";
  const updated = await db.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status,
      moderationNote: input.note,
      reviewedById: staff.id,
      reviewedAt: new Date(),
      ...(input.audienceSizeVerified !== undefined ? { audienceSizeVerified: input.audienceSizeVerified } : {}),
      ...(input.accountAgeVerified !== undefined ? { accountAgeVerified: input.accountAgeVerified } : {}),
      ...(input.ownershipEvidenceNote !== undefined ? { ownershipEvidenceNote: input.ownershipEvidenceNote } : {}),
    },
  });
  await audit({ actorId: staff.id, action: `listing.${status.toLowerCase()}`, entityType: "listing", entityId: listingId, metadata: { note: input.note }, ip });
  await notify(listing.seller.userId, {
    type: "listing.moderation",
    title: `Listing ${status.toLowerCase()}: ${listing.title}`,
    body: input.note || `Your listing is now ${status.toLowerCase()}.`,
    link: "/dashboard/selling",
  });
  return updated;
}

export const reportSchema = z.object({
  reason: z.enum(["STOLEN_OR_COMPROMISED", "MISLEADING", "PROHIBITED_TRANSFER", "FRAUD", "OTHER"]),
  details: z.string().trim().min(10).max(2000),
});

export async function reportListing(reporterId: string | null, listingId: string, input: z.infer<typeof reportSchema>) {
  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) throw notFound("Listing");
  const report = await db.listingReport.create({ data: { listingId, reporterId, ...input } });
  await notifyStaff({ type: "listing.report", title: "Listing reported", body: `${input.reason}: ${listing.title}`, link: "/admin/reports" });
  return report;
}

export async function resolveReport(staff: AuthUser, reportId: string, action: "ACTIONED" | "DISMISSED", resolution: string, suspendListing: boolean, ip?: string) {
  const report = await db.listingReport.update({ where: { id: reportId }, data: { status: action, resolution, resolvedAt: new Date() } });
  if (suspendListing) {
    await moderateListing(staff, report.listingId, { decision: "SUSPEND", note: `Suspended following a report: ${resolution}` }, ip);
  }
  await audit({ actorId: staff.id, action: `report.${action.toLowerCase()}`, entityType: "listing_report", entityId: reportId, metadata: { resolution, suspendListing }, ip });
  return report;
}

// ───────────── Purchases ─────────────

/** Default authorized-transfer checklist. Each step is evidenced by one party and confirmed by the other. */
const MILESTONE_TEMPLATE = [
  {
    title: "Seller starts the official transfer",
    description:
      "Seller initiates the platform's own ownership or admin-role transfer for the buyer (for example, adding the buyer as an owner/admin through the platform's role management). Never share passwords or login codes.",
    responsible: "SELLER",
    confirmer: "BUYER",
  },
  {
    title: "Buyer confirms access through official roles",
    description: "Buyer confirms they have accepted the transfer and hold full ownership/admin rights granted by the platform.",
    responsible: "BUYER",
    confirmer: "SELLER",
  },
  {
    title: "Seller hands over linked assets and removes own access",
    description: "Seller removes their own roles and transfers any linked assets (contact email, business details) using the platform's official settings.",
    responsible: "SELLER",
    confirmer: "BUYER",
  },
  {
    title: "Final verification",
    description: "Buyer confirms the transfer is complete. An administrator reviews the evidence and closes the transaction.",
    responsible: "BUYER",
    confirmer: "ADMIN",
  },
] as const;

export async function startPurchase(buyer: AuthUser, listingId: string) {
  if (buyer.status !== "ACTIVE") throw forbidden("Your account cannot make purchases");
  if (!buyer.emailVerifiedAt) throw new AppError("FORBIDDEN", "Please verify your email address before purchasing");
  const settings = await getSettings();
  if (!settings.features.marketplaceEnabled) throw new AppError("FORBIDDEN", "The marketplace is currently closed");

  return db.$transaction(async (tx) => {
    // Lock the listing row so two buyers cannot reserve it concurrently.
    await tx.$queryRaw`SELECT id FROM marketplace_listings WHERE id = ${listingId} FOR UPDATE`;
    const listing = await tx.marketplaceListing.findUnique({ where: { id: listingId }, include: { seller: true } });
    if (!listing) throw notFound("Listing");
    if (listing.status !== "APPROVED") throw new AppError("CONFLICT", "This listing is not available for purchase");
    if (listing.seller.verificationStatus !== "VERIFIED") throw new AppError("CONFLICT", "This seller is not verified");
    if (listing.seller.userId === buyer.id) throw new AppError("CONFLICT", "You cannot buy your own listing");

    const buyerFee = bps(listing.askingPriceMinor, settings.commerce.marketplaceBuyerFeeBps);
    const commission = bps(listing.askingPriceMinor, settings.commerce.marketplaceSellerCommissionBps);
    const purchase = await tx.purchaseTransaction.create({
      data: {
        number: humanId("MP"),
        listingId,
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        currency: listing.currency,
        priceMinor: listing.askingPriceMinor,
        buyerFeeMinor: buyerFee,
        totalMinor: listing.askingPriceMinor + buyerFee,
        sellerCommissionMinor: commission,
        sellerPayoutMinor: listing.askingPriceMinor - commission,
        termsAcceptedAt: new Date(),
        milestones: { create: MILESTONE_TEMPLATE.map((m, i) => ({ ...m, sortOrder: i + 1 })) },
      },
    });
    await tx.marketplaceListing.update({ where: { id: listingId }, data: { status: "RESERVED" } });
    await audit({ actorId: buyer.id, action: "purchase.started", entityType: "purchase", entityId: purchase.id }, tx);
    return purchase;
  });
}

/** Inside the payment transaction, once payment is verified. */
export async function markPurchasePaid(tx: Tx, purchaseId: string, paymentId: string) {
  await tx.$queryRaw`SELECT id FROM purchase_transactions WHERE id = ${purchaseId} FOR UPDATE`;
  const p = await tx.purchaseTransaction.findUniqueOrThrow({ where: { id: purchaseId }, include: { seller: true } });
  if (p.status !== "PENDING_PAYMENT") throw new AppError("CONFLICT", `Purchase is ${p.status}, not awaiting payment`);
  await tx.purchaseTransaction.update({ where: { id: purchaseId }, data: { status: "PAID", paidAt: new Date(), payoutStatus: "ON_HOLD" } });
  // Seller proceeds are recorded as PENDING in the seller's wallet: visible, not spendable or withdrawable.
  await creditWallet(tx, p.seller.userId, p.currency, p.sellerPayoutMinor, "PENDING", "SALE_PENDING", `Proceeds from ${p.number} (on hold until transfer is verified)`, `sale:${p.id}`, { type: "purchase", id: p.id });
  await tx.transaction.create({
    data: { type: "SELLER_PAYOUT_DUE", sourceType: "purchase", sourceId: p.id, userId: p.seller.userId, amountMinor: -p.sellerPayoutMinor, currency: p.currency, description: `Seller proceeds held for ${p.number}` },
  });
  await audit({ action: "purchase.paid", entityType: "purchase", entityId: purchaseId, metadata: { paymentId } }, tx);
}

export async function afterPurchasePaid(purchaseId: string) {
  const p = await db.purchaseTransaction.findUnique({ where: { id: purchaseId }, include: { listing: true, seller: true } });
  if (!p) return;
  await notify(p.buyerId, {
    type: "purchase.paid",
    title: `Payment received for ${p.number}`,
    body: `Your payment for "${p.listing.title}" is confirmed. The seller has been asked to start the platform's official transfer. Never share or request passwords.`,
    link: `/dashboard/purchases/${p.id}`,
  });
  await notify(p.seller.userId, {
    type: "sale.paid",
    title: `New sale: ${p.listing.title}`,
    body: `The buyer has paid for ${p.number}. Start the platform's official ownership transfer and submit evidence. Your proceeds are held until the transfer is verified.`,
    link: `/dashboard/purchases/${p.id}`,
  });
}

export async function getPurchaseForViewer(purchaseId: string, viewer: AuthUser) {
  const p = await db.purchaseTransaction.findUnique({
    where: { id: purchaseId },
    include: {
      listing: { include: { platform: true } },
      seller: { select: { id: true, userId: true, displayName: true, verificationStatus: true } },
      buyer: { select: { id: true, profile: { select: { displayName: true } } } },
      milestones: { orderBy: { sortOrder: "asc" } },
      disputes: { include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      refunds: true,
    },
  });
  if (!p) throw notFound("Purchase");
  const role = p.buyerId === viewer.id ? "BUYER" : p.seller.userId === viewer.id ? "SELLER" : isStaff(viewer.roles) ? "STAFF" : null;
  if (!role) throw notFound("Purchase");
  return { purchase: { ...p, listing: publicListing(p.listing) }, role };
}

const ACTIVE_TRANSFER: PurchaseStatus[] = ["PAID", "TRANSFER_IN_PROGRESS", "AWAITING_VERIFICATION"];

export async function submitMilestone(user: AuthUser, purchaseId: string, milestoneId: string, evidenceNote: string, evidenceKey?: string | null) {
  const { purchase, role } = await getPurchaseForViewer(purchaseId, user);
  if (!ACTIVE_TRANSFER.includes(purchase.status)) throw new AppError("CONFLICT", `Transfer steps cannot be updated while the purchase is ${purchase.status.toLowerCase()}`);
  const m = purchase.milestones.find((x) => x.id === milestoneId);
  if (!m) throw notFound("Milestone");
  if (m.responsible !== role) throw forbidden("This step must be completed by the other party");
  const prev = purchase.milestones.filter((x) => x.sortOrder < m.sortOrder);
  if (prev.some((x) => x.status !== "CONFIRMED")) throw new AppError("CONFLICT", "Complete the earlier transfer steps first");
  if (m.status === "CONFIRMED") throw new AppError("CONFLICT", "This step is already confirmed");
  if (SECRET_PATTERN.test(evidenceNote)) throw new AppError("VALIDATION_ERROR", "Evidence must not contain passwords or login codes");

  await db.$transaction(async (tx) => {
    await tx.transferMilestone.update({ where: { id: m.id }, data: { status: "SUBMITTED", evidenceNote, evidenceKey: evidenceKey ?? null, submittedAt: new Date() } });
    const isFinal = m.sortOrder === Math.max(...purchase.milestones.map((x) => x.sortOrder));
    await tx.purchaseTransaction.update({ where: { id: purchaseId }, data: { status: isFinal ? "AWAITING_VERIFICATION" : "TRANSFER_IN_PROGRESS" } });
  });
  const counterpartyId = m.confirmer === "BUYER" ? purchase.buyerId : m.confirmer === "SELLER" ? purchase.seller.userId : null;
  if (counterpartyId) {
    await notify(counterpartyId, { type: "purchase.milestone", title: `Action needed on ${purchase.number}`, body: `"${m.title}" was submitted. Please review and confirm.`, link: `/dashboard/purchases/${purchaseId}` });
  } else {
    await notifyStaff({ type: "purchase.verification", title: `Transfer awaiting verification: ${purchase.number}`, body: m.title, link: `/admin/purchases/${purchaseId}` });
  }
}

export async function reviewMilestone(user: AuthUser, purchaseId: string, milestoneId: string, decision: "CONFIRM" | "REJECT", note?: string) {
  const { purchase, role } = await getPurchaseForViewer(purchaseId, user);
  if (!ACTIVE_TRANSFER.includes(purchase.status)) throw new AppError("CONFLICT", `Transfer steps cannot be reviewed while the purchase is ${purchase.status.toLowerCase()}`);
  const m = purchase.milestones.find((x) => x.id === milestoneId);
  if (!m) throw notFound("Milestone");
  const allowed = m.confirmer === role || (m.confirmer === "ADMIN" && role === "STAFF");
  if (!allowed) throw forbidden("You cannot confirm this step");
  if (m.status !== "SUBMITTED") throw new AppError("CONFLICT", "This step has not been submitted yet");

  await db.$transaction(async (tx) => {
    await tx.transferMilestone.update({
      where: { id: m.id },
      data: decision === "CONFIRM" ? { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: user.id } : { status: "REJECTED", evidenceNote: `${m.evidenceNote ?? ""}\n\nReturned: ${note ?? ""}`.trim() },
    });
    if (decision === "CONFIRM" && m.confirmer === "ADMIN") await completePurchase(tx, purchaseId, user.id);
  });
}

/** Complete a purchase. Refuses if any step is unconfirmed or any dispute is open — completion is never silent. */
export async function completePurchase(tx: Tx, purchaseId: string, actorId: string) {
  await tx.$queryRaw`SELECT id FROM purchase_transactions WHERE id = ${purchaseId} FOR UPDATE`;
  const p = await tx.purchaseTransaction.findUniqueOrThrow({ where: { id: purchaseId }, include: { milestones: true, disputes: true, seller: true } });
  if (p.status === "DISPUTED" || p.disputes.some((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW")) {
    throw new AppError("CONFLICT", "This purchase has an open dispute and cannot be completed until it is resolved");
  }
  if (!ACTIVE_TRANSFER.includes(p.status)) throw new AppError("CONFLICT", `Purchase cannot be completed from ${p.status}`);
  if (p.milestones.some((m) => m.status !== "CONFIRMED")) throw new AppError("CONFLICT", "All transfer steps must be confirmed first");

  await tx.purchaseTransaction.update({ where: { id: purchaseId }, data: { status: "COMPLETED", completedAt: new Date(), payoutStatus: "DUE" } });
  await tx.marketplaceListing.update({ where: { id: p.listingId }, data: { status: "SOLD" } });
  await tx.sellerProfile.update({ where: { id: p.sellerId }, data: { completedSales: { increment: 1 } } });
  await moveBetweenBuckets(tx, p.seller.userId, p.currency, p.sellerPayoutMinor, "PENDING", "AVAILABLE", "SALE_RELEASED", `Proceeds released for ${p.number}`, `sale-release:${p.id}`, { type: "purchase", id: p.id });
  await audit({ actorId, action: "purchase.completed", entityType: "purchase", entityId: purchaseId }, tx);
}

export const disputeSchema = z.object({
  reason: z.enum(["TRANSFER_NOT_STARTED", "ACCESS_NOT_GRANTED", "NOT_AS_DESCRIBED", "SELLER_RECLAIMED_ACCESS", "BUYER_UNRESPONSIVE", "OTHER"]),
  details: z.string().trim().min(20).max(4000),
});

export async function openDispute(user: AuthUser, purchaseId: string, input: z.infer<typeof disputeSchema>) {
  const { purchase, role } = await getPurchaseForViewer(purchaseId, user);
  if (role === "STAFF") throw forbidden("Only the buyer or seller can open a dispute");
  if (!ACTIVE_TRANSFER.includes(purchase.status) && purchase.status !== "COMPLETED") throw new AppError("CONFLICT", "A dispute cannot be opened at this stage");
  const dispute = await db.$transaction(async (tx) => {
    const d = await tx.dispute.create({ data: { purchaseId, openedById: user.id, reason: input.reason, details: input.details, purchaseStatusBefore: purchase.status } });
    await tx.purchaseTransaction.update({ where: { id: purchaseId }, data: { status: "DISPUTED" } });
    await audit({ actorId: user.id, action: "dispute.opened", entityType: "dispute", entityId: d.id }, tx);
    return d;
  });
  const other = role === "BUYER" ? purchase.seller.userId : purchase.buyerId;
  await notify(other, { type: "dispute.opened", title: `Dispute opened on ${purchase.number}`, body: "An administrator will review the evidence from both parties.", link: `/dashboard/purchases/${purchaseId}` });
  await notifyStaff({ type: "dispute.opened", title: `Dispute: ${purchase.number}`, body: input.reason, link: `/admin/disputes` });
  return dispute;
}

export async function addDisputeMessage(user: AuthUser, disputeId: string, body: string) {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw notFound("Dispute");
  const { role } = await getPurchaseForViewer(dispute.purchaseId, user);
  if (!["OPEN", "UNDER_REVIEW"].includes(dispute.status)) throw new AppError("CONFLICT", "This dispute is closed");
  return db.disputeMessage.create({ data: { disputeId, authorId: user.id, authorRole: role, body } });
}

export const resolveDisputeSchema = z.object({
  outcome: z.enum(["UNDER_REVIEW", "RESOLVED_BUYER", "RESOLVED_SELLER", "CLOSED"]),
  resolution: z.string().trim().min(5).max(4000),
});

/**
 * RESOLVED_BUYER → full refund to the buyer is recorded (processed via the refund service).
 * RESOLVED_SELLER / CLOSED → purchase returns to its pre-dispute status; completion still requires
 * the remaining verification steps.
 */
export async function resolveDispute(staff: AuthUser, disputeId: string, input: z.infer<typeof resolveDisputeSchema>, ip?: string) {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: { purchase: true } });
  if (!dispute) throw notFound("Dispute");
  if (!["OPEN", "UNDER_REVIEW"].includes(dispute.status)) throw new AppError("CONFLICT", "Dispute already resolved");
  await db.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: disputeId },
      data: { status: input.outcome, resolution: input.resolution, ...(input.outcome !== "UNDER_REVIEW" ? { resolvedAt: new Date(), resolvedById: staff.id } : {}) },
    });
    await tx.disputeMessage.create({ data: { disputeId, authorId: staff.id, authorRole: "STAFF", body: input.resolution } });
    if (input.outcome === "RESOLVED_SELLER" || input.outcome === "CLOSED") {
      const others = await tx.dispute.count({ where: { purchaseId: dispute.purchaseId, id: { not: disputeId }, status: { in: ["OPEN", "UNDER_REVIEW"] } } });
      if (!others) await tx.purchaseTransaction.update({ where: { id: dispute.purchaseId }, data: { status: dispute.purchaseStatusBefore } });
    }
    await audit({ actorId: staff.id, action: `dispute.${input.outcome.toLowerCase()}`, entityType: "dispute", entityId: disputeId, metadata: { resolution: input.resolution }, ip }, tx);
  });
  if (input.outcome === "RESOLVED_BUYER") {
    const { refundPurchaseForDispute } = await import("./refunds");
    await refundPurchaseForDispute(staff, dispute.purchaseId, input.resolution, ip);
  }
  const p = dispute.purchase;
  const seller = await db.sellerProfile.findUniqueOrThrow({ where: { id: p.sellerId } });
  for (const uid of [p.buyerId, seller.userId]) {
    await notify(uid, { type: "dispute.update", title: `Dispute update on ${p.number}`, body: input.resolution, link: `/dashboard/purchases/${p.id}` });
  }
}

/** Release listings whose purchase was never paid within the payment window. */
export async function expireUnpaidPurchases() {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.commerce.orderPaymentWindowHours * 3_600_000);
  const stale = await db.purchaseTransaction.findMany({ where: { status: "PENDING_PAYMENT", createdAt: { lt: cutoff } } });
  for (const p of stale) await cancelUnpaidPurchase(p.id, null);
  return stale.length;
}

export async function cancelUnpaidPurchase(purchaseId: string, user: AuthUser | null) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchase_transactions WHERE id = ${purchaseId} FOR UPDATE`;
    const p = await tx.purchaseTransaction.findUnique({ where: { id: purchaseId } });
    if (!p) throw notFound("Purchase");
    if (user && p.buyerId !== user.id) throw notFound("Purchase");
    if (p.status !== "PENDING_PAYMENT") throw new AppError("CONFLICT", "Only unpaid purchases can be cancelled");
    await tx.purchaseTransaction.update({ where: { id: purchaseId }, data: { status: "CANCELLED" } });
    await tx.marketplaceListing.updateMany({ where: { id: p.listingId, status: "RESERVED" }, data: { status: "APPROVED" } });
    await tx.payment.updateMany({ where: { purchaseId, status: "PENDING" }, data: { status: "ABANDONED" } });
  });
}
