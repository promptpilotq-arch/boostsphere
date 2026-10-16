import type { Prisma, PublishStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { inputFieldsSchema } from "@/lib/service-inputs";
import type { AuthUser } from "./auth/session";
import { audit } from "./audit";

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

// ───────────── Public queries ─────────────

export type CatalogFilter = { q?: string; platform?: string; category?: string; sort?: "relevance" | "price_asc" | "price_desc" | "newest" | "name"; page?: number; pageSize?: number };

/** Published services only. Lowest package price is computed for sorting. */
export async function searchServices(f: CatalogFilter) {
  const pageSize = Math.min(48, f.pageSize ?? 12);
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.ServiceWhereInput = {
    status: "PUBLISHED",
    platform: { status: "PUBLISHED", ...(f.platform ? { slug: f.platform } : {}) },
    ...(f.category ? { category: { slug: f.category } } : {}),
    ...(f.q
      ? {
          OR: [
            { name: { contains: f.q, mode: "insensitive" } },
            { summary: { contains: f.q, mode: "insensitive" } },
            { category: { name: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const all = await db.service.findMany({
    where,
    include: { platform: true, category: true, packages: { where: { active: true }, orderBy: { priceMinor: "asc" } } },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  const withPrice = all.map((s) => ({ ...s, fromPriceMinor: s.pricingModel === "PACKAGE" ? (s.packages[0]?.priceMinor ?? null) : s.unitPriceMinor != null ? Math.ceil(((s.minQuantity ?? s.unitSize) / s.unitSize) * s.unitPriceMinor) : null }));
  const sorted = [...withPrice];
  if (f.sort === "price_asc") sorted.sort((a, b) => (a.fromPriceMinor ?? Infinity) - (b.fromPriceMinor ?? Infinity));
  if (f.sort === "price_desc") sorted.sort((a, b) => (b.fromPriceMinor ?? -1) - (a.fromPriceMinor ?? -1));
  if (f.sort === "newest") sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (f.sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (f.q && (!f.sort || f.sort === "relevance")) {
    const q = f.q.toLowerCase();
    sorted.sort((a, b) => Number(b.name.toLowerCase().includes(q)) - Number(a.name.toLowerCase().includes(q)));
  }
  const total = sorted.length;
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getPublishedService(slugValue: string) {
  const s = await db.service.findUnique({
    where: { slug: slugValue },
    include: { platform: true, category: true, packages: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!s || s.status !== "PUBLISHED" || s.platform.status !== "PUBLISHED") return null;
  return s;
}

export const listPublishedPlatforms = () => db.socialPlatform.findMany({ where: { status: "PUBLISHED" }, orderBy: { sortOrder: "asc" } });

// ───────────── Admin: platforms & categories ─────────────

export const platformSchema = z.object({
  slug,
  name: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(140),
  description: z.string().trim().max(3000),
  iconKey: z.string().trim().max(40),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.coerce.number().int().default(0),
  status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "ARCHIVED"]),
  marketplaceEnabled: z.boolean().default(false),
  transferGuidance: z.string().max(4000).default(""),
});

export async function savePlatform(staff: AuthUser, id: string | null, input: z.infer<typeof platformSchema>, ip?: string) {
  const p = id ? await db.socialPlatform.update({ where: { id }, data: input }) : await db.socialPlatform.create({ data: input });
  await audit({ actorId: staff.id, action: id ? "platform.updated" : "platform.created", entityType: "platform", entityId: p.id, metadata: input, ip });
  return p;
}

export const categorySchema = z.object({
  platformId: z.string().min(1),
  slug,
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(1000).default(""),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveCategory(staff: AuthUser, id: string | null, input: z.infer<typeof categorySchema>, ip?: string) {
  const c = id ? await db.serviceCategory.update({ where: { id }, data: input }) : await db.serviceCategory.create({ data: input });
  await audit({ actorId: staff.id, action: id ? "category.updated" : "category.created", entityType: "category", entityId: c.id, ip });
  return c;
}

// ───────────── Admin: services ─────────────

export const packageSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).default(""),
  priceMinor: z.coerce.number().int().min(0),
  currency: z.string().length(3).default("NGN"),
  features: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  duration: z.string().max(60).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const serviceSchema = z
  .object({
    slug,
    platformId: z.string().min(1),
    categoryId: z.string().min(1),
    name: z.string().trim().min(3).max(100),
    summary: z.string().trim().min(10).max(240),
    description: z.string().trim().min(20).max(10000),
    imageUrl: z.string().url().optional().nullable().or(z.literal("").transform(() => null)),
    pricingModel: z.enum(["PACKAGE", "PER_UNIT"]),
    currency: z.string().length(3).default("NGN"),
    unitPriceMinor: z.coerce.number().int().min(0).optional().nullable(),
    unitSize: z.coerce.number().int().min(1).default(1),
    unitLabel: z.string().max(30).default("unit"),
    minQuantity: z.coerce.number().int().min(1).optional().nullable(),
    maxQuantity: z.coerce.number().int().min(1).optional().nullable(),
    fulfillmentType: z.enum(["MANUAL", "PROVIDER_API", "AD_CAMPAIGN", "CONSULTATION", "DIGITAL_DELIVERABLE"]),
    providerKey: z.string().max(40).optional().nullable(),
    estimatedDuration: z.string().trim().min(2).max(80),
    inputFields: inputFieldsSchema.default([]),
    refundPolicy: z.string().trim().min(10).max(4000),
    terms: z.string().trim().min(10).max(6000),
    eligibility: z.string().trim().min(5).max(3000),
    deliveryNotes: z.string().max(3000).default(""),
    outcomeDisclaimer: z.string().trim().min(10).max(500),
    status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "ARCHIVED"]),
    featured: z.boolean().default(false),
    refundable: z.boolean().default(true),
    sortOrder: z.coerce.number().int().default(0),
    // Blank package rows from the admin form are ignored.
    packages: z.preprocess((v) => (Array.isArray(v) ? v.filter((p) => p && typeof p === "object" && (p as { name?: string }).name) : v), z.array(packageSchema).max(10)).default([]),
  })
  .superRefine((s, ctx) => {
    if (s.pricingModel === "PER_UNIT" && s.unitPriceMinor == null) ctx.addIssue({ code: "custom", path: ["unitPriceMinor"], message: "Per-unit services need a unit price" });
    if (s.pricingModel === "PACKAGE" && s.status === "PUBLISHED" && !s.packages.some((p) => p.active)) ctx.addIssue({ code: "custom", path: ["packages"], message: "Add at least one active package before publishing" });
    if (s.minQuantity && s.maxQuantity && s.minQuantity > s.maxQuantity) ctx.addIssue({ code: "custom", path: ["maxQuantity"], message: "Maximum must be at least the minimum" });
  });

export async function saveService(staff: AuthUser, id: string | null, input: z.infer<typeof serviceSchema>, ip?: string) {
  const category = await db.serviceCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || category.platformId !== input.platformId) throw new AppError("VALIDATION_ERROR", "Category does not belong to the selected platform");
  const { packages, inputFields, ...data } = input;
  const service = await db.$transaction(async (tx) => {
    const s = id
      ? await tx.service.update({ where: { id }, data: { ...data, inputFields } })
      : await tx.service.create({ data: { ...data, inputFields } });
    const keep = packages.filter((p) => p.id).map((p) => p.id!) as string[];
    // Packages referenced by orders are deactivated rather than deleted.
    const removed = await tx.servicePackage.findMany({ where: { serviceId: s.id, id: { notIn: keep } }, include: { _count: { select: { orders: true } } } });
    for (const r of removed) {
      if (r._count.orders) await tx.servicePackage.update({ where: { id: r.id }, data: { active: false } });
      else await tx.servicePackage.delete({ where: { id: r.id } });
    }
    for (const p of packages) {
      const { id: pid, ...pdata } = p;
      if (pid) await tx.servicePackage.update({ where: { id: pid, serviceId: s.id }, data: pdata });
      else await tx.servicePackage.create({ data: { ...pdata, serviceId: s.id } });
    }
    return s;
  });
  await audit({ actorId: staff.id, action: id ? "service.updated" : "service.created", entityType: "service", entityId: service.id, metadata: { status: input.status }, ip });
  return service;
}

export async function setServiceStatus(staff: AuthUser, id: string, status: PublishStatus, ip?: string) {
  const s = await db.service.findUnique({ where: { id }, include: { packages: true } });
  if (!s) throw notFound("Service");
  if (status === "PUBLISHED" && s.pricingModel === "PACKAGE" && !s.packages.some((p) => p.active)) throw new AppError("CONFLICT", "Add an active package before publishing");
  const updated = await db.service.update({ where: { id }, data: { status } });
  await audit({ actorId: staff.id, action: `service.${status.toLowerCase()}`, entityType: "service", entityId: id, ip });
  return updated;
}

export async function deleteService(staff: AuthUser, id: string, ip?: string) {
  const count = await db.serviceOrder.count({ where: { serviceId: id } });
  if (count) throw new AppError("CONFLICT", "This service has orders and cannot be deleted. Archive it instead.");
  await db.service.delete({ where: { id } });
  await audit({ actorId: staff.id, action: "service.deleted", entityType: "service", entityId: id, ip });
}

// ───────────── Admin: coupons ─────────────

export const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/),
    description: z.string().max(200).default(""),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.coerce.number().int().positive(),
    currency: z.string().length(3).optional().nullable(),
    minOrderMinor: z.coerce.number().int().min(0).default(0),
    maxDiscountMinor: z.coerce.number().int().positive().optional().nullable(),
    maxRedemptions: z.coerce.number().int().positive().optional().nullable(),
    perUserLimit: z.coerce.number().int().positive().default(1),
    platformId: z.string().optional().nullable().or(z.literal("").transform(() => null)),
    serviceId: z.string().optional().nullable().or(z.literal("").transform(() => null)),
    startsAt: z.coerce.date().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
    active: z.boolean().default(true),
  })
  .superRefine((c, ctx) => {
    if (c.type === "PERCENT" && c.value > 10000) ctx.addIssue({ code: "custom", path: ["value"], message: "Percent coupons are in basis points (max 10000 = 100%)" });
    if (c.type === "FIXED" && !c.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Fixed coupons need a currency" });
  });

export async function saveCoupon(staff: AuthUser, id: string | null, input: z.infer<typeof couponSchema>, ip?: string) {
  const c = id ? await db.coupon.update({ where: { id }, data: input }) : await db.coupon.create({ data: input });
  await audit({ actorId: staff.id, action: id ? "coupon.updated" : "coupon.created", entityType: "coupon", entityId: c.id, ip });
  return c;
}
