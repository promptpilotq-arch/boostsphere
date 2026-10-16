import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const [platforms, services, listings] = await Promise.all([
    db.socialPlatform.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    db.service.findMany({ where: { status: "PUBLISHED", platform: { status: "PUBLISHED" } }, select: { slug: true, updatedAt: true } }),
    db.marketplaceListing.findMany({ where: { status: "APPROVED" }, select: { slug: true, updatedAt: true } }),
  ]);
  const statics = ["", "/services", "/marketplace", "/how-it-works", "/pricing", "/faq", "/contact", "/about", "/legal/terms", "/legal/privacy", "/legal/refunds", "/legal/acceptable-use"];
  return [
    ...statics.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 })),
    ...platforms.map((p) => ({ url: `${base}/platforms/${p.slug}`, lastModified: p.updatedAt, priority: 0.8 })),
    ...services.map((s) => ({ url: `${base}/services/${s.slug}`, lastModified: s.updatedAt, priority: 0.7 })),
    ...listings.map((l) => ({ url: `${base}/marketplace/${l.slug}`, lastModified: l.updatedAt, priority: 0.5 })),
  ];
}
