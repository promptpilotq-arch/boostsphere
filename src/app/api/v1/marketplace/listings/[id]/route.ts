import { z } from "zod";
import { AppError, notFound } from "@/lib/errors";
import { isStaff } from "@/server/auth/rbac";
import { idempotent, route } from "@/server/http";
import { getListingForViewer } from "@/server/listings-query";
import { reportListing, reportSchema, startPurchase } from "@/server/marketplace";

export const GET = route<{ id: string }>(async ({ params, auth }) => {
  const r = await getListingForViewer(params.id, auth ? { id: auth.user.id, staff: isStaff(auth.user.roles) } : null);
  if (!r) throw notFound("Listing");
  return { listing: r.listing };
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("purchase"),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the purchase and transfer terms" }) }),
  }),
  z.object({ action: z.literal("report") }).merge(reportSchema),
]);

export const POST = route<{ id: string }>(
  async (ctx) => {
    const input = await ctx.body(actionSchema);
    if (input.action === "report") {
      await reportListing(ctx.auth?.user.id ?? null, ctx.params.id, input);
      return { reported: true };
    }
    if (!ctx.auth) throw new AppError("UNAUTHENTICATED", "Sign in to purchase");
    const user = ctx.auth.user;
    return idempotent(ctx, `listing.purchase.${ctx.params.id}`, input, async () => {
      const p = await startPurchase(user, ctx.params.id);
      return { purchase: { id: p.id, number: p.number, totalMinor: p.totalMinor, currency: p.currency } };
    });
  },
  { rateLimit: { name: "listing-action", limit: 20, windowSec: 600 } },
);
