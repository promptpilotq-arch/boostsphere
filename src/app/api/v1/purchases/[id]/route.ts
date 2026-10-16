import { z } from "zod";
import { AppError } from "@/lib/errors";
import { idempotent, route } from "@/server/http";
import { addDisputeMessage, cancelUnpaidPurchase, disputeSchema, getPurchaseForViewer, openDispute, reviewMilestone, submitMilestone } from "@/server/marketplace";
import { saveFile } from "@/server/storage";

export const GET = route<{ id: string }>(
  async ({ auth, params }) => {
    const { purchase, role } = await getPurchaseForViewer(params.id, auth.user);
    return { purchase, role };
  },
  { auth: "required" },
);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("submit_milestone"), milestoneId: z.string(), evidenceNote: z.string().trim().min(10).max(4000), evidenceKey: z.string().optional().nullable() }),
  z.object({ action: z.literal("confirm_milestone"), milestoneId: z.string() }),
  z.object({ action: z.literal("reject_milestone"), milestoneId: z.string(), note: z.string().trim().min(5).max(2000) }),
  z.object({ action: z.literal("open_dispute") }).merge(disputeSchema),
  z.object({ action: z.literal("dispute_message"), disputeId: z.string(), body: z.string().trim().min(2).max(4000) }),
]);

/**
 * Buyer/seller/staff actions on a purchase. Multipart requests upload an evidence file and
 * return its private storage key, which is then referenced by submit_milestone.
 */
export const POST = route<{ id: string }>(
  async (ctx) => {
    const user = ctx.auth.user;
    if ((ctx.req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      await getPurchaseForViewer(ctx.params.id, user); // authorization
      const file = (await ctx.req.formData()).get("file");
      if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "No file uploaded");
      return saveFile("evidence", file);
    }
    const input = await ctx.body(actionSchema);
    switch (input.action) {
      case "cancel":
        await cancelUnpaidPurchase(ctx.params.id, user);
        return { ok: true };
      case "submit_milestone":
        if (input.evidenceKey && !input.evidenceKey.startsWith("evidence/")) throw new AppError("VALIDATION_ERROR", "Invalid evidence file");
        await submitMilestone(user, ctx.params.id, input.milestoneId, input.evidenceNote, input.evidenceKey);
        return { ok: true };
      case "confirm_milestone":
        await reviewMilestone(user, ctx.params.id, input.milestoneId, "CONFIRM");
        return { ok: true };
      case "reject_milestone":
        await reviewMilestone(user, ctx.params.id, input.milestoneId, "REJECT", input.note);
        return { ok: true };
      case "open_dispute":
        return idempotent(ctx, `purchase.dispute.${ctx.params.id}`, input, async () => ({ dispute: await openDispute(user, ctx.params.id, input) }));
      case "dispute_message":
        return { message: await addDisputeMessage(user, input.disputeId, input.body) };
    }
  },
  { auth: "required", rateLimit: { name: "purchase-action", limit: 60, windowSec: 600, by: "user" } },
);
