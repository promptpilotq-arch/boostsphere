import type { WalletBucket } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Ledger-based wallet. Balances are never stored or edited directly: they are the sum of
 * immutable ledger entries per bucket. Every write locks the wallet row (SELECT … FOR UPDATE)
 * inside a database transaction and carries a unique idempotency key, so retries and concurrent
 * requests cannot double-post or overdraw.
 *
 *  AVAILABLE    customer money (deposits, refunds, released seller proceeds)
 *  PROMOTIONAL  promotional credit — spendable on the platform, never withdrawable
 *  PENDING      seller proceeds tied to an in-progress marketplace transfer — not spendable
 */
export type Balances = { available: number; promotional: number; pending: number };

export async function getOrCreateWallet(tx: Tx, userId: string, currency: string) {
  return tx.walletAccount.upsert({
    where: { userId_currency: { userId, currency } },
    create: { userId, currency },
    update: {},
  });
}

async function lockWallet(tx: Tx, walletId: string) {
  await tx.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ${walletId} FOR UPDATE`;
}

export async function balancesOf(tx: Tx | typeof db, walletId: string): Promise<Balances> {
  const rows = await tx.walletLedgerEntry.groupBy({ by: ["bucket"], where: { walletId }, _sum: { amountMinor: true } });
  const get = (b: WalletBucket) => rows.find((r) => r.bucket === b)?._sum.amountMinor ?? 0;
  return { available: get("AVAILABLE"), promotional: get("PROMOTIONAL"), pending: get("PENDING") };
}

export async function userBalances(userId: string, currency: string): Promise<Balances> {
  const wallet = await db.walletAccount.findUnique({ where: { userId_currency: { userId, currency } } });
  return wallet ? balancesOf(db, wallet.id) : { available: 0, promotional: 0, pending: 0 };
}

type EntryInput = {
  bucket: WalletBucket;
  amountMinor: number;
  type: string;
  description: string;
  referenceType?: string;
  referenceId?: string;
  createdById?: string;
};

/**
 * Post one or more entries atomically. Returns false (and posts nothing) if the idempotency key
 * was already used — i.e. the operation already happened.
 */
export async function postEntries(tx: Tx, walletId: string, idempotencyKey: string, entries: EntryInput[]): Promise<boolean> {
  await lockWallet(tx, walletId);
  const already = await tx.walletLedgerEntry.findFirst({ where: { idempotencyKey: { startsWith: `${idempotencyKey}#` } }, select: { id: true } });
  if (already) return false;
  const before = await balancesOf(tx, walletId);
  const after = { ...before };
  for (const e of entries) {
    if (!Number.isInteger(e.amountMinor) || e.amountMinor === 0) throw new AppError("BAD_REQUEST", "Ledger amounts must be non-zero integers");
    const k = e.bucket === "AVAILABLE" ? "available" : e.bucket === "PROMOTIONAL" ? "promotional" : "pending";
    after[k] += e.amountMinor;
  }
  if (after.available < 0 || after.promotional < 0 || after.pending < 0) throw new AppError("CONFLICT", "Insufficient wallet balance");
  await tx.walletLedgerEntry.createMany({
    data: entries.map((e, i) => ({ ...e, walletId, idempotencyKey: `${idempotencyKey}#${i}` })),
  });
  return true;
}

/** Spend from a wallet: promotional credit first, then available funds. */
export async function spendFromWallet(tx: Tx, userId: string, currency: string, amountMinor: number, ref: { type: string; id: string }, description: string) {
  const wallet = await getOrCreateWallet(tx, userId, currency);
  await lockWallet(tx, wallet.id);
  const bal = await balancesOf(tx, wallet.id);
  if (bal.available + bal.promotional < amountMinor) throw new AppError("CONFLICT", "Insufficient wallet balance");
  const fromPromo = Math.min(bal.promotional, amountMinor);
  const fromAvailable = amountMinor - fromPromo;
  const entries: EntryInput[] = [];
  if (fromPromo) entries.push({ bucket: "PROMOTIONAL", amountMinor: -fromPromo, type: "PURCHASE", description, referenceType: ref.type, referenceId: ref.id });
  if (fromAvailable) entries.push({ bucket: "AVAILABLE", amountMinor: -fromAvailable, type: "PURCHASE", description, referenceType: ref.type, referenceId: ref.id });
  const posted = await postEntries(tx, wallet.id, `spend:${ref.type}:${ref.id}`, entries);
  return { posted, fromPromo, fromAvailable, walletId: wallet.id };
}

export async function creditWallet(
  tx: Tx,
  userId: string,
  currency: string,
  amountMinor: number,
  bucket: WalletBucket,
  type: string,
  description: string,
  idempotencyKey: string,
  ref?: { type: string; id: string },
  createdById?: string,
) {
  const wallet = await getOrCreateWallet(tx, userId, currency);
  return postEntries(tx, wallet.id, idempotencyKey, [
    { bucket, amountMinor, type, description, referenceType: ref?.type, referenceId: ref?.id, createdById },
  ]);
}

/** Move funds between buckets of the same wallet (e.g. releasing seller proceeds PENDING → AVAILABLE). */
export async function moveBetweenBuckets(tx: Tx, userId: string, currency: string, amountMinor: number, from: WalletBucket, to: WalletBucket, type: string, description: string, idempotencyKey: string, ref?: { type: string; id: string }) {
  const wallet = await getOrCreateWallet(tx, userId, currency);
  return postEntries(tx, wallet.id, idempotencyKey, [
    { bucket: from, amountMinor: -amountMinor, type, description, referenceType: ref?.type, referenceId: ref?.id },
    { bucket: to, amountMinor, type, description, referenceType: ref?.type, referenceId: ref?.id },
  ]);
}
