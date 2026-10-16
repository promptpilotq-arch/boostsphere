import { z } from "zod";
import { db } from "@/lib/db";
import { idempotent, route } from "@/server/http";
import { cancelWithdrawal, payoutAccountSchema, requestWithdrawal, savePayoutAccount, withdrawalSchema } from "@/server/payouts";

/** Payout account (masked) and withdrawal history. The full account number is never returned to the client. */
export const GET = route(
  async ({ auth }) => {
    const [account, requests] = await Promise.all([
      db.payoutAccount.findUnique({ where: { userId: auth.user.id }, select: { bankName: true, accountName: true, accountLast4: true, updatedAt: true } }),
      db.payoutRequest.findMany({
        where: { userId: auth.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, number: true, amountMinor: true, currency: true, status: true, bankName: true, accountLast4: true, transferReference: true, adminNote: true, createdAt: true, processedAt: true },
      }),
    ]);
    return { account, requests };
  },
  { auth: "required" },
);

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_account") }).merge(payoutAccountSchema),
  z.object({ action: z.literal("request") }).merge(withdrawalSchema),
  z.object({ action: z.literal("cancel"), payoutId: z.string().min(1) }),
]);

export const POST = route(
  async (ctx) => {
    const input = await ctx.body(schema);
    switch (input.action) {
      case "save_account":
        return { account: await savePayoutAccount(ctx.auth.user, input, ctx.ip) };
      case "request":
        return idempotent(ctx, "payouts.request", input, async () => {
          const p = await requestWithdrawal(ctx.auth.user, input);
          return { payout: { id: p.id, number: p.number, amountMinor: p.amountMinor, currency: p.currency, status: p.status } };
        });
      case "cancel": {
        const p = await cancelWithdrawal(ctx.auth.user, input.payoutId);
        return { payout: { id: p.id, status: p.status } };
      }
    }
  },
  { auth: "required", rateLimit: { name: "payouts", limit: 20, windowSec: 3600, by: "user" } },
);
