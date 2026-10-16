import { z } from "zod";
import { db } from "@/lib/db";
import { route } from "@/server/http";

// Only safe, non-secret fields are ever returned (no password hash, 2FA secret or backup codes).
export const GET = route(
  async ({ auth }) => {
    const profile = await db.userProfile.findUnique({ where: { userId: auth.user.id } });
    const u = await db.user.findUniqueOrThrow({ where: { id: auth.user.id }, select: { referralCode: true, createdAt: true } });
    return { user: { ...auth.user, referralCode: u.referralCode, createdAt: u.createdAt }, profile };
  },
  { auth: "required" },
);

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number").optional().nullable().or(z.literal("").transform(() => null)),
  country: z.string().length(2).default("NG"),
  preferredCurrency: z.string().length(3).default("NGN"),
  marketingOptIn: z.boolean().default(false),
});

export const PATCH = route(
  async ({ auth, body }) => {
    const input = await body(profileSchema);
    const profile = await db.userProfile.upsert({ where: { userId: auth.user.id }, create: { userId: auth.user.id, ...input }, update: input });
    return { profile };
  },
  { auth: "required" },
);
