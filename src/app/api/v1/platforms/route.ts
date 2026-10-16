import { route } from "@/server/http";
import { listPublishedPlatforms } from "@/server/catalog";

export const GET = route(async () => {
  const platforms = await listPublishedPlatforms();
  return { items: platforms.map(({ id, slug, name, tagline, iconKey, brandColor, marketplaceEnabled }) => ({ id, slug, name, tagline, iconKey, brandColor, marketplaceEnabled })) };
});
