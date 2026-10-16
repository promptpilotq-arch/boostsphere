/**
 * Development seed data. Contains NO real customers, reviews, metrics or secrets.
 * Demo account password comes from SEED_PASSWORD (see README "Demo accounts"); never run in production.
 */
import { PrismaClient, type FulfillmentType, type RoleKey } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "DevOnly-Passw0rd";
const naira = (n: number) => n * 100; // NGN → kobo

const ROLES: { key: RoleKey; name: string; description: string }[] = [
  { key: "CUSTOMER", name: "Customer", description: "Can order services and buy marketplace listings" },
  { key: "SELLER", name: "Seller", description: "Can list eligible digital assets for sale" },
  { key: "SUPPORT", name: "Support agent", description: "Handles tickets, order fulfillment and disputes" },
  { key: "ADMIN", name: "Administrator", description: "Manages catalog, payments, users and settings" },
  { key: "SUPER_ADMIN", name: "Super administrator", description: "Full access, including granting admin roles" },
];

type SvcSeed = {
  slug: string;
  category: string;
  name: string;
  summary: string;
  description: string;
  fulfillment: FulfillmentType;
  duration: string;
  urlHosts: string[];
  urlLabel: string;
  packages: [string, number, string[]][];
  featured?: boolean;
  perUnit?: { unitPrice: number; unitSize: number; unitLabel: string; min: number; max: number };
};

const P = (slug: string, name: string, iconKey: string, brandColor: string, tagline: string, hosts: string[], marketplace: boolean, transfer: string) => ({
  slug,
  name,
  iconKey,
  brandColor,
  tagline,
  hosts,
  marketplace,
  transfer,
});

const PLATFORMS = [
  P("instagram", "Instagram", "instagram", "#E4405F", "Reach, creator promotion and content strategy for Instagram", ["instagram.com"], true, "Instagram professional accounts linked to a Meta Business portfolio can have business assets reassigned via Meta Business Settings. Personal account credentials must never be exchanged."),
  P("tiktok", "TikTok", "tiktok", "#000000", "Video promotion and creator marketing for TikTok", ["tiktok.com"], false, ""),
  P("youtube", "YouTube", "youtube", "#FF0000", "Video advertising, channel promotion and optimization", ["youtube.com", "youtu.be"], true, "YouTube channels linked to a Brand Account can transfer primary ownership through Google's Brand Account permissions (Manage permissions → Transfer ownership)."),
  P("facebook", "Facebook", "facebook", "#0866FF", "Page promotion, post advertising and content strategy", ["facebook.com", "fb.com"], true, "Facebook Pages can be transferred by granting full control via Page access in Meta Business Suite and the original owner then removing themselves."),
  P("x", "X", "x", "#000000", "Promoted posts, community growth and profile strategy for X", ["x.com", "twitter.com"], false, ""),
  P("telegram", "Telegram", "telegram", "#26A5E4", "Channel promotion and community development for Telegram", ["t.me", "telegram.me"], true, "Telegram channel ownership can be transferred by the owner via Channel Info → Administrators → Transfer Channel Ownership (requires 2FA on the owner's account)."),
  P("twitch", "Twitch", "twitch", "#9146FF", "Stream promotion and channel development for Twitch", ["twitch.tv"], false, ""),
  P("snapchat", "Snapchat", "snapchat", "#FFFC00", "Snap Ads setup and public profile optimization", ["snapchat.com"], false, ""),
  P("linkedin", "LinkedIn", "linkedin", "#0A66C2", "B2B content promotion and company page strategy", ["linkedin.com"], true, "LinkedIn Company Pages can be handed over by assigning the Super admin role to the buyer in Page admin tools, after which the seller removes their own admin role."),
  P("pinterest", "Pinterest", "pinterest", "#BD081C", "Promoted Pins and board strategy for Pinterest", ["pinterest.com", "pin.it"], false, ""),
];

const REFUND_POLICY =
  "Full refund if work has not started. Once a campaign or engagement has begun, a pro-rated refund for undelivered work may be issued at our discretion. Advertising spend already paid to a platform is non-refundable.";
const TERMS =
  "You confirm you own or are authorized to promote the linked content and that it complies with the platform's community guidelines and advertising policies. We never request passwords, login codes or session data. Promotional delivery increases visibility to real audiences; specific outcomes are not guaranteed.";

