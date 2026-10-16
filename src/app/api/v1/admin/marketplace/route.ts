import { z } from "zod";
import { route } from "@/server/http";
import { moderateListing, moderationSchema, resolveReport, verifySeller } from "@/server/marketplace";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("moderate_listing"), listingId: z.string() }).merge(moderationSchema),
  z.object({ action: z.literal("verify_seller"), sellerId: z.string(), decision: z.enum(["VERIFIED", "REJECTED"]), note: z.string().max(2000).default("") }),
  z.object({ action: z.literal("resolve_report"), reportId: z.string(), outcome: z.enum(["ACTIONED", "DISMISSED"]), resolution: z.string().trim().min(3).max(2000), suspendListing: z.boolean().default(false) }),
]);

/** Listing moderation, seller verification and fraud-report handling. */
export const POST = route(
  async ({ auth, body, ip }) => {
    const input = await body(schema);
    switch (input.action) {
      case "moderate_listing": {
        const { action: _a, listingId, ...rest } = input;
        return { listing: await moderateListing(auth.user, listingId, rest, ip) };
      }
      case "verify_seller":
        return { seller: await verifySeller(auth.user, input.sellerId, input.decision, input.note, ip) };
      case "resolve_report":
        return { report: await resolveReport(auth.user, input.reportId, input.outcome, input.resolution, input.suspendListing, ip) };
    }
  },
  { permission: "marketplace:moderate" },
);
