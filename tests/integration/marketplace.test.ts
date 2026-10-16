import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { call, makeUser, resetDb, seedCatalog } from "../helpers";
import * as listingRoute from "@/app/api/v1/marketplace/listings/[id]/route";
import * as listingsRoute from "@/app/api/v1/marketplace/listings/route";
import * as paymentsRoute from "@/app/api/v1/payments/route";
import * as purchaseRoute from "@/app/api/v1/purchases/[id]/route";
import * as adminMarketplace from "@/app/api/v1/admin/marketplace/route";
import * as adminDispute from "@/app/api/v1/admin/disputes/[id]/route";
import * as adminUser from "@/app/api/v1/admin/users/[id]/route";
import { completePurchase } from "@/server/marketplace";

let platformId: string;

beforeEach(async () => {
  await resetDb();
  platformId = (await seedCatalog()).platform.id;
});

async function setupListing(status: "PENDING_REVIEW" | "APPROVED", sellerVerified = true) {
  const seller = await makeUser(["CUSTOMER", "SELLER"]);
  const sp = await db.sellerProfile.create({ data: { userId: seller.user.id, displayName: "Seller", verificationStatus: sellerVerified ? "VERIFIED" : "PENDING" } });
  const listing = await db.marketplaceListing.create({
    data: {
      slug: `listing-${Date.now()}`,
      sellerId: sp.id,
      platformId,
      title: "Test creator profile",
      accountType: "CREATOR",
      description: "A description long enough for validation of listing data in tests.",
      niche: "Food",
      askingPriceMinor: 1_000_000,
      transferMethod: "Official business portfolio transfer",
      transferEligibilityConfirmed: true,
      status,
      ownershipEvidenceNote: "INTERNAL: reviewed ownership documents",
    },
  });
  return { seller, sp, listing };
}

async function fundWallet(userId: string, adminCookie: string, amountMinor: number) {
  const r = await call(adminUser.POST, { cookie: adminCookie, params: { id: userId }, body: { action: "wallet_adjustment", bucket: "AVAILABLE", amountMinor, reason: "Test funding", idempotencyKey: `fund-${userId}` } });
  expect(r.status).toBe(200);
}

async function buyWithWallet(buyerCookie: string, buyerId: string, listingId: string) {
  const admin = await makeUser(["ADMIN"]);
  await fundWallet(buyerId, admin.cookie, 5_000_000);
  const start = await call(listingRoute.POST, { cookie: buyerCookie, params: { id: listingId }, body: { action: "purchase", acceptTerms: true } });
  expect(start.status).toBe(200);
  const pay = await call(paymentsRoute.POST, { cookie: buyerCookie, body: { purpose: "MARKETPLACE_PURCHASE", purchaseId: start.json.purchase.id, provider: "wallet" } });
  expect(pay.status).toBe(200);
  expect(pay.json.status).toBe("SUCCEEDED");
  return { purchaseId: start.json.purchase.id as string, admin };
}

