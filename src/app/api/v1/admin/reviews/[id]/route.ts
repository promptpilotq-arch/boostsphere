import { z } from "zod";
import { route } from "@/server/http";
import { moderateReview } from "@/server/support";

export const POST = route<{ id: string }>(
  async ({ auth, params, body, ip }) => {
    const { status, featured } = await body(z.object({ status: z.enum(["APPROVED", "REJECTED"]), featured: z.boolean().default(false) }));
    return { review: await moderateReview(auth.user, params.id, status, featured, ip) };
  },
  { permission: "reviews:moderate" },
);
