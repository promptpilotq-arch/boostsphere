"use client";

import { useRef, useState } from "react";
import { apiFetch, newIdempotencyKey } from "./api";

type Provider = { key: string; displayName: string; description: string };

/** Choose a provider and start payment. The server creates the payment record and returns the checkout URL. */
export function PayButton({ target, providers, walletAvailableMinor, totalLabel }: { target: Record<string, unknown>; providers: Provider[]; walletAvailableMinor?: string; totalLabel: string }) {
  const [provider, setProvider] = useState(providers[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(newIdempotencyKey());

  if (!providers.length) {
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        No payment method is configured for this currency yet. Administrators: set provider credentials in the environment (see docs/PAYMENTS.md).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">Payment method</legend>
        <div className="space-y-2">
          {providers.map((p) => (
            <label key={p.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${provider === p.key ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-slate-200"}`}>
              <input type="radio" name="provider" value={p.key} checked={provider === p.key} onChange={() => setProvider(p.key)} className="mt-1" />
              <span>
                <span className="font-medium">{p.displayName}</span>
                <span className="block text-sm text-slate-600">
                  {p.description}
                  {p.key === "wallet" && walletAvailableMinor ? ` · Balance ${walletAvailableMinor}` : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn-gradient w-full py-3 text-base"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const r = await apiFetch<{ redirectUrl: string }>("/api/v1/payments", { body: { ...target, provider }, idempotencyKey: `${key.current}:${provider}` });
          if (!r.ok) {
            setPending(false);
            setError(r.error.message);
            key.current = newIdempotencyKey();
            return;
          }
          window.location.assign(r.data.redirectUrl);
        }}
      >
        {pending ? "Redirecting to secure payment…" : `Pay ${totalLabel}`}
      </button>
      <p className="text-center text-xs text-slate-500">Your order is confirmed only after the payment provider verifies your payment with us.</p>
    </div>
  );
}
