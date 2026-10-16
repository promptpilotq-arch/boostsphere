import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { sandboxEnabled } from "@/server/payments/sandbox";
import { ActionButton } from "@/components/client/action-button";
import { Money } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sandbox payment", robots: { index: false } };

/** DEVELOPMENT ONLY: stands in for a provider's hosted checkout page. Returns 404 in production. */
export default async function SandboxPayPage({ params }: { params: Promise<{ reference: string }> }) {
  if (!sandboxEnabled()) notFound();
  const { reference } = await params;
  const auth = await requireUserPage(`/pay/sandbox/${reference}`);
  const payment = await db.payment.findUnique({ where: { reference } });
  if (!payment || payment.userId !== auth.user.id || payment.provider !== "sandbox") notFound();
  return (
    <main id="main" className="grid min-h-screen place-items-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <p className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">Sandbox — no real money</p>
        <h1 className="mt-4 text-xl font-bold">Simulated checkout</h1>
        <p className="mt-1 text-sm text-slate-600">Reference {payment.reference}</p>
        <Money minor={payment.amountMinor} currency={payment.currency} className="mt-4 block text-3xl font-bold" />
        {payment.status !== "PENDING" ? (
          <p className="mt-6 text-sm text-slate-600">This payment is already {payment.status.toLowerCase()}.</p>
        ) : (
          <div className="mt-6 grid gap-2">
            <ActionButton endpoint="/api/v1/payments/sandbox" body={{ reference, outcome: "success" }} className="btn-primary py-3" redirect="{redirectUrl}">
              Simulate successful payment
            </ActionButton>
            <ActionButton endpoint="/api/v1/payments/sandbox" body={{ reference, outcome: "failed" }} className="btn-secondary py-3" redirect="{redirectUrl}">
              Simulate declined payment
            </ActionButton>
          </div>
        )}
        <p className="mt-6 text-xs text-slate-500">This page sends a signed webhook through the same verification pipeline used by real providers. It is disabled when NODE_ENV=production.</p>
      </div>
    </main>
  );
}
