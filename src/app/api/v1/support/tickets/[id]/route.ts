import { route } from "@/server/http";
import { getTicketForViewer, replySchema, replyToTicket } from "@/server/support";

export const GET = route<{ id: string }>(async ({ auth, params }) => ({ ticket: await getTicketForViewer(params.id, auth.user) }), { auth: "required" });

export const POST = route<{ id: string }>(
  async ({ auth, params, body, ip }) => {
    await replyToTicket(auth.user, params.id, await body(replySchema), ip);
    return { ok: true };
  },
  { auth: "required", rateLimit: { name: "ticket-reply", limit: 30, windowSec: 600, by: "user" } },
);
