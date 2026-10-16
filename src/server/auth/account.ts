import { authenticator } from "otplib";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { decrypt, encrypt, humanId, randomToken, sha256 } from "@/lib/crypto";
import { audit } from "../audit";
import { sendEmail } from "../email";
import { getSettings } from "../settings";
import { creditWallet } from "../wallet";
import { dummyHash, hashPassword, passwordSchema, verifyPassword } from "./password";
import { createSession, type AuthUser } from "./session";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2, "Enter your name").max(60),
  referralCode: z.string().trim().max(20).optional().nullable(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms of Service and Acceptable Use Policy" }) }),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

async function issueToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", ttlMinutes: number) {
  const token = randomToken(32);
  // Invalidate previous unused tokens of the same type.
  await db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await db.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) } });
  return token;
}

async function consumeToken(token: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET") {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) throw new AppError("BAD_REQUEST", "This link is invalid or has expired");
  await db.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return row.userId;
}

export async function sendVerificationEmail(userId: string, email: string) {
  const token = await issueToken(userId, "EMAIL_VERIFICATION", 60 * 24);
  await sendEmail(email, "Verify your email address", `Welcome! Confirm your email address to start ordering:\n\n${appUrl()}/verify-email?token=${token}\n\nThis link expires in 24 hours.`);
}

export async function register(input: z.infer<typeof registerSchema>, ip?: string) {
  const settings = await getSettings();
  if (!settings.features.registrationsOpen) throw new AppError("FORBIDDEN", "Registrations are currently closed");
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists. Try signing in or resetting your password.");
  const referrer = input.referralCode ? await db.user.findUnique({ where: { referralCode: input.referralCode.toUpperCase() } }) : null;
  const customerRole = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      referralCode: humanId("R", 7).replace("-", ""),
      referredById: referrer?.id ?? null,
      profile: { create: { displayName: input.displayName } },
      roles: { create: { roleId: customerRole.id } },
    },
  });
  await audit({ actorId: user.id, action: "user.registered", entityType: "user", entityId: user.id, ip });
  await sendVerificationEmail(user.id, user.email);
  return user;
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, "EMAIL_VERIFICATION");
  const user = await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  // Referral reward: promotional credit for the referrer once the new account is verified.
  const settings = await getSettings();
  if (user.referredById && settings.features.referralsEnabled && settings.features.referralRewardMinor > 0) {
    await db.$transaction((tx) =>
      creditWallet(tx, user.referredById!, settings.commerce.baseCurrency, settings.features.referralRewardMinor, "PROMOTIONAL", "PROMO_CREDIT", "Referral reward (promotional credit, non-withdrawable)", `referral:${user.id}`, { type: "user", id: user.id }),
    );
  }
  return user;
}

export type LoginResult = { token: string; expiresAt: Date; twoFactorRequired: boolean };

export async function login(input: z.infer<typeof loginSchema>, meta: { ip?: string; userAgent?: string | null }): Promise<LoginResult> {
  const user = await db.user.findUnique({ where: { email: input.email } });
  const ok = await verifyPassword(input.password, user?.passwordHash ?? dummyHash());
  if (!user || !ok) {
    await audit({ actorId: user?.id ?? null, action: "auth.login_failed", entityType: "user", entityId: user?.id ?? null, ip: meta.ip });
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password");
  }
  if (user.status === "SUSPENDED") throw new AppError("FORBIDDEN", "This account is suspended. Contact support.");
  if (user.status === "DELETED") throw new AppError("UNAUTHENTICATED", "Incorrect email or password");
  const { token, session } = await createSession(user.id, { ip: meta.ip, userAgent: meta.userAgent, twoFactorPending: user.twoFactorEnabled });
  if (!user.twoFactorEnabled) {
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ip: meta.ip });
  }
  return { token, expiresAt: session.expiresAt, twoFactorRequired: user.twoFactorEnabled };
}

/** Second login step. Exchanges a pending-2FA session for a full session. */
export async function completeTwoFactor(pendingSessionId: string, code: string, meta: { ip?: string; userAgent?: string | null }) {
  const session = await db.session.findUnique({ where: { id: pendingSessionId }, include: { user: true } });
  if (!session || !session.twoFactorPending || session.expiresAt < new Date()) throw new AppError("UNAUTHENTICATED", "Your sign-in attempt expired. Please sign in again.");
  const user = session.user;
  if (!(await checkSecondFactor(user.id, code))) {
    await audit({ actorId: user.id, action: "auth.2fa_failed", entityType: "user", entityId: user.id, ip: meta.ip });
    throw new AppError("UNAUTHENTICATED", "That code is not valid");
  }
  await db.session.delete({ where: { id: session.id } });
  const full = await createSession(user.id, meta);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ip: meta.ip, metadata: { twoFactor: true } });
  return { token: full.token, expiresAt: full.session.expiresAt };
}

async function checkSecondFactor(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorSecret) return false;
  const clean = code.replace(/\s/g, "");
  if (/^\d{6}$/.test(clean)) return authenticator.verify({ token: clean, secret: decrypt(user.twoFactorSecret) });
  // Backup code (single use).
  const hash = sha256(clean.toUpperCase());
  if (user.backupCodes.includes(hash)) {
    await db.user.update({ where: { id: userId }, data: { backupCodes: user.backupCodes.filter((h) => h !== hash) } });
    return true;
  }
  return false;
}

