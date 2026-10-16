import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { decrypt, encrypt, humanId } from "@/lib/crypto";
import { formatMoney } from "@/lib/money";
import type { AuthUser } from "./auth/session";
import { audit } from "./audit";
import { notify, notifyStaff } from "./notify";
import { getSettings } from "./settings";
import { balancesOf, getOrCreateWallet, moveBetweenBuckets, postEntries } from "./wallet";

/**
 * Manual withdrawals of AVAILABLE wallet funds (e.g. released seller proceeds, wallet refunds).
 *
 *  request  → AVAILABLE → PENDING (funds are held, can't be spent twice)
 *  paid     → PENDING debited, PAYOUT_SENT journal line (admin has sent the bank transfer)
 *  rejected / cancelled → PENDING → AVAILABLE
 *
 * Promotional credit is never withdrawable because only the AVAILABLE bucket is used.
 */

export const payoutAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(80),
  accountName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit NUBAN account number"),
});

export async function savePayoutAccount(user: AuthUser, input: z.infer<typeof payoutAccountSchema>, ip?: string) {
  const data = { bankName: input.bankName, accountName: input.accountName, accountNumberEnc: encrypt(input.accountNumber), accountLast4: input.accountNumber.slice(-4) };
  await db.payoutAccount.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  await audit({ actorId: user.id, action: "payout_account.saved", entityType: "user", entityId: user.id, metadata: { last4: data.accountLast4 }, ip });
  return { bankName: data.bankName, accountName: data.accountName, accountLast4: data.accountLast4 };
}

export const withdrawalSchema = z.object({ amountMinor: z.coerce.number().int().positive(), currency: z.string().length(3).default("NGN") });

export async function requestWithdrawal(user: AuthUser, input: z.infer<typeof withdrawalSchema>) {
  const settings = await getSettings();
  if (!settings.features.walletEnabled || !settings.features.withdrawalsEnabled) throw new AppError("FORBIDDEN", "Withdrawals are currently unavailable");
  if (user.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Your account cannot request withdrawals");
  if (input.amountMinor < settings.commerce.minWithdrawalMinor) {
    throw new AppError("VALIDATION_ERROR", `Minimum withdrawal is ${formatMoney(settings.commerce.minWithdrawalMinor, input.currency)}`);
  }
  const account = await db.payoutAccount.findUnique({ where: { userId: user.id } });
  if (!account) throw new AppError("VALIDATION_ERROR", "Add a payout bank account first");
  const open = await db.payoutRequest.count({ where: { userId: user.id, status: "REQUESTED" } });
  if (open) throw new AppError("CONFLICT", "You already have a withdrawal in progress");

  const payout = await db.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(tx, user.id, input.currency);
    const bal = await balancesOf(tx, wallet.id);
    if (bal.available < input.amountMinor) throw new AppError("CONFLICT", "Insufficient available balance (promotional credit can't be withdrawn)");
    const p = await tx.payoutRequest.create({
      data: {
        number: humanId("WD"),
        userId: user.id,
        amountMinor: input.amountMinor,
        currency: input.currency,
        bankName: account.bankName,
        accountName: account.accountName,
        accountNumberEnc: account.accountNumberEnc,
        accountLast4: account.accountLast4,
      },
    });
    // postEntries re-checks the balance under a row lock, so concurrent requests can't overdraw.
    await moveBetweenBuckets(tx, user.id, input.currency, input.amountMinor, "AVAILABLE", "PENDING", "WITHDRAWAL_HOLD", `Withdrawal ${p.number} (on hold while processed)`, `payout-hold:${p.id}`, { type: "payout", id: p.id });
    await audit({ actorId: user.id, action: "payout.requested", entityType: "payout", entityId: p.id, metadata: { amountMinor: input.amountMinor } }, tx);
    return p;
  });
  await notifyStaff({ type: "payout.requested", title: `Withdrawal request ${payout.number}`, body: formatMoney(payout.amountMinor, payout.currency), link: "/admin/payouts" });
  return payout;
}

