import type { RoleKey } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { can } from "@/server/auth/rbac";
import { route } from "@/server/http";
import { audit } from "@/server/audit";
import { processAccountDeletion } from "@/server/auth/account";
import { creditWallet } from "@/server/wallet";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_roles"), roles: z.array(z.enum(["CUSTOMER", "SELLER", "SUPPORT", "ADMIN", "SUPER_ADMIN"])).min(1) }),
  z.object({ action: z.literal("set_status"), status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(3).max(500) }),
  z.object({
    action: z.literal("wallet_adjustment"),
    currency: z.string().length(3).default("NGN"),
    bucket: z.enum(["AVAILABLE", "PROMOTIONAL"]),
    amountMinor: z.coerce.number().int().refine((n) => n !== 0, "Amount cannot be zero"),
    reason: z.string().trim().min(5, "A reason is required for every adjustment").max(500),
    idempotencyKey: z.string().min(8).max(80),
  }),
  z.object({ action: z.literal("process_deletion"), requestId: z.string(), approve: z.boolean() }),
]);

const PRIVILEGED: RoleKey[] = ["ADMIN", "SUPER_ADMIN"];

export const POST = route<{ id: string }>(
  async ({ auth, params, body, ip }) => {
    const input = await body(schema);
    const target = await db.user.findUnique({ where: { id: params.id }, include: { roles: { include: { role: true } } } });
    if (!target) throw notFound("User");
    const current = target.roles.map((r) => r.role.key);

    switch (input.action) {
      case "set_roles": {
        const touchesPrivileged = [...current, ...input.roles].some((r) => PRIVILEGED.includes(r)) && [...current].sort().join() !== [...input.roles].sort().join();
        if (touchesPrivileged && !can(auth.user.roles, "roles:grant_admin")) throw forbidden("Only a super administrator can grant or remove admin roles");
        if (target.id === auth.user.id) throw new AppError("CONFLICT", "You cannot change your own roles");
        const roles = await db.role.findMany({ where: { key: { in: input.roles } } });
        await db.$transaction([db.userRole.deleteMany({ where: { userId: target.id } }), db.userRole.createMany({ data: roles.map((r) => ({ userId: target.id, roleId: r.id, grantedBy: auth.user.id })) })]);
        await audit({ actorId: auth.user.id, action: "user.roles_changed", entityType: "user", entityId: target.id, metadata: { from: current, to: input.roles }, ip });
        return { ok: true };
      }
      case "set_status": {
        if (current.some((r) => PRIVILEGED.includes(r)) && !can(auth.user.roles, "roles:grant_admin")) throw forbidden("Only a super administrator can suspend an administrator");
        if (target.id === auth.user.id) throw new AppError("CONFLICT", "You cannot suspend yourself");
        await db.user.update({ where: { id: target.id }, data: { status: input.status } });
        if (input.status === "SUSPENDED") await db.session.deleteMany({ where: { userId: target.id } });
        await audit({ actorId: auth.user.id, action: `user.${input.status.toLowerCase()}`, entityType: "user", entityId: target.id, metadata: { reason: input.reason }, ip });
        return { ok: true };
      }
      case "wallet_adjustment": {
        if (!can(auth.user.roles, "wallet:adjust")) throw forbidden();
        const posted = await db.$transaction(async (tx) => {
          const ok = await creditWallet(tx, target.id, input.currency, input.amountMinor, input.bucket, "ADMIN_ADJUSTMENT", `Adjustment: ${input.reason}`, `admin-adj:${input.idempotencyKey}`, undefined, auth.user.id);
          if (ok) await audit({ actorId: auth.user.id, action: "wallet.adjusted", entityType: "user", entityId: target.id, metadata: { amountMinor: input.amountMinor, bucket: input.bucket, reason: input.reason }, ip }, tx);
          return ok;
        });
        return { posted, duplicate: !posted };
      }
      case "process_deletion":
        await processAccountDeletion(auth.user, input.requestId, input.approve, ip);
        return { ok: true };
    }
  },
  { permission: "users:manage" },
);
