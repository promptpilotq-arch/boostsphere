import { z } from "zod";
import { idempotent, route } from "@/server/http";
import { cancelOrder, getOrderForViewer, provideOrderInfo } from "@/server/orders";
import { refundRequestSchema, requestOrderRefund } from "@/server/refunds";

export const GET = route<{ id: string }>(
  async ({ auth, params }) => {
    const order = await getOrderForViewer(params.id, auth.user);
    // Strip internal payment fields not needed by customers.
    return {
      order: {
        ...order,
        payments: order.payments.map((p) => ({ id: p.id, reference: p.reference, provider: p.provider, status: p.status, amountMinor: p.amountMinor, currency: p.currency, createdAt: p.createdAt, verifiedAt: p.verifiedAt })),
      },
    };
  },
  { auth: "required" },
);

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("provide_info"), message: z.string().trim().min(2).max(4000) }),
  z.object({ action: z.literal("request_refund") }).merge(refundRequestSchema),
]);

/** Customer actions on their own order. */
export const POST = route<{ id: string }>(
  async (ctx) => {
    const input = await ctx.body(actionSchema);
    const user = ctx.auth.user;
    switch (input.action) {
      case "cancel":
        return { order: await cancelOrder(ctx.params.id, user) };
      case "provide_info":
        return { order: await provideOrderInfo(ctx.params.id, user, input.message) };
      case "request_refund":
        return idempotent(ctx, `orders.refund.${ctx.params.id}`, input, async () => ({ refund: await requestOrderRefund(user, ctx.params.id, input) }));
    }
  },
  { auth: "required" },
);