async function release(payoutId: string, status: "REJECTED" | "CANCELLED", actorId: string, note?: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payout_requests WHERE id = ${payoutId} FOR UPDATE`;
    const p = await tx.payoutRequest.findUniqueOrThrow({ where: { id: payoutId } });
    if (p.status !== "REQUESTED") throw new AppError("CONFLICT", "This withdrawal has already been processed");
    await moveBetweenBuckets(tx, p.userId, p.currency, p.amountMinor, "PENDING", "AVAILABLE", "WITHDRAWAL_RELEASE", `Withdrawal ${p.number} ${status.toLowerCase()}`, `payout-release:${p.id}`, { type: "payout", id: p.id });
    const updated = await tx.payoutRequest.update({ where: { id: payoutId }, data: { status, adminNote: note ?? null, processedAt: new Date(), processedById: actorId } });
    await audit({ actorId, action: `payout.${status.toLowerCase()}`, entityType: "payout", entityId: payoutId, metadata: { note } }, tx);
    return updated;
  });
}

export async function cancelWithdrawal(user: AuthUser, payoutId: string) {
  const p = await db.payoutRequest.findUnique({ where: { id: payoutId } });
  if (!p || p.userId !== user.id) throw notFound("Withdrawal");
  return release(payoutId, "CANCELLED", user.id);
}

export const payoutDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("PAID"), transferReference: z.string().trim().min(4, "Enter the bank transfer reference").max(120), note: z.string().max(1000).optional() }),
  z.object({ decision: z.literal("REJECTED"), note: z.string().trim().min(5, "Explain why the withdrawal was rejected").max(1000) }),
]);

export async function decideWithdrawal(staff: AuthUser, payoutId: string, input: z.infer<typeof payoutDecisionSchema>, ip?: string) {
  if (input.decision === "REJECTED") {
    const p = await release(payoutId, "REJECTED", staff.id, input.note);
    await notify(p.userId, { type: "payout.rejected", title: `Withdrawal ${p.number} was not processed`, body: `${input.note} The funds are back in your available balance.`, link: "/dashboard/wallet" });
    return p;
  }
  const p = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payout_requests WHERE id = ${payoutId} FOR UPDATE`;
    const p = await tx.payoutRequest.findUniqueOrThrow({ where: { id: payoutId } });
    if (p.status !== "REQUESTED") throw new AppError("CONFLICT", "This withdrawal has already been processed");
    const wallet = await getOrCreateWallet(tx, p.userId, p.currency);
    await postEntries(tx, wallet.id, `payout-paid:${p.id}`, [
      { bucket: "PENDING", amountMinor: -p.amountMinor, type: "WITHDRAWAL_PAID", description: `Withdrawal ${p.number} paid to ${p.bankName} ••••${p.accountLast4}`, referenceType: "payout", referenceId: p.id, createdById: staff.id },
    ]);
    await tx.transaction.create({
      data: { type: "PAYOUT_SENT", sourceType: "payout", sourceId: p.id, userId: p.userId, amountMinor: -p.amountMinor, currency: p.currency, description: `Payout ${p.number} ref ${input.transferReference}` },
    });
    const updated = await tx.payoutRequest.update({ where: { id: p.id }, data: { status: "PAID", transferReference: input.transferReference, adminNote: input.note ?? null, processedAt: new Date(), processedById: staff.id } });
    await audit({ actorId: staff.id, action: "payout.paid", entityType: "payout", entityId: p.id, metadata: { transferReference: input.transferReference }, ip }, tx);
    return updated;
  });
  await notify(p.userId, { type: "payout.paid", title: `Withdrawal ${p.number} sent`, body: `${formatMoney(p.amountMinor, p.currency)} was sent to ${p.bankName} ••••${p.accountLast4} (ref ${input.transferReference}).`, link: "/dashboard/wallet" });
  return p;
}

/** Staff-only: full account number for making the transfer. Every reveal is audited. */
export async function revealPayoutAccountNumber(staff: AuthUser, payoutId: string, ip?: string) {
  const p = await db.payoutRequest.findUnique({ where: { id: payoutId } });
  if (!p) throw notFound("Withdrawal");
  await audit({ actorId: staff.id, action: "payout.account_revealed", entityType: "payout", entityId: payoutId, ip });
  return decrypt(p.accountNumberEnc);
}
