import { z } from "zod";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { route } from "@/server/http";

export const POST = route(
  async ({ auth, body }) => {
    const { listingId, saved } = await body(z.object({ listingId: z.string().min(1), saved: z.boolean() }));
    const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) throw notFound("Listing");
    if (saved) await db.savedListing.upsert({ where: { userId_listingId: { userId: auth.user.id, listingId } }, create: { userId: auth.user.id, listingId }, update: {} });
    else await db.savedListing.deleteMany({ where: { userId: auth.user.id, listingId } });
    return { saved };
  },
  { auth: "required" },
);
