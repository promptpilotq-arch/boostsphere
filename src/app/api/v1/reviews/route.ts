import { db } from "@/lib/db";
import { route } from "@/server/http";
import { reviewSchema, submitReview } from "@/server/support";

/** Public: approved reviews only. Reviews come exclusively from customers with completed orders. */
export const GET = route(async ({ query }) => {
  const serviceId = query.get("serviceId");
  const items = await db.review.findMany({
    where: { status: "APPROVED", ...(serviceId ? { serviceId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, rating: true, title: true, body: true, createdAt: true, user: { select: { profile: { select: { displayName: true } } } } },
  });
  return { items: items.map(({ user, ...r }) => ({ ...r, author: user.profile?.displayName?.split(" ")[0] ?? "Customer" })) };
});

export const POST = route(
  async ({ auth, body }) => ({ review: await submitReview(auth.user, await body(reviewSchema)) }),
  { auth: "required", rateLimit: { name: "reviews", limit: 10, windowSec: 3600, by: "user" } },
);
