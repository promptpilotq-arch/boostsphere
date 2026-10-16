import { z } from "zod";
import { route } from "@/server/http";
import { decideWithdrawal, payoutDecisionSchema, revealPayoutAccountNumber } from "@/server/payouts";

const schema = z.union([payoutDecisionSchema, z.object({ decision: z.literal("REVEAL_ACCOUNT") })]);

/** Process a withdrawal: mark PAID (after sending the bank transfer), REJECTED, or reveal the account number (audited). */
export const POST = route<{ id: string }>(
  async ({ auth, params, body, ip }) => {
    const input = await body(schema);
    if (input.decision === "REVEAL_ACCOUNT") return { accountNumber: await revealPayoutAccountNumber(auth.user, params.id, ip) };
    const p = await decideWithdrawal(auth.user, params.id, input, ip);
    return { payout: { id: p.id, status: p.status } };
  },
  { permission: "payouts:manage" },
);
