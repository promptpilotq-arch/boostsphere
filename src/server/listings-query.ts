import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicListing } from "./marketplace";

export type ListingFilter = { q?: string; platform?: string; type?: string; sort?: string; minPrice?: number; maxPrice?: number; page?: number; pageSize?: number };

/** Public marketplace browse: only APPROVED listings from verified sellers. */
export async function searchListings(f: ListingFilter) {
  const pageSize = Math.min(48, f.pageSize ?? 12);
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.MarketplaceListingWhereInput = {
    status: "APPROVED",
    seller: { verificationStatus: "VERIFIED" },
    platform: { status: "PUBLISHED", marketplaceEnabled: true, ...(f.platform ? { slug: f.platform } : {}) },
    ...(f.type ? { accountType: f.type } : {}),
    ...(f.minPrice != null || f.maxPrice != null ? { askingPriceMinor: { ...(f.minPrice != null ? { gte: f.minPrice } : {}), ...(f.maxPrice != null ? { lte: f.maxPrice } : {}) } } : {}),
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { niche: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const orderBy: Prisma.MarketplaceListingOrderByWithRelationInput =
    f.sort === "price_asc" ? { askingPriceMinor: "asc" } : f.sort === "price_desc" ? { askingPriceMinor: "desc" } : f.sort === "audience" ? { audienceSize: "desc" } : { reviewedAt: "desc" };
  const [items, total] = await Promise.all([
    db.marketplaceListing.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { platform: true, seller: { select: { displayName: true, verificationStatus: true, completedSales: true } }, images: { orderBy: { sortOrder: "asc" }, take: 1 } },
    }),
    db.marketplaceListing.count({ where }),
  ]);
  return { items: items.map(publicListing), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** A listing page is visible publicly only when approved (or reserved/sold, for context). Owners and staff see all states. */
export async function getListingForViewer(slugOrId: string, viewer: { id: string; staff: boolean } | null) {
  const l = await db.marketplaceListing.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    include: { platform: true, seller: { select: { id: true, userId: true, displayName: true, bio: true, verificationStatus: true, completedSales: true, createdAt: true } }, images: { orderBy: { sortOrder: "asc" } } },
  });
  if (!l) return null;
  const isOwner = viewer?.id === l.seller.userId;
  if (!["APPROVED", "RESERVED", "SOLD"].includes(l.status) && !isOwner && !viewer?.staff) return null;
  const { userId: _u, ...seller } = l.seller;
  return { listing: { ...publicListing(l), seller }, isOwner };
}
