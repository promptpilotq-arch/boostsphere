import { z } from "zod";
import { route } from "@/server/http";
import { getSettings, updateSettingsSection } from "@/server/settings";
import { audit } from "@/server/audit";
import { providerStatuses } from "@/server/payments/registry";

export const GET = route(async () => ({ settings: await getSettings(), paymentProviders: providerStatuses() }), { permission: "settings:manage" });

export const PUT = route(
  async ({ auth, body, ip }) => {
    const { section, value } = await body(z.object({ section: z.enum(["brand", "home", "commerce", "features"]), value: z.unknown() }));
    const saved = await updateSettingsSection(section, value, auth.user.id);
    await audit({ actorId: auth.user.id, action: "settings.updated", entityType: "site_settings", entityId: section, metadata: saved, ip });
    return { section, value: saved };
  },
  { permission: "settings:manage" },
);
