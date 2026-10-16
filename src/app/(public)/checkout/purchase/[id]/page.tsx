import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { requireUserPage } from "@/server/auth/current";
import { availableProviders } from "@/server/payments/registry";
import { getSettings } from "@/server/settings";
import { userBalances } from "@/server/wallet";
import { PayButton } from "@/components/client/pay-button";
import { ActionButton } from "@/components/client/action-button";
import { Money, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PurchaseCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUserPage(`/checkout/purchase/${id}`);
  const p = await db.purchaseTransaction.findUnique({ where: { id }, include: { listing: { include: { platform: true } } } });
  if (!p || p.buyerId !== auth.user.id) notFound();
  if (p.status !== "PENDING_PAYMENT") redirect(`/dashboard/purchases/${p.id}`);
  const settings = await getSettings();
  const providers = availableProviders(p.currency, { walletEnabled: settings.features.walletEnabled, allowWallet: true });
  const bal = await userBalances(auth.user.id, p.currency);

  return (
    <div className="container-page max-w-4xl py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">Checkout</h1>
      <p className="mt-1 text-slate-600">Purchase {p.number}</p>
      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold">{p.listing.title}</h2>
            <p className="text-sm text-slate-600">{p.listing.platform.name} · transfer via official platform tools</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Price</dt>
                <dd>
                  <Money minor={p.priceMinor} currency={p.currency} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Marketplace service fee</dt>
                <dd>
                  <Money minor={p.buyerFeeMinor} currency={p.currency} />
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>
                  <Money minor={p.totalMinor} currency={p.currency} />
                </dd>
              </div>
            </dl>
          </section>
          <Notice tone="blue" title="What happens next">
            After payment, the seller starts the platform&apos;s official ownership transfer. You confirm each step in your dashboard. The seller is paid only after the transfer is verified. This is a platform settlement hold, not a licensed escrow service.
          </Notice>
          <ActionButton endpoint={`/api/v1/purchases/${p.id}`} body={{ action: "cancel" }} className="btn-ghost" confirm="Cancel and release this listing?" redirect="/marketplace" successMessage="Purchase cancelled">
            Cancel purchase
          </ActionButton>
        </div>
        <aside className="card h-fit p-6">
          <PayButton
            target={{ purpose: "MARKETPLACE_PURCHASE", purchaseId: p.id }}
            providers={providers.map((x) => ({ key: x.key, displayName: x.displayName, description: x.description }))}
            walletAvailableMinor={formatMoney(bal.available + bal.promotional, p.currency)}
            totalLabel={formatMoney(p.totalMinor, p.currency)}
          />
        </aside>
      </div>
    </div>
  );
}
