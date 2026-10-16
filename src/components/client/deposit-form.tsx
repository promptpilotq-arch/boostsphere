"use client";

import { useRef, useState } from "react";
import { apiFetch, newIdempotencyKey } from "./api";

export function DepositForm({ currency, providers }: { currency: string; providers: { key: string; displayName: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(newIdempotencyKey());
  if (!providers.length) return <p className="mt-2 text-sm text-slate-600">No deposit method is configured yet.</p>;
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const major = String(fd.get("amount") ?? "");
        if (!/^\d+(\.\d{1,2})?$/.test(major)) return setError("Enter a valid amount");
        setPending(true);
        setError(null);
        const [w, f = ""] = major.split(".");
        const amountMinor = Number(w) * 100 + Number(f.padEnd(2, "0"));
        const r = await apiFetch<{ redirectUrl: string }>("/api/v1/payments", { body: { purpose: "WALLET_DEPOSIT", amountMinor, currency, provider: fd.get("provider") }, idempotencyKey: key.current });
        if (!r.ok) {
          setPending(false);
          key.current = newIdempotencyKey();
          return setError(r.error.message);
        }
        window.location.assign(r.data.redirectUrl);
      }}
    >
      <label className="label" htmlFor="amount">
        Amount ({currency})
      </label>
      <input id="amount" name="amount" inputMode="decimal" className="input" placeholder="5000" required />
      <label className="label" htmlFor="provider">
        Pay with
      </label>
      <select id="provider" name="provider" className="input">
        {providers.map((p) => (
          <option key={p.key} value={p.key}>
            {p.displayName}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Redirecting…" : "Continue"}
      </button>
    </form>
  );
}
