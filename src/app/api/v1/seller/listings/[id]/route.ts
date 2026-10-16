import { z } from "zod";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { route } from "@/server/http";
import { listingInputSchema, submitListing, updateListing, withdrawListing } from "@/server/marketplace";
import { saveFile } from "@/server/storage";

export const PUT = route<{ id: string }>(
  async ({ auth, body, params }) => {
    const input = await body(listingInputSchema);
    return { listing: await updateListing(auth.user, params.id, input) };
  },
  { auth: "required" },
);

const actionSchema = z.object({ action: z.enum(["submit", "withdraw"]) });

/** JSON { action } for submit/withdraw; multipart with an "image" file to attach a listing image. */
export const POST = route<{ id: string }>(
  async ({ auth, body, params, req }) => {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const seller = await db.sellerProfile.findUnique({ where: { userId: auth.user.id } });
      const listing = await db.marketplaceListing.findUnique({ where: { id: params.id }, include: { _count: { select: { images: true } } } });
      if (!seller || !listing || listing.sellerId !== seller.id) throw notFound("Listing");
      const form = await req.formData();
      const file = form.get("image");
      if (!(file instanceof File)) throw new Error("No file");
      const { key } = await saveFile("listing", file);
      const alt = String(form.get("alt") ?? listing.title).slice(0, 140);
      const image = await db.listingImage.create({ data: { listingId: listing.id, storageKey: key, alt, sortOrder: listing._count.images } });
      // New images need moderation too.
      if (listing.status === "APPROVED") await db.marketplaceListing.update({ where: { id: listing.id }, data: { status: "PENDING_REVIEW" } });
      return { image };
    }
    const { action } = await body(actionSchema);
    return { listing: action === "submit" ? await submitListing(auth.user, params.id) : await withdrawListing(auth.user, params.id) };
  },
  { auth: "required" },
);
