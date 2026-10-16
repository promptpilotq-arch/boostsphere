"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { InputField } from "@/lib/service-inputs";
import { formatMoney } from "@/lib/money";
import { apiFetch, newIdempotencyKey, type ApiError } from "./api";

type Pkg = { id: string; name: string; description: string; priceMinor: number; currency: string; features: string[]; duration: string | null };
type Quote = { currency: string; totalMinor: number; lines: { label: string; amountMinor: number }[] };

export function OrderForm({
  service,
  packages,
  fields,
  signedIn,
  verified,
}: {
  service: { id: string; pricingModel: "PACKAGE" | "PER_UNIT"; minQuantity: number | null; maxQuantity: number | null; unitSize: number; unitLabel: string; slug: string };
  packages: Pkg[];
  fields: InputField[];
  signedIn: boolean;
  verified: boolean;
}) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [quantity, setQuantity] = useState(service.minQuantity ?? service.unitSize);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(newIdempotencyKey());

  // The displayed total always comes from the server's quote endpoint.
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await apiFetch<{ quote: Quote }>("/api/v1/quote", {
        body: { serviceId: service.id, packageId: service.pricingModel === "PACKAGE" ? packageId : undefined, quantity: service.pricingModel === "PACKAGE" ? 1 : quantity, couponCode: appliedCoupon || undefined },
      });
      if (r.ok) {
        setQuote(r.data.quote);
        setQuoteError(null);
      } else {
        setQuote(null);
        setQuoteError(r.error.message);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [service.id, service.pricingModel, packageId, quantity, appliedCoupon]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const inputs: Record<string, string> = {};
    for (const f of fields) inputs[f.key] = String(fd.get(`inputs.${f.key}`) ?? "");
    setPending(true);
    setError(null);
    const r = await apiFetch<{ order: { id: string } }>("/api/v1/orders", {
      idempotencyKey: key.current,
      body: {
        serviceId: service.id,
        packageId: service.pricingModel === "PACKAGE" ? packageId : undefined,
        quantity: service.pricingModel === "PACKAGE" ? 1 : quantity,
        inputs,
        couponCode: appliedCoupon || undefined,
        acceptTerms: fd.get("acceptTerms") === "on",
      },
    });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push(`/checkout/${r.data.order.id}`);
  }

  if (!signedIn) {
    return (
      <div className="card p-6">
        <p className="font-semibold">Ready to order?</p>
        <p className="mt-1 text-sm text-slate-600">Sign in or create a free account to place an order and track its progress.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <a href={`/login?next=/services/${service.slug}`} className="btn-primary">
            Sign in
          </a>
          <a href={`/register?next=/services/${service.slug}`} className="btn-secondary">
            Create account
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6" aria-busy={pending}>
      {service.pricingModel === "PACKAGE" ? (
        <fieldset>
          <legend className="label">Choose a package</legend>
          <div className="space-y-3">
            {packages.map((p) => (
              <label key={p.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${packageId === p.id ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-slate-200 hover:border-slate-300"}`}>
                <input type="radio" name="packageId" value={p.id} checked={packageId === p.id} onChange={() => setPackageId(p.id)} className="mt-1 accent-[rgb(var(--brand))]" />
                <span className="flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="font-semibold tabular-nums">{formatMoney(p.priceMinor, p.currency)}</span>
                  </span>
                  {p.features.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {p.features.map((f) => (
                        <li key={f}>✓ {f}</li>
                      ))}
                    </ul>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div>
          <label htmlFor="quantity" className="label">
            Quantity ({service.unitLabel})
          </label>
          <input
            id="quantity"
            type="number"
            className="input"
            min={service.minQuantity ?? 1}
            max={service.maxQuantity ?? undefined}
            step={service.unitSize}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Between {service.minQuantity ?? 1} and {service.maxQuantity ?? "∞"}
            {service.unitSize > 1 ? `, in steps of ${service.unitSize}` : ""}.
          </p>
        </div>
      )}

      {fields.map((f) => {
        const id = `in-${f.key}`;
        const common = { id, name: `inputs.${f.key}`, required: f.required, placeholder: f.placeholder, className: "input", maxLength: f.maxLength };
        return (
          <div key={f.key}>
            <label htmlFor={id} className="label">
              {f.label}
              {f.required && <span className="text-red-600"> *</span>}
            </label>
            {f.type === "textarea" ? (
              <textarea {...common} rows={3} />
            ) : f.type === "select" ? (
              <select {...common} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input {...common} type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"} inputMode={f.type === "url" ? "url" : undefined} />
            )}
            {(f.help || f.allowedHosts?.length) && <p className="mt-1.5 text-xs text-slate-500">{f.help ?? `Must be a public link on ${f.allowedHosts!.join(" or ")}.`}</p>}
          </div>
        );
      })}

      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">🔒 We will never ask for your password, login codes or session data. Only public links are needed.</p>

      <div>
        <label htmlFor="coupon" className="label">
          Coupon code
        </label>
        <div className="flex gap-2">
          <input id="coupon" className="input uppercase" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Optional" />
          <button type="button" className="btn-secondary" onClick={() => setAppliedCoupon(coupon.trim())}>
            Apply
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4" aria-live="polite">
        <p className="mb-2 text-sm font-semibold">Price breakdown</p>
        {quote ? (
          <dl className="space-y-1.5 text-sm">
            {quote.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-4">
                <dt className="text-slate-600">{l.label}</dt>
                <dd className="tabular-nums">{formatMoney(l.amountMinor, quote.currency)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(quote.totalMinor, quote.currency)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{quoteError ?? "Calculating…"}</p>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" />
        <span>
          I confirm I own or am authorized to promote this content, and I accept the service terms, refund policy and{" "}
          <a className="link" href="/legal/acceptable-use" target="_blank">
            Acceptable Use Policy
          </a>
          .
        </span>
      </label>

      {!verified && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Verify your email address before ordering — check your inbox, or resend from your dashboard.</p>}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error.message}
        </div>
      )}
      <button type="submit" className="btn-gradient w-full py-3 text-base" disabled={pending || !quote || !verified}>
        {pending ? "Creating order…" : "Continue to payment"}
      </button>
    </form>
  );
}
