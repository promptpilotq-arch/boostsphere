import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { getSettings } from "@/server/settings";
import { Card, Money, PageHeader, Stat } from "@/components/ui";

export default async function ReferralsPage() {
  const auth = await requireUserPage("/dashboard/referrals");
  const s = await getSettings();
  if (!s.features.referralsEnabled) notFound();
  const me = await db.user.findUniqueOrThrow({ where: { id: auth.user.id }, select: { referralCode: true } });
  const [total, verified, rewards] = await Promise.all([
    db.user.count({ where: { referredById: auth.user.id } }),
    db.user.count({ where: { referredById: auth.user.id, emailVerifiedAt: { not: null } } }),
    db.walletLedgerEntry.aggregate({ where: { wallet: { userId: auth.user.id }, type: "PROMO_CREDIT", idempotencyKey: { startsWith: "referral:" } }, _sum: { amountMinor: true } }),
  ]);
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/register?ref=${me.referralCode}`;
  return (
    <>
      <PageHeader title="Referrals" description={`Invite friends. When they verify their email, you receive ${s.features.referralRewardMinor ? "promotional credit" : "our thanks"}.`} />
      <Card className="p-6">
        <p className="label">Your referral link</p>
        <input readOnly value={link} className="input font-mono text-xs" aria-label="Referral link" />
        <p className="mt-2 text-sm text-slate-600">
          Code: <strong className="font-mono">{me.referralCode}</strong>
          {s.features.referralRewardMinor > 0 && (
            <>
              {" "}
              · Reward: <Money minor={s.features.referralRewardMinor} currency={s.commerce.baseCurrency} /> promotional credit per verified sign-up (non-withdrawable)
            </>
          )}
        </p>
      </Card>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Sign-ups" value={total} />
        <Stat label="Verified" value={verified} />
        <Stat label="Credit earned" value={<Money minor={rewards._sum.amountMinor ?? 0} currency={s.commerce.baseCurrency} />} />
      </div>
    </>
  );
}
