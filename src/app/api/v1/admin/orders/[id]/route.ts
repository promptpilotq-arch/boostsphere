import { route } from "@/server/http";
import { staffOrderUpdateSchema, staffUpdateOrder } from "@/server/orders";

/** Fulfillment queue actions: status change, assignment, internal notes, completion evidence. */
export const PATCH = route<{ id: string }>(
  async ({ auth, params, body, ip }) => ({ order: await staffUpdateOrder(params.id, auth.user, await body(staffOrderUpdateSchema), ip) }),
  { permission: "orders:manage" },
);