function servicesFor(platform: (typeof PLATFORMS)[number]): SvcSeed[] {
  const n = platform.name;
  const common: SvcSeed[] = [
    {
      slug: `${platform.slug}-profile-optimization`,
      category: "optimization",
      name: `${n} Profile Optimization`,
      summary: `Expert review of your ${n} profile, bio, visuals and content mix with an actionable improvement plan.`,
      description: `A strategist audits your public ${n} presence — profile, bio, highlights or pinned content, posting cadence and content formats — and delivers a written plan with prioritized recommendations. You stay in full control of your account; we only review public information.`,
      fulfillment: "DIGITAL_DELIVERABLE",
      duration: "3–5 business days",
      urlHosts: platform.hosts,
      urlLabel: `Public ${n} profile URL`,
      packages: [
        ["Essentials", 25000, ["Profile & bio audit", "Content mix review", "Written recommendations"]],
        ["Complete", 60000, ["Everything in Essentials", "Competitor benchmark (3 accounts)", "30-day content calendar", "45-min review call"]],
      ],
    },
    {
      slug: `${platform.slug}-growth-consultation`,
      category: "consulting",
      name: `${n} Growth & Analytics Consultation`,
      summary: `One-to-one session with a ${n} strategist on audience growth, analytics and content planning.`,
      description: `Book a live consultation to review your ${n} analytics (shared by you via screen share — never via login), discuss audience development and leave with a clear plan.`,
      fulfillment: "CONSULTATION",
      duration: "Scheduled within 5 business days",
      urlHosts: platform.hosts,
      urlLabel: `Public ${n} profile URL`,
      packages: [
        ["60-minute session", 45000, ["Live video call", "Analytics walkthrough", "Session summary"]],
        ["Monthly advisory", 150000, ["Four weekly sessions", "Async chat support", "Monthly performance report"]],
      ],
    },
  ];
  const promo: SvcSeed = {
    slug: `${platform.slug}-content-promotion`,
    category: "promotion",
    name: `${n} Content Promotion Campaign`,
    summary: `We set up and manage an official ${n} ads campaign to put your public content in front of a relevant audience.`,
    description: `Our team creates and manages a promotion campaign through ${n}'s official advertising tools, targeting audiences by interest and location. Your package covers campaign management; the ad budget shown is spent on the platform on your behalf. You receive the campaign report from the platform's ads manager on completion.`,
    fulfillment: "AD_CAMPAIGN",
    duration: "7–14 day campaign",
    urlHosts: platform.hosts,
    urlLabel: `Link to the public ${n} post or profile to promote`,
    featured: ["instagram", "tiktok", "youtube"].includes(platform.slug),
    packages: [
      ["Starter", 50000, ["7-day campaign", "₦30,000 ad budget included", "1 audience segment", "Platform campaign report"]],
      ["Growth", 120000, ["14-day campaign", "₦80,000 ad budget included", "3 audience segments", "Creative recommendations", "Platform campaign report"]],
      ["Scale", 300000, ["30-day campaign", "₦220,000 ad budget included", "A/B creative testing", "Weekly reporting", "Dedicated campaign manager"]],
    ],
  };
  const creator: SvcSeed = {
    slug: `${platform.slug}-creator-marketing`,
    category: "creator-marketing",
    name: `${n} Creator Marketing Campaign`,
    summary: `We match your brand with relevant ${n} creators for disclosed, paid partnership content.`,
    description: `We source and brief independent ${n} creators in your niche for clearly disclosed paid partnerships (#ad / paid partnership labels as required by the platform and advertising regulators). You approve every creator before anything goes live.`,
    fulfillment: "MANUAL",
    duration: "2–4 weeks",
    urlHosts: platform.hosts,
    urlLabel: `Your brand's public ${n} profile URL`,
    packages: [
      ["Micro creators", 250000, ["3 micro-creator posts", "Creator shortlist for approval", "Disclosure compliance check", "Results summary"]],
      ["Campaign", 750000, ["8 creator posts", "Brief & content review", "Usage rights negotiation", "Results report"]],
    ],
  };
  const list = [promo, ...common];
  if (["instagram", "tiktok", "youtube", "facebook"].includes(platform.slug)) list.push(creator);
  if (platform.slug === "youtube") {
    list.push({
      slug: "youtube-thumbnail-title-optimization",
      category: "optimization",
      name: "YouTube Thumbnail & Title Optimization",
      summary: "Designed thumbnails and researched titles for your videos.",
      description: "Our designers create custom thumbnails and our strategists propose search-informed titles and descriptions for the videos you choose. Priced per video.",
      fulfillment: "DIGITAL_DELIVERABLE",
      duration: "2–4 business days",
      urlHosts: platform.hosts,
      urlLabel: "Channel URL",
      packages: [],
      perUnit: { unitPrice: 15000, unitSize: 1, unitLabel: "videos", min: 1, max: 50 },
    });
  }
  return list;
}

const CATEGORY_NAMES: Record<string, [string, string]> = {
  promotion: ["Promotion & Ads", "Campaigns delivered through the platform's official advertising tools."],
  "creator-marketing": ["Creator Marketing", "Disclosed paid partnerships with independent creators."],
  optimization: ["Profile & Content Optimization", "Expert audits and deliverables to improve your presence."],
  consulting: ["Analytics & Consulting", "Strategy sessions with experienced specialists."],
};

