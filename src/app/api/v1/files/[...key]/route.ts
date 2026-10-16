import { db } from "@/lib/db";
import { authFromRequest } from "@/server/auth/session";
import { can, isStaff } from "@/server/auth/rbac";
import { audit } from "@/server/audit";
import { readFile } from "@/server/storage";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Serves private files after an authorization check:
 *  listing/*  → public only once the listing is approved; owner and staff otherwise
 *  evidence/* → buyer, seller or staff of the purchase that references it
 *  verification/* → the uploading seller and marketplace moderators (views are audited)
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  const auth = await authFromRequest(req);
  const staff = auth ? isStaff(auth.user.roles) : false;

  if (key.startsWith("listing/")) {
    const img = await db.listingImage.findFirst({ where: { storageKey: key }, include: { listing: { include: { seller: true } } } });
    if (!img) return notFound();
    const visible = ["APPROVED", "RESERVED", "SOLD"].includes(img.listing.status) || staff || auth?.user.id === img.listing.seller.userId;
    if (!visible) return notFound();
  } else if (key.startsWith("evidence/")) {
    const m = await db.transferMilestone.findFirst({ where: { evidenceKey: key }, include: { purchase: { include: { seller: true } } } });
    if (!auth || !m) return notFound();
    if (!(staff || auth.user.id === m.purchase.buyerId || auth.user.id === m.purchase.seller.userId)) return notFound();
  } else if (key.startsWith("verification/")) {
    // Identity/business documents: the seller who uploaded them, and marketplace moderators only.
    if (!auth) return notFound();
    const owner = await db.sellerProfile.findFirst({ where: { verificationDocKeys: { has: key } }, select: { userId: true } });
    if (!owner) return notFound();
    const moderator = can(auth.user.roles, "marketplace:moderate");
    if (!(moderator || auth.user.id === owner.userId)) return notFound();
    if (moderator) await audit({ actorId: auth.user.id, action: "seller.document_viewed", entityType: "file", entityId: key });
  } else if (!staff) return notFound();

  const file = await readFile(key);
  if (!file) return notFound();
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.contentType, "Cache-Control": key.startsWith("listing/") ? "public, max-age=3600" : "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
