import type { RoleKey, User } from "@prisma/client";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { AppError, forbidden } from "@/lib/errors";
import { can, type Permission } from "./rbac";

export const SESSION_COOKIE = "bs_session";
const SESSION_DAYS = 30;
const PENDING_2FA_MINUTES = 10;

export type AuthUser = Pick<User, "id" | "email" | "status" | "emailVerifiedAt" | "twoFactorEnabled"> & {
  roles: RoleKey[];
  displayName: string;
};

export type Auth = { user: AuthUser; sessionId: string } | null;

export async function createSession(userId: string, opts: { ip?: string | null; userAgent?: string | null; twoFactorPending?: boolean } = {}) {
  const token = randomToken(32);
  const ms = opts.twoFactorPending ? PENDING_2FA_MINUTES * 60_000 : SESSION_DAYS * 86_400_000;
  const session = await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      twoFactorPending: opts.twoFactorPending ?? false,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + ms),
    },
  });
  return { token, session };
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export const clearedSessionCookie = { name: SESSION_COOKIE, value: "", httpOnly: true, path: "/", maxAge: 0, sameSite: "lax" as const };

/** Resolve a raw session token to an authenticated user. Pending-2FA sessions only resolve when allowPending is set. */
export async function authFromToken(token: string | undefined | null, opts: { allowPending?: boolean } = {}): Promise<Auth> {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { roles: { include: { role: true } }, profile: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.twoFactorPending && !opts.allowPending) return null;
  const u = session.user;
  if (u.status === "SUSPENDED" || u.status === "DELETED") return null;
  // Sliding activity timestamp, written at most every 10 minutes.
  if (Date.now() - session.lastSeenAt.getTime() > 600_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return {
    sessionId: session.id,
    user: {
      id: u.id,
      email: u.email,
      status: u.status,
      emailVerifiedAt: u.emailVerifiedAt,
      twoFactorEnabled: u.twoFactorEnabled,
      roles: u.roles.map((r) => r.role.key),
      displayName: u.profile?.displayName ?? u.email.split("@")[0],
    },
  };
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export const authFromRequest = (req: Request, opts?: { allowPending?: boolean }) => authFromToken(readCookie(req, SESSION_COOKIE), opts);

export function requireAuth(auth: Auth): NonNullable<Auth> {
  if (!auth) throw new AppError("UNAUTHENTICATED", "Please sign in to continue");
  return auth;
}

export function requirePermission(auth: Auth, permission: Permission): NonNullable<Auth> {
  const a = requireAuth(auth);
  if (!can(a.user.roles, permission)) throw forbidden();
  return a;
}

export async function revokeSession(sessionId: string) {
  await db.session.delete({ where: { id: sessionId } }).catch(() => {});
}
