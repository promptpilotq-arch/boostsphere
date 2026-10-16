import type { RoleKey } from "@prisma/client";
import { db } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/password";

const ORIGIN = "http://localhost:3000";

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeUser(roles: RoleKey[] = ["CUSTOMER"], opts: { verified?: boolean; password?: string } = {}) {
  n++;
  for (const key of roles) await db.role.upsert({ where: { key }, create: { key, name: key, description: key }, update: {} });
  const user = await db.user.create({
    data: {
      email: `user${n}-${Date.now()}@example.test`,
      passwordHash: await hashPassword(opts.password ?? "Test-password-123"),
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      referralCode: `RT${n}${Date.now() % 100000}`,
      profile: { create: { displayName: `Test User ${n}` } },
    },
  });
  for (const key of roles) {
    const role = await db.role.findUniqueOrThrow({ where: { key } });
    await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  const { token } = await createSession(user.id);
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

export async function seedCatalog() {
  await db.role.upsert({ where: { key: "CUSTOMER" }, create: { key: "CUSTOMER", name: "Customer", description: "" }, update: {} });
  const platform = await db.socialPlatform.create({
    data: { slug: "instagram", name: "Instagram", tagline: "t", description: "d", iconKey: "instagram", brandColor: "#E4405F", marketplaceEnabled: true },
  });
  const category = await db.serviceCategory.create({ data: { platformId: platform.id, slug: "promotion", name: "Promotion", description: "" } });
  const base = {
    platformId: platform.id,
    categoryId: category.id,
    summary: "A summary long enough",
    description: "A description that is long enough to pass validation.",
    estimatedDuration: "3 days",
    refundPolicy: "Refund policy text",
    terms: "Terms text here",
    eligibility: "Eligibility",
    inputFields: [{ key: "target_url", label: "Post URL", type: "url", required: true, allowedHosts: ["instagram.com"] }],
  };
  const packageService = await db.service.create({
    data: {
      ...base,
      slug: "ig-promo",
      name: "IG Promotion",
      status: "PUBLISHED",
      packages: { create: [{ name: "Starter", description: "s", priceMinor: 5_000_000 }] },
    },
    include: { packages: true },
  });
  const unitService = await db.service.create({
    data: { ...base, slug: "ig-thumbs", name: "Thumbnails", status: "PUBLISHED", pricingModel: "PER_UNIT", unitPriceMinor: 1_500_000, unitSize: 1, unitLabel: "videos", minQuantity: 1, maxQuantity: 10 },
  });
  const draftService = await db.service.create({
    data: { ...base, slug: "ig-draft", name: "Draft service", status: "DRAFT", packages: { create: [{ name: "Only", description: "o", priceMinor: 100_000 }] } },
    include: { packages: true },
  });
  return { platform, category, packageService, unitService, draftService };
}

type CallOpts = { method?: string; body?: unknown; cookie?: string; params?: Record<string, string | string[]>; headers?: Record<string, string>; origin?: string | null; url?: string };

/** Invoke a Next.js route handler directly with a real Request. */
export async function call(handler: (req: Request, ctx: { params: Promise<never> }) => Promise<Response>, opts: CallOpts = {}) {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin !== null && method !== "GET") headers.origin = opts.origin ?? ORIGIN;
  const req = new Request(opts.url ?? `${ORIGIN}/api/test`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const res = await handler(req, { params: Promise.resolve((opts.params ?? {}) as never) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}
