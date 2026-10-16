import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { route } from "@/server/http";
import { beginTwoFactorSetup, changePassword, disableTwoFactor, enableTwoFactor, requestAccountDeletion } from "@/server/auth/account";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("change_password"), currentPassword: z.string().min(1), newPassword: z.string().min(1) }),
  z.object({ action: z.literal("2fa_setup") }),
  z.object({ action: z.literal("2fa_enable"), code: z.string().min(6).max(10) }),
  z.object({ action: z.literal("2fa_disable"), password: z.string().min(1), code: z.string().min(6).max(20) }),
  z.object({ action: z.literal("revoke_session"), sessionId: z.string().min(1) }),
  z.object({ action: z.literal("revoke_other_sessions") }),
  z.object({ action: z.literal("request_deletion"), reason: z.string().max(1000).optional(), confirm: z.literal("DELETE") }),
]);

export const GET = route(
  async ({ auth }) => {
    const sessions = await db.session.findMany({
      where: { userId: auth.user.id, twoFactorPending: false, expiresAt: { gt: new Date() } },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
    return { twoFactorEnabled: auth.user.twoFactorEnabled, sessions: sessions.map((s) => ({ ...s, current: s.id === auth.sessionId })) };
  },
  { auth: "required" },
);

export const POST = route(
  async ({ auth, body, ip }) => {
    const input = await body(schema);
    switch (input.action) {
      case "change_password":
        await changePassword(auth.user, auth.sessionId, input.currentPassword, input.newPassword, ip);
        return { ok: true };
      case "2fa_setup": {
        const { secret, otpauthUrl } = await beginTwoFactorSetup(auth.user);
        const QR = await import("qrcode");
        return { secret, otpauthUrl, qrDataUrl: await QR.toDataURL(otpauthUrl) };
      }
      case "2fa_enable":
        return enableTwoFactor(auth.user, input.code, ip);
      case "2fa_disable":
        await disableTwoFactor(auth.user, input.password, input.code, ip);
        return { ok: true };
      case "revoke_session": {
        if (input.sessionId === auth.sessionId) throw new AppError("BAD_REQUEST", "Use sign out to end your current session");
        await db.session.deleteMany({ where: { id: input.sessionId, userId: auth.user.id } });
        return { ok: true };
      }
      case "revoke_other_sessions":
        await db.session.deleteMany({ where: { userId: auth.user.id, id: { not: auth.sessionId } } });
        return { ok: true };
      case "request_deletion":
        await requestAccountDeletion(auth.user, input.reason);
        return { ok: true };
    }
  },
  { auth: "required", rateLimit: { name: "security", limit: 20, windowSec: 900, by: "user" } },
);
