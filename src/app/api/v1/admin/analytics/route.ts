import { route } from "@/server/http";
import { getAnalytics } from "@/server/analytics";

export const GET = route(
  async ({ query }) => ({ analytics: await getAnalytics({ days: Math.min(365, Number(query.get("days")) || 30), currency: query.get("currency") ?? "NGN" }) }),
  { permission: "analytics:read" },
);
