import { db } from "@/lib/db";
import { pageMeta, paginate, route } from "@/server/http";
import { balancesOf } from "@/server/wallet";

export const GET = route(
  async ({ auth, query }) => {
    const currency = (query.get("currency") ?? "NGN").toUpperCase();
    const wallet = await db.walletAccount.findUnique({ where: { userId_currency: { userId: auth.user.id, currency } } });
    if (!wallet) return { currency, balances: { available: 0, promotional: 0, pending: 0 }, entries: [], meta: pageMeta(1, 20, 0) };
    const { page, pageSize, skip, take } = paginate(query);
    const [balances, entries, total] = await Promise.all([
      balancesOf(db, wallet.id),
      db.walletLedgerEntry.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: { id: true, bucket: true, amountMinor: true, type: true, description: true, createdAt: true, referenceType: true, referenceId: true },
      }),
      db.walletLedgerEntry.count({ where: { walletId: wallet.id } }),
    ]);
    return { currency, balances, entries, meta: pageMeta(page, pageSize, total) };
  },
  { auth: "required" },
);
