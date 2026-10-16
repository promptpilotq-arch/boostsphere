import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { route } from "@/server/http";
import { requestSellerVerification, upsertSellerProfile } from "@/server/marketplace";
import { saveFile } from "@/server/storage";
import { audit } from "@/server/audit";

const MAX_DOCS = 5;

export const GET = route(
  async ({ auth }) => {
    const profile = await db.sellerProfile.findUnique({ where: { userId: auth.user.id } });
    const listings = profile ? await db.marketplaceListing.findMany({ where: { sellerId: profile.id }, orderBy: { updatedAt: "desc" } }) : [];
    return {
      profile: profile ? { ...profile, verificationDocKeys: undefined, verificationDocumentCount: profile.verificationDocKeys.length } : null,
      listings: listings.map(({ ownershipEvidenceNote: _x, ...l }) => l),
    };
  },
  { auth: "required" },
);

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_profile"), displayName: z.string().trim().min(2).max(60), bio: z.string().trim().max(1000).default("") }),
  z.object({
    action: z.literal("request_verification"),
    statement: z.string().trim().min(30, "Describe who you are and how you own the assets you'll list").max(3000),
    attest: z.literal(true, { errorMap: () => ({ message: "You must confirm the attestation" }) }),
  }),
]);

/**
 * JSON: save_profile | request_verification.
 * Multipart with a "document" file: attach an identity or business document (PNG/JPEG/WebP/PDF) to the
 * seller's verification file. Documents are private: only the seller and staff can open them.
 */
export const POST = route(
  async ({ auth, body, req, ip }) => {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const profile = await db.sellerProfile.findUnique({ where: { userId: auth.user.id } });
      if (!profile) throw new AppError("FORBIDDEN", "Create a seller profile first");
      if (profile.verificationStatus === "VERIFIED") throw new AppError("CONFLICT", "You are already verified");
      if (profile.verificationDocKeys.length >= MAX_DOCS) throw new AppError("CONFLICT", `You can upload up to ${MAX_DOCS} documents`);
      const file = (await req.formData()).get("document");
      if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "No document uploaded");
      const { key } = await saveFile("verification", file);
      await db.sellerProfile.update({ where: { id: profile.id }, data: { verificationDocKeys: { push: key } } });
      await audit({ actorId: auth.user.id, action: "seller.document_uploaded", entityType: "seller", entityId: profile.id, ip });
      return { documentCount: profile.verificationDocKeys.length + 1 };
    }
    const input = await body(schema);
    if (input.action === "save_profile") return { profile: await upsertSellerProfile(auth.user, input) };
    const p = await requestSellerVerification(auth.user, input.statement);
    return { profile: { id: p.id, verificationStatus: p.verificationStatus } };
  },
  { auth: "required", rateLimit: { name: "seller", limit: 30, windowSec: 3600, by: "user" } },
);