export async function beginTwoFactorSetup(user: AuthUser) {
  if (user.twoFactorEnabled) throw new AppError("CONFLICT", "Two-factor authentication is already enabled");
  const secret = authenticator.generateSecret();
  await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: encrypt(secret) } });
  const settings = await getSettings();
  return { secret, otpauthUrl: authenticator.keyuri(user.email, settings.brand.name, secret) };
}

export async function enableTwoFactor(user: AuthUser, code: string, ip?: string) {
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!row.twoFactorSecret) throw new AppError("BAD_REQUEST", "Start two-factor setup first");
  if (!authenticator.verify({ token: code.replace(/\s/g, ""), secret: decrypt(row.twoFactorSecret) })) throw new AppError("VALIDATION_ERROR", "That code is not valid");
  const codes = Array.from({ length: 8 }, () => randomToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase());
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, backupCodes: codes.map((c) => sha256(c)) } });
  await audit({ actorId: user.id, action: "auth.2fa_enabled", entityType: "user", entityId: user.id, ip });
  return { backupCodes: codes };
}

export async function disableTwoFactor(user: AuthUser, password: string, code: string, ip?: string) {
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(password, row.passwordHash))) throw new AppError("UNAUTHENTICATED", "Incorrect password");
  if (!(await checkSecondFactor(user.id, code))) throw new AppError("VALIDATION_ERROR", "That code is not valid");
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null, backupCodes: [] } });
  await audit({ actorId: user.id, action: "auth.2fa_disabled", entityType: "user", entityId: user.id, ip });
}

export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Always respond the same way so the endpoint can't be used to discover accounts.
  if (!user || user.status === "DELETED") return;
  const token = await issueToken(user.id, "PASSWORD_RESET", 60);
  await sendEmail(user.email, "Reset your password", `Use this link to choose a new password:\n\n${appUrl()}/reset-password?token=${token}\n\nThe link expires in 1 hour. If you didn't ask for this, you can ignore this email.`);
}

export async function resetPassword(token: string, password: string, ip?: string) {
  passwordSchema.parse(password);
  const userId = await consumeToken(token, "PASSWORD_RESET");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await db.session.deleteMany({ where: { userId } }); // sign out everywhere
  await audit({ actorId: userId, action: "auth.password_reset", entityType: "user", entityId: userId, ip });
}

export async function changePassword(user: AuthUser, currentSessionId: string, current: string, next: string, ip?: string) {
  passwordSchema.parse(next);
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(current, row.passwordHash))) throw new AppError("UNAUTHENTICATED", "Current password is incorrect");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await db.session.deleteMany({ where: { userId: user.id, id: { not: currentSessionId } } });
  await audit({ actorId: user.id, action: "auth.password_changed", entityType: "user", entityId: user.id, ip });
}

export async function requestAccountDeletion(user: AuthUser, reason: string | undefined) {
  const open = await db.accountDeletionRequest.findFirst({ where: { userId: user.id, status: "PENDING" } });
  if (open) throw new AppError("CONFLICT", "A deletion request is already pending");
  await db.$transaction([
    db.accountDeletionRequest.create({ data: { userId: user.id, reason } }),
    db.user.update({ where: { id: user.id }, data: { status: "DELETION_REQUESTED" } }),
  ]);
  await audit({ actorId: user.id, action: "user.deletion_requested", entityType: "user", entityId: user.id });
}

/**
 * Process a deletion request: personal data is anonymised; financial records (orders, payments,
 * ledger) are retained in pseudonymised form because accounting law requires it.
 */
export async function processAccountDeletion(staff: AuthUser, requestId: string, approve: boolean, ip?: string) {
  const req = await db.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (req.status !== "PENDING") throw new AppError("CONFLICT", "Already processed");
  if (!approve) {
    await db.$transaction([
      db.accountDeletionRequest.update({ where: { id: requestId }, data: { status: "REJECTED", processedAt: new Date(), processedBy: staff.id } }),
      db.user.update({ where: { id: req.userId }, data: { status: "ACTIVE" } }),
    ]);
    return;
  }
  const active = await db.purchaseTransaction.count({ where: { OR: [{ buyerId: req.userId }, { seller: { userId: req.userId } }], status: { in: ["PAID", "TRANSFER_IN_PROGRESS", "AWAITING_VERIFICATION", "DISPUTED", "REFUND_PENDING"] } } });
  if (active) throw new AppError("CONFLICT", "This user has marketplace transactions in progress; resolve them first");
  await db.$transaction([
    db.user.update({
      where: { id: req.userId },
      data: { email: `deleted+${req.userId}@invalid.local`, passwordHash: "!", status: "DELETED", twoFactorEnabled: false, twoFactorSecret: null, backupCodes: [] },
    }),
    db.userProfile.updateMany({ where: { userId: req.userId }, data: { displayName: "Deleted user", phone: null } }),
    db.session.deleteMany({ where: { userId: req.userId } }),
    db.notification.deleteMany({ where: { userId: req.userId } }),
    db.savedListing.deleteMany({ where: { userId: req.userId } }),
    db.accountDeletionRequest.update({ where: { id: requestId }, data: { status: "COMPLETED", processedAt: new Date(), processedBy: staff.id } }),
  ]);
  await audit({ actorId: staff.id, action: "user.deleted", entityType: "user", entityId: req.userId, ip });
}
