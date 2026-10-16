import { route } from "@/server/http";
import { createListing, listingInputSchema } from "@/server/marketplace";

export const POST = route(
  async ({ auth, body }) => {
    const input = await body(listingInputSchema);
    return { listing: await createListing(auth.user, input) };
  },
  { auth: "required", rateLimit: { name: "listing-create", limit: 20, windowSec: 3600, by: "user" } },
);
