import type { Metadata } from "next";
import Link from "next/link";
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

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const auth = await requireUserPage(`/checkout/${orderId}`);
  const order = await db.serviceOrder.findUnique({ where: { id: orderId }, include: { service: { include: { platform: true } }, package: true } });
  if (!order || order.userId !== auth.user.id) notFound();
  if (order.status !== "PENDING_PAYMENT") redirect(`/dashboard/orders/${order.id}`);
  const settings = await getSettings();
  const providers = availableProviders(order.currency, { walletEnabled: settings.features.walletEnabled, allowWallet: true });
  const balances = await userBalances(auth.user.id, order.currency);
  const snap = order.pricingSnapshot as { lines: { label: string; amountMinor: number }[] };
  const inputs = order.inputs as Record<string, string>;

  return (
    <div className="container-page max-w-5xl py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">Checkout</h1>
      <p className="mt-1 text-slate-600">Order {order.number}</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-semibold">{order.service.name}</h2>
            <p className="text-sm text-slate-600">
              {order.service.platform.name}
              {order.package ? ` · ${order.package.name}` : ` · ${order.quantity} ${order.service.unitLabel}`}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              {Object.entries(inputs).map(([k, v]) => (
                <div key={k} className="grid gap-1 sm:grid-cols-[160px_1fr]">
                  <dt className="text-slate-500">{k.replace(/_/g, " ")}</dt>
                  <dd className="break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card p-6">
            <h2 className="mb-3 font-semibold">Price breakdown</h2>
            <dl className="space-y-2 text-sm">
              {snap.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <dt className="text-slate-600">{l.label}</dt>
                  <dd className="tabular-nums">{formatMoney(l.amountMinor, order.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold">
                <dt>Total due</dt>
                <dd>
                  <Money minor={order.totalMinor} currency={order.currency} />
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Calculated on our servers at the time of your order.</p>
          </section>
          <Notice tone="blue">
            Unpaid orders are cancelled automatically after {settings.commerce.orderPaymentWindowHours} hours. You can also{" "}
            <ActionButton endpoint={`/api/v1/orders/${order.id}`} body={{ action: "cancel" }} className="link inline p-0" confirm="Cancel this order?" redirect="/dashboard/orders" successMessage="Order cancelled">
              cancel it now
            </ActionButton>
            .
          </Notice>
        </div>
        <aside className="card h-fit p-6 lg:sticky lg:top-24">
          <PayButton
            target={{ purpose: "SERVICE_ORDER", orderId: order.id }}
            providers={providers.map((p) => ({ key: p.key, displayName: p.displayName, description: p.description }))}
            walletAvailableMinor={formatMoney(balances.available + balances.promotional, order.currency)}
            totalLabel={formatMoney(order.totalMinor, order.currency)}
          />
          <p className="mt-4 text-center text-xs text-slate-500">
            <Link href="/legal/refunds" className="hover:underline">
              Refund policy
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
