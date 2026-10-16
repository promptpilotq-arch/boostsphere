import { route } from "@/server/http";
import { resolveDispute, resolveDisputeSchema } from "@/server/marketplace";

export const POST = route<{ id: string }>(
  async ({ auth, params, body, ip }) => {
    await resolveDispute(auth.user, params.id, await body(resolveDisputeSchema), ip);
    return { ok: true };
  },
  { permission: "disputes:manage" },
);