describe("marketplace", () => {
  it("11. an unapproved listing cannot be purchased or browsed", async () => {
    const { listing } = await setupListing("PENDING_REVIEW");
    const buyer = await makeUser();
    const r = await call(listingRoute.POST, { cookie: buyer.cookie, params: { id: listing.id }, body: { action: "purchase", acceptTerms: true } });
    expect(r.status).toBe(409);
    expect(await db.purchaseTransaction.count()).toBe(0);
    const browse = await call(listingsRoute.GET);
    expect(browse.json.items).toHaveLength(0);
    const page = await call(listingRoute.GET, { params: { id: listing.id } });
    expect(page.status).toBe(404);
  });

  it("listings from unverified sellers cannot be approved", async () => {
    const { listing } = await setupListing("PENDING_REVIEW", false);
    const admin = await makeUser(["ADMIN"]);
    const r = await call(adminMarketplace.POST, { cookie: admin.cookie, body: { action: "moderate_listing", listingId: listing.id, decision: "APPROVE", note: "" } });
    expect(r.status).toBe(409);
  });

  it("public listing responses never include internal moderation evidence", async () => {
    const { listing } = await setupListing("APPROVED");
    const r = await call(listingRoute.GET, { params: { id: listing.id } });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.json)).not.toMatch(/ownershipEvidenceNote|INTERNAL: reviewed/);
  });

  it("completes the full authorized transfer workflow and releases held proceeds", async () => {
    const { listing, seller } = await setupListing("APPROVED");
    const buyer = await makeUser();
    const { purchaseId, admin } = await buyWithWallet(buyer.cookie, buyer.user.id, listing.id);

    const p = await db.purchaseTransaction.findUniqueOrThrow({ where: { id: purchaseId }, include: { milestones: { orderBy: { sortOrder: "asc" } } } });
    expect(p.status).toBe("PAID");
    expect((await db.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("RESERVED");

    // Second buyer is blocked while reserved.
    const other = await makeUser();
    expect((await call(listingRoute.POST, { cookie: other.cookie, params: { id: listing.id }, body: { action: "purchase", acceptTerms: true } })).status).toBe(409);

    const cookieFor = (role: string) => (role === "SELLER" ? seller.cookie : role === "BUYER" ? buyer.cookie : admin.cookie);
    for (const m of p.milestones) {
      const s = await call(purchaseRoute.POST, { cookie: cookieFor(m.responsible), params: { id: purchaseId }, body: { action: "submit_milestone", milestoneId: m.id, evidenceNote: `Evidence for ${m.title}` } });
      expect(s.status).toBe(200);
      const c = await call(purchaseRoute.POST, { cookie: cookieFor(m.confirmer), params: { id: purchaseId }, body: { action: "confirm_milestone", milestoneId: m.id } });
      expect(c.status).toBe(200);
    }
    const done = await db.purchaseTransaction.findUniqueOrThrow({ where: { id: purchaseId }, include: { seller: true } });
    expect(done.status).toBe("COMPLETED");
    expect((await db.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("SOLD");
    const sellerWallet = await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: seller.user.id, currency: "NGN" } }, include: { entries: true } });
    const sum = (b: string) => sellerWallet.entries.filter((e) => e.bucket === b).reduce((n, e) => n + e.amountMinor, 0);
    expect(sum("PENDING")).toBe(0);
    expect(sum("AVAILABLE")).toBe(done.sellerPayoutMinor);
  });

  it("evidence containing credentials is rejected", async () => {
    const { listing, seller } = await setupListing("APPROVED");
    const buyer = await makeUser();
    const { purchaseId } = await buyWithWallet(buyer.cookie, buyer.user.id, listing.id);
    const m = await db.transferMilestone.findFirstOrThrow({ where: { purchaseId, sortOrder: 1 } });
    const r = await call(purchaseRoute.POST, { cookie: seller.cookie, params: { id: purchaseId }, body: { action: "submit_milestone", milestoneId: m.id, evidenceNote: "Here you go, password: hunter2" } });
    expect(r.status).toBe(422);
  });

  it("12. a disputed transaction cannot be silently marked complete", async () => {
    const { listing, seller } = await setupListing("APPROVED");
    const buyer = await makeUser();
    const { purchaseId, admin } = await buyWithWallet(buyer.cookie, buyer.user.id, listing.id);
    const ms = await db.transferMilestone.findMany({ where: { purchaseId }, orderBy: { sortOrder: "asc" } });
    // Mark all milestones confirmed directly, then open a dispute.
    await db.transferMilestone.updateMany({ where: { purchaseId }, data: { status: "CONFIRMED" } });
    const d = await call(purchaseRoute.POST, { cookie: buyer.cookie, params: { id: purchaseId }, body: { action: "open_dispute", reason: "SELLER_RECLAIMED_ACCESS", details: "The seller removed my admin role after I paid for it." } });
    expect(d.status).toBe(200);

    await expect(db.$transaction((tx) => completePurchase(tx, purchaseId, admin.user.id))).rejects.toThrow(/dispute/i);
    // Milestone actions are blocked while disputed.
    const confirm = await call(purchaseRoute.POST, { cookie: admin.cookie, params: { id: purchaseId }, body: { action: "confirm_milestone", milestoneId: ms[3].id } });
    expect(confirm.status).toBe(409);
    expect((await db.purchaseTransaction.findUniqueOrThrow({ where: { id: purchaseId } })).status).toBe("DISPUTED");

    // Admin resolves for the buyer → full refund to wallet, listing sent back to moderation.
    const resolve = await call(adminDispute.POST, { cookie: admin.cookie, params: { id: d.json.dispute.id }, body: { outcome: "RESOLVED_BUYER", resolution: "Seller reclaimed access; buyer refunded." } });
    expect(resolve.status).toBe(200);
    const after = await db.purchaseTransaction.findUniqueOrThrow({ where: { id: purchaseId } });
    expect(after.status).toBe("REFUNDED");
    expect((await db.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("PENDING_REVIEW");
    const sellerPending = await db.walletLedgerEntry.aggregate({ where: { wallet: { userId: seller.user.id }, bucket: "PENDING" }, _sum: { amountMinor: true } });
    expect(sellerPending._sum.amountMinor).toBe(0);
  });
});
