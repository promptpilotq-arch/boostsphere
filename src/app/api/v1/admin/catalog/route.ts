import { z } from "zod";
import { db } from "@/lib/db";
import { route } from "@/server/http";
import { categorySchema, couponSchema, platformSchema, saveCategory, saveCoupon, savePlatform } from "@/server/catalog";
import { audit } from "@/server/audit";

const faqSchema = z.object({ platformId: z.string().nullable().optional(), question: z.string().trim().min(5).max(200), answer: z.string().trim().min(5).max(3000), sortOrder: z.coerce.number().int().default(0), published: z.boolean().default(true) });

const schema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("platform"), id: z.string().nullable().optional(), data: platformSchema }),
  z.object({ entity: z.literal("category"), id: z.string().nullable().optional(), data: categorySchema }),
  z.object({ entity: z.literal("coupon"), id: z.string().nullable().optional(), data: couponSchema }),
  z.object({ entity: z.literal("faq"), id: z.string().nullable().optional(), data: faqSchema }),
  z.object({ entity: z.literal("faq_delete"), id: z.string() }),
]);

/** Create or update platforms, categories, coupons and FAQ content. */
export const POST = route(
  async ({ auth, body, ip }) => {
    const input = await body(schema);
    const id = "id" in input ? (input.id ?? null) : null;
    switch (input.entity) {
      case "platform":
        return { platform: await savePlatform(auth.user, id, input.data, ip) };
      case "category":
        return { category: await saveCategory(auth.user, id, input.data, ip) };
      case "coupon":
        return { coupon: await saveCoupon(auth.user, id, input.data, ip) };
      case "faq": {
        const faq = id ? await db.faqItem.update({ where: { id }, data: input.data }) : await db.faqItem.create({ data: input.data });
        await audit({ actorId: auth.user.id, action: "faq.saved", entityType: "faq", entityId: faq.id, ip });
        return { faq };
      }
      case "faq_delete":
        await db.faqItem.delete({ where: { id: input.id } });
        return { deleted: true };
    }
  },
  { permission: "catalog:manage" },
);
