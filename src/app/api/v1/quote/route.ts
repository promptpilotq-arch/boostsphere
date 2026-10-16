import { route } from "@/server/http";
import { quote, quoteSchema } from "@/server/orders";

/** Server-side price calculation for the checkout preview. */
export const POST = route(
  async ({ body, auth }) => {
    const input = await body(quoteSchema);
    return { quote: await quote(input, auth?.user.id ?? null) };
  },
  { rateLimit: { name: "quote", limit: 120, windowSec: 60 } },
);