async function main() {
  for (const r of ROLES) await db.role.upsert({ where: { key: r.key }, create: r, update: { name: r.name, description: r.description } });

  for (const [i, p] of PLATFORMS.entries()) {
    const platform = await db.socialPlatform.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        description: `Promotion, optimization and consulting services for ${p.name}, delivered through authorized methods only.`,
        iconKey: p.iconKey,
        brandColor: p.brandColor,
        sortOrder: i,
        marketplaceEnabled: p.marketplace,
        transferGuidance: p.transfer,
      },
      update: {},
    });
    const cats: Record<string, string> = {};
    const services = servicesFor(p);
    for (const [ci, key] of [...new Set(services.map((s) => s.category))].entries()) {
      const [name, description] = CATEGORY_NAMES[key];
      const c = await db.serviceCategory.upsert({
        where: { platformId_slug: { platformId: platform.id, slug: key } },
        create: { platformId: platform.id, slug: key, name, description, sortOrder: ci },
        update: {},
      });
      cats[key] = c.id;
    }
    for (const [si, s] of services.entries()) {
      const exists = await db.service.findUnique({ where: { slug: s.slug } });
      if (exists) continue;
      await db.service.create({
        data: {
          slug: s.slug,
          platformId: platform.id,
          categoryId: cats[s.category],
          name: s.name,
          summary: s.summary,
          description: s.description,
          pricingModel: s.perUnit ? "PER_UNIT" : "PACKAGE",
          unitPriceMinor: s.perUnit ? naira(s.perUnit.unitPrice) : null,
          unitSize: s.perUnit?.unitSize ?? 1,
          unitLabel: s.perUnit?.unitLabel ?? "unit",
          minQuantity: s.perUnit?.min ?? null,
          maxQuantity: s.perUnit?.max ?? null,
          fulfillmentType: s.fulfillment,
          estimatedDuration: s.duration,
          inputFields: [
            { key: "target_url", label: s.urlLabel, type: "url", required: true, allowedHosts: s.urlHosts, placeholder: `https://${s.urlHosts[0]}/…` },
            { key: "goals", label: "What would you like to achieve?", type: "textarea", required: false, maxLength: 1000 },
            ...(s.fulfillment === "AD_CAMPAIGN"
              ? [{ key: "target_location", label: "Primary audience location", type: "select", required: true, options: ["Nigeria", "West Africa", "Africa", "United Kingdom", "United States", "Global"] }]
              : []),
          ],
          refundPolicy: REFUND_POLICY,
          terms: TERMS,
          eligibility: `Content must be public, owned by or licensed to you, and comply with ${p.name}'s community guidelines and advertising policies. Restricted categories (e.g. gambling, adult, political ads without authorization) are not accepted.`,
          deliveryNotes: "You'll receive progress updates in your dashboard. Our team may message you if we need more information.",
          status: "PUBLISHED",
          featured: s.featured ?? si === 0,
          sortOrder: si,
          packages: { create: s.packages.map(([name, price, features], pi) => ({ name, description: features[0], priceMinor: naira(price), features, sortOrder: pi })) },
        },
      });
    }
    // Platform FAQs
    if (!(await db.faqItem.count({ where: { platformId: platform.id } }))) {
      await db.faqItem.createMany({
        data: [
          { platformId: platform.id, question: `Do you need my ${p.name} password?`, answer: `No. We never ask for passwords, login codes or session data. Every ${p.name} service works with public links or platform-official sharing and advertising tools.`, sortOrder: 0 },
          { platformId: platform.id, question: "Do you guarantee followers or views?", answer: "No. Promotion places your content in front of real, relevant audiences through official tools. How people respond is up to them, so we do not guarantee follower, view or sales numbers.", sortOrder: 1 },
          { platformId: platform.id, question: "How do I track my order?", answer: "Every order has a status timeline in your dashboard, and you'll get notifications as it moves forward.", sortOrder: 2 },
        ],
      });
    }
  }

  if (!(await db.faqItem.count({ where: { platformId: null } }))) {
    await db.faqItem.createMany({
      data: [
        { question: "What does BoostSphere offer?", answer: "Social media promotion through official advertising tools, creator marketing, profile optimization and consulting — plus a moderated marketplace for digital assets whose transfer the platform permits.", sortOrder: 0 },
        { question: "Do you sell followers, likes or bot engagement?", answer: "No. We do not provide artificial engagement, bots, fake accounts or any service that breaks platform rules.", sortOrder: 1 },
        { question: "Which payment methods do you accept?", answer: "Payments are processed by licensed payment providers such as Paystack. Available methods appear at checkout. We never see or store your card details.", sortOrder: 2 },
        { question: "How do marketplace transfers work?", answer: "Sellers must be verified and listings are moderated. After payment, ownership moves through the platform's own transfer tools in documented steps. Seller proceeds are held by BoostSphere until the transfer is verified. This is a platform settlement hold, not a licensed escrow service.", sortOrder: 3 },
        { question: "Can I get a refund?", answer: "Each service lists its refund policy. You can request a refund from the order page; our team reviews every request. See the Refund Policy for details.", sortOrder: 4 },
      ],
    });
  }

  // Demo coupon
  await db.coupon.upsert({ where: { code: "WELCOME10" }, create: { code: "WELCOME10", description: "10% off your first order (demo)", type: "PERCENT", value: 1000, maxDiscountMinor: naira(20000), perUserLimit: 1 }, update: {} });

  // Demo users (development only)
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  const roleId = async (k: RoleKey) => (await db.role.findUniqueOrThrow({ where: { key: k } })).id;
  async function demoUser(email: string, name: string, roles: RoleKey[], code: string) {
    const u = await db.user.upsert({
      where: { email },
      create: { email, passwordHash: hash, emailVerifiedAt: new Date(), referralCode: code, profile: { create: { displayName: name } } },
      update: {},
    });
    for (const r of roles) await db.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: await roleId(r) } }, create: { userId: u.id, roleId: await roleId(r) }, update: {} });
    return u;
  }
  await demoUser("superadmin@boostsphere.test", "Demo Super Admin", ["CUSTOMER", "SUPER_ADMIN"], "RDEMOSA1");
  await demoUser("admin@boostsphere.test", "Demo Admin", ["CUSTOMER", "ADMIN"], "RDEMOAD1");
  await demoUser("support@boostsphere.test", "Demo Support", ["CUSTOMER", "SUPPORT"], "RDEMOSP1");
  await demoUser("customer@boostsphere.test", "Demo Customer", ["CUSTOMER"], "RDEMOCU1");
  const seller = await demoUser("seller@boostsphere.test", "Demo Seller", ["CUSTOMER", "SELLER"], "RDEMOSE1");

  const sp = await db.sellerProfile.upsert({
    where: { userId: seller.id },
    create: { userId: seller.id, displayName: "Sample Seller Studio", bio: "Sample seller profile for development.", verificationStatus: "VERIFIED", verifiedAt: new Date() },
    update: {},
  });

  if (!(await db.marketplaceListing.count())) {
    const plat = async (slug: string) => (await db.socialPlatform.findUniqueOrThrow({ where: { slug } })).id;
    const samples = [
      { platform: "youtube", title: "[Sample] Cooking channel on a Brand Account", type: "CREATOR", niche: "Food & cooking", price: 1_500_000, audience: 18_000, year: 2019, loc: "Nigeria, Ghana", lang: "English", transfer: "Primary ownership transfer of the Google Brand Account via Manage permissions." },
      { platform: "facebook", title: "[Sample] Local fitness community Page", type: "COMMUNITY", niche: "Fitness", price: 650_000, audience: 9_500, year: 2018, loc: "Lagos, Nigeria", lang: "English", transfer: "Full control granted through Meta Business Suite Page access, then seller removes own access." },
      { platform: "telegram", title: "[Sample] Tech news channel", type: "COMMUNITY", niche: "Technology news", price: 400_000, audience: 6_200, year: 2021, loc: "Nigeria", lang: "English", transfer: "Telegram's built-in Transfer Channel Ownership feature." },
      { platform: "linkedin", title: "[Sample] B2B logistics company Page", type: "BUSINESS", niche: "Logistics", price: 900_000, audience: 3_400, year: 2017, loc: "West Africa", lang: "English", transfer: "Super admin role assigned to buyer in LinkedIn Page admin tools." },
    ];
    for (const [i, s] of samples.entries()) {
      await db.marketplaceListing.create({
        data: {
          slug: `sample-listing-${i + 1}`,
          sellerId: sp.id,
          platformId: await plat(s.platform),
          title: s.title,
          accountType: s.type,
          description: `SAMPLE LISTING FOR DEVELOPMENT — not a real asset. Illustrates how an approved listing is presented. ${s.niche} property with an engaged audience. All figures below are placeholders.`,
          niche: s.niche,
          askingPriceMinor: naira(s.price),
          audienceSize: s.audience,
          audienceSizeVerified: false,
          accountCreatedYear: s.year,
          audienceLocation: s.loc,
          audienceLanguage: s.lang,
          analyticsSummary: "Sample data: monthly reach and engagement trends would appear here after moderator review, with personal data removed.",
          engagementSummary: "Sample data only.",
          transferMethod: s.transfer,
          transferEligibilityConfirmed: true,
          status: "APPROVED",
          reviewedAt: new Date(),
        },
      });
    }
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
