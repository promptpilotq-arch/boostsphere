import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { availableProviders } from "@/server/payments/registry";
import { getSettings } from "@/server/settings";
import { balancesOf } from "@/server/wallet";
import { DepositForm } from "@/components/client/deposit-form";
import { ApiForm, SubmitButton } from "@/components/client/api-form";
import { ActionButton } from "@/components/client/action-button";
import { Card, EmptyState, Field, Money, Notice, PageHeader, Stat, StatusBadge, Table, Td, fmtDateTime } from "@/components/ui";

export default async function WalletPage() {
  const auth = await requireUserPage("/dashboard/wallet");
  const s = await getSettings();
  if (!s.features.walletEnabled) notFound();
  const currency = s.commerce.baseCurrency;
  const wallet = await db.walletAccount.findUnique({ where: { userId_currency: { userId: auth.user.id, currency } } });
  const [bal, entries] = wallet ? await Promise.all([balancesOf(db, wallet.id), db.walletLedgerEntry.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "desc" }, take: 100 })]) : [{ available: 0, promotional: 0, pending: 0 }, []];
  const [payoutAccount, payouts] = await Promise.all([
    db.payoutAccount.findUnique({ where: { userId: auth.user.id }, select: { bankName: true, accountName: true, accountLast4: true } }),
    db.payoutRequest.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const openPayout = payouts.find((p) => p.status === "REQUESTED");
  const providers = availableProviders(currency, { walletEnabled: true, allowWallet: false }).map((p) => ({ key: p.key, displayName: p.displayName }));
  return (
    <>
      <PageHeader title="Wallet" description="Your balance is calculated from an immutable ledger of every credit and debit." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Available funds" value={<Money minor={bal.available} currency={currency} />} hint="Deposits, refunds and released sale proceeds" />
        <Stat label="Promotional credit" value={<Money minor={bal.promotional} currency={currency} />} hint="Spendable on orders. Not withdrawable." />
        <Stat label="Pending (on hold)" value={<Money minor={bal.pending} currency={currency} />} hint="Sale proceeds awaiting verification and withdrawals being processed" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Ledger</h2>
          {entries.length ? (
            <Table head={["Date", "Description", "Bucket", "Amount"]}>
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td>{fmtDateTime(e.createdAt)}</Td>
                  <Td className="max-w-[320px] whitespace-normal">{e.description}</Td>
                  <Td>{e.bucket.toLowerCase()}</Td>
                  <Td className={e.amountMinor < 0 ? "text-red-700" : "text-emerald-700"}>
                    {e.amountMinor > 0 ? "+" : ""}
                    <Money minor={e.amountMinor} currency={currency} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No wallet activity yet" />
          )}
        </div>
        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="font-semibold">Add funds</h2>
            <DepositForm currency={currency} providers={providers} />
          </Card>
          {s.features.withdrawalsEnabled && (
            <Card className="p-6">
              <h2 className="font-semibold">Withdraw</h2>
              <p className="mt-1 text-xs text-slate-500">
                Available funds only — promotional credit can&apos;t be withdrawn. Minimum <Money minor={s.commerce.minWithdrawalMinor} currency={currency} />. Payouts are sent by bank transfer, usually within 2 business days.
              </p>
              {payoutAccount ? (
                <p className="mt-3 text-sm">
                  Pay to <strong>{payoutAccount.bankName}</strong> ••••{payoutAccount.accountLast4} ({payoutAccount.accountName})
                </p>
              ) : (
                <p className="mt-3 text-sm text-amber-800">Add a bank account to withdraw.</p>
              )}
              {openPayout ? (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                  <p>
                    Withdrawal {openPayout.number} of <Money minor={openPayout.amountMinor} currency={openPayout.currency} /> is being processed.
                  </p>
                  <ActionButton endpoint="/api/v1/me/payouts" body={{ action: "cancel", payoutId: openPayout.id }} className="btn-ghost mt-2 px-2 py-1" confirm="Cancel this withdrawal?" successMessage="Withdrawal cancelled">
                    Cancel withdrawal
                  </ActionButton>
                </div>
              ) : (
                payoutAccount && (
                  <ApiForm action="/api/v1/me/payouts" extra={{ action: "request", currency }} idempotent success={{ message: "Withdrawal requested" }} className="mt-4 flex gap-2">
                    <input name="amountMinor" data-money type="number" step="0.01" min="0.01" required className="input" placeholder="Amount" aria-label="Withdrawal amount" />
                    <SubmitButton>Withdraw</SubmitButton>
                  </ApiForm>
                )
              )}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-brand">{payoutAccount ? "Change bank account" : "Add bank account"}</summary>
                <ApiForm action="/api/v1/me/payouts" extra={{ action: "save_account" }} success={{ message: "Bank account saved", reset: true }} className="mt-3 space-y-3">
                  <Field label="Bank name" htmlFor="bankName">
                    <input id="bankName" name="bankName" required className="input" />
                  </Field>
                  <Field label="Account name" htmlFor="accountName" hint="Must match the name on your BoostSphere account or verified business.">
                    <input id="accountName" name="accountName" required className="input" />
                  </Field>
                  <Field label="Account number (NUBAN)" htmlFor="accountNumber" hint="Stored encrypted. Only the last 4 digits are shown.">
                    <input id="accountNumber" name="accountNumber" inputMode="numeric" pattern="\d{10}" required className="input" autoComplete="off" />
                  </Field>
                  <SubmitButton className="btn-secondary">Save bank account</SubmitButton>
                </ApiForm>
              </details>
              {payouts.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                  {payouts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>
                        {p.number} · <Money minor={p.amountMinor} currency={p.currency} />
                        {p.transferReference && <span className="block text-xs text-slate-500">Ref {p.transferReference}</span>}
                        {p.status === "REJECTED" && p.adminNote && <span className="block text-xs text-red-700">{p.adminNote}</span>}
                      </span>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Notice>Wallet funds are held by the platform operator for use on the platform. They are not a bank deposit and earn no interest.</Notice>
        </div>
      </div>
    </>
  );
}
