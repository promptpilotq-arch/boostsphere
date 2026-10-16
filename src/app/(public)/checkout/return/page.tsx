import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserPage } from "@/server/auth/current";
import { verifyAndSettle } from "@/server/payments/process";
import { Money } from "@/components/ui";

export const metadata: Metadata = { title: "Payment status", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Landing page after the provider redirects back. The redirect proves nothing by itself, so we
 * ask the provider server-to-server for the authoritative status before showing a result.
 */
export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string; tx_ref?: string }> }) {
  const sp = await searchParams;
  const reference = sp.reference ?? sp.trxref ?? sp.tx_ref;
  if (!reference) notFound();
  const auth = await requireUserPage(`/checkout/return?reference=${reference}`);
  const existing = await db.payment.findUnique({ where: { reference } });
  if (!existing || existing.userId !== auth.user.id) notFound();
  let payment = existing;
  let verifyError: string | null = null;
  try {
    payment = await verifyAndSettle(reference);
  } catch (e) {
    verifyError = e instanceof Error ? e.message : "Verification failed";
  }
  const order = payment.orderId ? await db.serviceOrder.findUnique({ where: { id: payment.orderId } }) : null;
  const target = payment.orderId ? `/dashboard/orders/${payment.orderId}` : payment.purchaseId ? `/dashboard/purchases/${payment.purchaseId}` : "/dashboard/wallet";
  const ok = payment.status === "SUCCEEDED";
  const failed = payment.status === "FAILED" || payment.status === "ABANDONED";

  return (
    <div className="container-page max-w-xl py-16 text-center">
      <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl ${ok ? "bg-emerald-100 text-emerald-700" : failed ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} aria-hidden>
        {ok ? "✓" : failed ? "✕" : "…"}
      </div>
      <h1 className="mt-6 text-2xl font-bold">{ok ? "Payment confirmed" : failed ? "Payment not completed" : "Payment pending"}</h1>
      <p className="mt-2 text-slate-600">
        {ok
          ? payment.purpose === "WALLET_DEPOSIT"
            ? "Your deposit has been added to your wallet."
            : `Thank you! ${order ? `Order ${order.number} is confirmed and queued for fulfillment.` : "Your purchase is confirmed. The seller has been notified to start the transfer."}`
          : failed
            ? `You have not been charged for this attempt. ${payment.failureReason ?? ""}`
            : "We haven't received confirmation from the payment provider yet. This page will reflect the result once the provider confirms — you'll also get a notification."}
      </p>
      {verifyError && <p className="mt-2 text-sm text-amber-700">We couldn&apos;t reach the payment provider just now ({verifyError}). We&apos;ll keep checking automatically.</p>}
      <p className="mt-4 text-sm text-slate-500">
        Reference {payment.reference} · <Money minor={payment.amountMinor} currency={payment.currency} />
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href={target} className="btn-primary">
          {ok ? "View details" : failed ? "Try again" : "Go to dashboard"}
        </Link>
        {ok && (
          <a href={`/api/v1/receipts/${payment.reference}`} className="btn-secondary">
            Download receipt
          </a>
        )}
      </div>
    </div>
  );
}
