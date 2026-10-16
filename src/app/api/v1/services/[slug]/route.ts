import { notFound } from "@/lib/errors";
import { parseInputFields } from "@/lib/service-inputs";
import { route } from "@/server/http";
import { getPublishedService } from "@/server/catalog";

export const GET = route<{ slug: string }>(async ({ params }) => {
  const s = await getPublishedService(params.slug);
  if (!s) throw notFound("Service");
  const { providerKey: _internal, ...rest } = s;
  return { service: { ...rest, inputFields: parseInputFields(s.inputFields) } };
});
