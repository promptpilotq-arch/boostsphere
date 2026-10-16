import { db } from "@/lib/db";
import { pageMeta, paginate, route } from "@/server/http";
import { createTicket, ticketSchema } from "@/server/support";

export const GET = route(
  async ({ auth, query }) => {
    const { page, pageSize, skip, take } = paginate(query);
    const where = { userId: auth.user.id };
    const [items, total] = await Promise.all([db.supportTicket.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }), db.supportTicket.count({ where })]);
    return { items, meta: pageMeta(page, pageSize, total) };
  },
  { auth: "required" },
);

export const POST = route(async ({ auth, body }) => ({ ticket: await createTicket(auth.user, await body(ticketSchema)) }), {
  auth: "required",
  rateLimit: { name: "tickets", limit: 10, windowSec: 3600, by: "user" },
});
