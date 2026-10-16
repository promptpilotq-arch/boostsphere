import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { call, makeUser, resetDb } from "../helpers";
import * as payoutsRoute from "@/app/api/v1/me/payouts/route";
import * as adminPayout from "@/app/api/v1/admin/payouts/[id]/route";
import * as adminUser from "@/app/api/v1/admin/users/[id]/route";

beforeEach(resetDb);

const ACCOUNT = { action: "save_account", bankName: "Test Bank", accountName: "Test Seller", accountNumber: "0123456789" };

async function balances(userId: string) {
  const rows = await db.walletLedgerEntry.groupBy({ by: ["bucket"], where: { wallet: { userId } }, _sum: { amountMinor: true } });
  const get = (b: string) => rows.find((r) => r.bucket === b)?._sum.amountMinor ?? 0;
  return { available: get("AVAILABLE"), promotional: get("PROMOTIONAL"), pending: get("PENDING") };
}

async function fund(userId: string, adminCookie: string, bucket: "AVAILABLE" | "PROMOTIONAL", amountMinor: number) {
  const r = await call(adminUser.POST, { cookie: adminCookie, params: { id: userId }, body: { action: "wallet_adjustment", bucket, amountMinor, reason: "Test funding", idempotencyKey: `fund-${bucket}-${userId}` } });
  expect(r.status).toBe(200);
}

describe("withdrawals", () => {
  it("holds funds on request, debits on payment, and never returns the full account number", async () => {
    const seller = await makeUser();
    const admin = await makeUser(["ADMIN"]);
    await fund(seller.user.id, admin.cookie, "AVAILABLE", 500_000);
    await fund(seller.user.id, admin.cookie, "PROMOTIONAL", 900_000);

    const saved = await call(payoutsRoute.POST, { cookie: seller.cookie, body: ACCOUNT });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.json)).not.toContain("0123456789");
    expect((await db.payoutAccount.findUniqueOrThrow({ where: { userId: seller.user.id } })).accountNumberEnc).not.toContain("0123456789");

    // Promotional credit can't be withdrawn.
    const tooMuch = await call(payoutsRoute.POST, { cookie: seller.cookie, body: { action: "request", amountMinor: 600_000 } });
    expect(tooMuch.status).toBe(409);

    const req = await call(payoutsRoute.POST, { cookie: seller.cookie, body: { action: "request", amountMinor: 400_000 } });
    expect(req.status).toBe(200);
    expect(await balances(seller.user.id)).toEqual({ available: 100_000, promotional: 900_000, pending: 400_000 });

    // A second concurrent request is refused.
    expect((await call(payoutsRoute.POST, { cookie: seller.cookie, body: { action: "request", amountMinor: 100_000 } })).status).toBe(409);

    const list = await call(payoutsRoute.GET, { cookie: seller.cookie });
    expect(JSON.stringify(list.json)).not.toMatch(/0123456789|accountNumberEnc/);

    const id = req.json.payout.id;
    const reveal = await call(adminPayout.POST, { cookie: admin.cookie, params: { id }, body: { decision: "REVEAL_ACCOUNT" } });
    expect(reveal.json.accountNumber).toBe("0123456789");

    const paid = await call(adminPayout.POST, { cookie: admin.cookie, params: { id }, body: { decision: "PAID", transferReference: "NIP-000123" } });
    expect(paid.status).toBe(200);
    expect(await balances(seller.user.id)).toEqual({ available: 100_000, promotional: 900_000, pending: 0 });
    const journal = await db.transaction.findMany({ where: { type: "PAYOUT_SENT" } });
    expect(journal).toHaveLength(1);
    expect(journal[0].amountMinor).toBe(-400_000);

    // Processing twice is refused.
    expect((await call(adminPayout.POST, { cookie: admin.cookie, params: { id }, body: { decision: "PAID", transferReference: "NIP-000123" } })).status).toBe(409);
    expect(await db.auditLog.count({ where: { action: "payout.account_revealed" } })).toBe(1);
  });

  it("rejection and cancellation release held funds", async () => {
    const user = await makeUser();
    const admin = await makeUser(["ADMIN"]);
    await fund(user.user.id, admin.cookie, "AVAILABLE", 300_000);
    await call(payoutsRoute.POST, { cookie: user.cookie, body: ACCOUNT });

    const a = await call(payoutsRoute.POST, { cookie: user.cookie, body: { action: "request", amountMinor: 200_000 } });
    const rej = await call(adminPayout.POST, { cookie: admin.cookie, params: { id: a.json.payout.id }, body: { decision: "REJECTED", note: "Account name mismatch" } });
    expect(rej.status).toBe(200);
    expect(await balances(user.user.id)).toMatchObject({ available: 300_000, pending: 0 });

    const b = await call(payoutsRoute.POST, { cookie: user.cookie, body: { action: "request", amountMinor: 150_000 } });
    expect((await balances(user.user.id)).pending).toBe(150_000);
    const cancel = await call(payoutsRoute.POST, { cookie: user.cookie, body: { action: "cancel", payoutId: b.json.payout.id } });
    expect(cancel.status).toBe(200);
    expect(await balances(user.user.id)).toMatchObject({ available: 300_000, pending: 0 });
  });

  it("enforces minimum amount, ownership and admin permission", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const support = await makeUser(["SUPPORT"]);
    const admin = await makeUser(["ADMIN"]);
    await fund(user.user.id, admin.cookie, "AVAILABLE", 300_000);
    await call(payoutsRoute.POST, { cookie: user.cookie, body: ACCOUNT });
    expect((await call(payoutsRoute.POST, { cookie: user.cookie, body: { action: "request", amountMinor: 50_000 } })).status).toBe(422);
    const ok = await call(payoutsRoute.POST, { cookie: user.cookie, body: { action: "request", amountMinor: 200_000 } });
    expect((await call(payoutsRoute.POST, { cookie: other.cookie, body: { action: "cancel", payoutId: ok.json.payout.id } })).status).toBe(404);
    expect((await call(adminPayout.POST, { cookie: support.cookie, params: { id: ok.json.payout.id }, body: { decision: "REVEAL_ACCOUNT" } })).status).toBe(403);
    expect((await call(payoutsRoute.POST, { cookie: user.cookie, body: { ...ACCOUNT, accountNumber: "12345" } })).status).toBe(422);
  });
});
