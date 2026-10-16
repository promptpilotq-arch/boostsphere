import { z } from "zod";
import { route } from "@/server/http";
import { deleteService, saveService, serviceSchema, setServiceStatus } from "@/server/catalog";

export const PUT = route<{ id: string }>(async ({ auth, params, body, ip }) => ({ service: await saveService(auth.user, params.id, await body(serviceSchema), ip) }), {
  permission: "catalog:manage",
});

/** Publish / pause / archive without editing the rest of the service. */
export const POST = route<{ id: string }>(
  async ({ auth, params, body, ip }) => {
    const { status } = await body(z.object({ status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "ARCHIVED"]) }));
    return { service: await setServiceStatus(auth.user, params.id, status, ip) };
  },
  { permission: "catalog:manage" },
);

export const DELETE = route<{ id: string }>(
  async ({ auth, params, ip }) => {
    await deleteService(auth.user, params.id, ip);
    return { deleted: true };
  },
  { permission: "catalog:manage" },
);
