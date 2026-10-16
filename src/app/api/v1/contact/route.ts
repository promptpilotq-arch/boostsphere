import { route } from "@/server/http";
import { contactSchema, submitContact } from "@/server/support";

export const POST = route(
  async ({ body }) => {
    await submitContact(await body(contactSchema));
    return { ok: true };
  },
  { rateLimit: { name: "contact", limit: 5, windowSec: 3600 } },
);
