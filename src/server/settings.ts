import { z } from "zod";
import { db } from "@/lib/db";

// Every configurable business setting, with defaults. Admins edit these in /admin/settings.
export const settingsSchema = z.object({
  brand: z.object({
    name: z.string().min(1).max(60),
    tagline: z.string().max(140),
    logoText: z.string().min(1).max(4),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #6d28d9"),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2563eb"),
    supportEmail: z.string().email(),
    companyLegalName: z.string().max(120),
    companyAddress: z.string().max(300),
  }),
  home: z.object({
    heroHeadline: z.string().max(120),
    heroSubtext: z.string().max(300),
    primaryCta: z.string().max(40),
    secondaryCta: z.string().max(40),
    showSampleContentNotice: z.boolean(),
  }),
  commerce: z.object({
    baseCurrency: z.string().length(3),
    taxLabel: z.string().max(30),
    taxRateBps: z.number().int().min(0).max(5000), // 750 = 7.5% (Nigeria VAT)
    taxEnabled: z.boolean(),
    processingFeeBps: z.number().int().min(0).max(2000),
    processingFeeFixedMinor: z.number().int().min(0),
    marketplaceBuyerFeeBps: z.number().int().min(0).max(2000),
    marketplaceSellerCommissionBps: z.number().int().min(0).max(5000),
    orderPaymentWindowHours: z.number().int().min(1).max(168),
    minWithdrawalMinor: z.number().int().min(0),
  }),
  features: z.object({
    walletEnabled: z.boolean(),
    referralsEnabled: z.boolean(),
    referralRewardMinor: z.number().int().min(0),
    marketplaceEnabled: z.boolean(),
    withdrawalsEnabled: z.boolean(),
    registrationsOpen: z.boolean(),
  }),
});

export type SiteSettings = z.infer<typeof settingsSchema>;
export type SettingsSection = keyof SiteSettings;

export const DEFAULT_SETTINGS: SiteSettings = {
  brand: {
    name: "BoostSphere",
    tagline: "Social promotion and verified digital assets",
    logoText: "B",
    primaryColor: "#6d28d9",
    accentColor: "#2563eb",
    supportEmail: "support@example.com",
    companyLegalName: "BoostSphere (operator name to be configured)",
    companyAddress: "Lagos, Nigeria",
  },
  home: {
    heroHeadline: "Grow Your Social Presence. Promote With Confidence.",
    heroSubtext:
      "Discover social media promotion services, creator marketing solutions, and eligible digital assets in one convenient marketplace.",
    primaryCta: "Explore Services",
    secondaryCta: "Browse Marketplace",
    showSampleContentNotice: true,
  },
  commerce: {
    baseCurrency: "NGN",
    taxLabel: "VAT",
    taxRateBps: 750,
    taxEnabled: true,
    processingFeeBps: 0,
    processingFeeFixedMinor: 0,
    marketplaceBuyerFeeBps: 250,
    marketplaceSellerCommissionBps: 1000,
    orderPaymentWindowHours: 48,
    minWithdrawalMinor: 100000,
  },
  features: {
    walletEnabled: true,
    referralsEnabled: true,
    referralRewardMinor: 100000,
    marketplaceEnabled: true,
    withdrawalsEnabled: true,
    registrationsOpen: true,
  },
};

export async function getSettings(): Promise<SiteSettings> {
  const rows = await db.siteSetting.findMany();
  const merged = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
  for (const row of rows) {
    if (row.key in merged && row.value && typeof row.value === "object") {
      merged[row.key] = { ...(merged[row.key] as object), ...(row.value as object) };
    }
  }
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateSettingsSection(section: SettingsSection, value: unknown, actorId: string) {
  const validated = settingsSchema.shape[section].parse(value);
  await db.siteSetting.upsert({
    where: { key: section },
    create: { key: section, value: validated, updatedBy: actorId },
    update: { value: validated, updatedBy: actorId },
  });
  return validated;
}
