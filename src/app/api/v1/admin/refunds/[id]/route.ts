import { z } from "zod";
import { route } from "@/server/http";
import { confirmProcessingRefund, decideRefund, refundDecisionSchema } from "@/server/refunds";

const schema = z.union([refundDecisionSchema, z.object({ decision: z.literal("CONFIRM_PROCESSED") })]);

export const POST = route<{ id: string }>(
  async ({ auth, params, body, ip }) => {
    const input = await body(schema);
    if (input.decision === "CONFIRM_PROCESSED") {
      await confirmProcessingRefund(auth.user, params.id, ip);
      return { ok: true };
    }
    return { refund: await decideRefund(auth.user, params.id, input, ip) };
  },
  { permission: "refunds:approve" },
);
