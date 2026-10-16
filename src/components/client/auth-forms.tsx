"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "./api";

/** Only allow same-site relative redirects after login (prevents open redirects). */
function safeNext(next: string | null, fallback = "/dashboard") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

function ErrorBox({ message }: { message: string | null }) {
  return message ? (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  ) : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"password" | "2fa">("password");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const r =
      step === "password"
        ? await apiFetch<{ twoFactorRequired: boolean }>("/api/v1/auth/login", { body: { email: fd.get("email"), password: fd.get("password") } })
        : await apiFetch("/api/v1/auth/2fa/verify", { body: { code: fd.get("code") } });
    setPending(false);
    if (!r.ok) return setError(r.error.message);
    if (step === "password" && (r.data as { twoFactorRequired: boolean }).twoFactorRequired) return setStep("2fa");
    router.push(safeNext(params.get("next")));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
      <ErrorBox message={error} />
      {step === "password" ? (
        <>
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="email" required className="input" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="label">
                Password
              </label>
              <a href="/forgot-password" className="mb-1.5 text-sm text-brand hover:underline">
                Forgot password?
              </a>
            </div>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="code" className="label">
            Authentication code
          </label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input tracking-widest" autoFocus />
          <p className="mt-1.5 text-xs text-slate-500">Enter the 6-digit code from your authenticator app, or a backup code.</p>
        </div>
      )}
      <button type="submit" className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Signing in…" : step === "password" ? "Sign in" : "Verify"}
      </button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const r = await apiFetch("/api/v1/auth/register", {
      body: { displayName: fd.get("displayName"), email: fd.get("email"), password: fd.get("password"), referralCode: fd.get("referralCode") || null, acceptTerms: fd.get("acceptTerms") === "on" },
    });
    setPending(false);
    if (!r.ok) return setError(r.error.message);
    router.push(safeNext(params.get("next")));
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
      <ErrorBox message={error} />
      <div>
        <label htmlFor="displayName" className="label">
          Full name
        </label>
        <input id="displayName" name="displayName" autoComplete="name" required className="input" />
      </div>
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" aria-describedby="pw-hint" />
        <p id="pw-hint" className="mt-1.5 text-xs text-slate-500">
          At least 10 characters, with letters and numbers.
        </p>
      </div>
      <div>
        <label htmlFor="referralCode" className="label">
          Referral code <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input id="referralCode" name="referralCode" defaultValue={params.get("ref") ?? ""} className="input uppercase" />
      </div>
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4" />
        <span>
          I agree to the{" "}
          <a href="/legal/terms" className="link" target="_blank">
            Terms of Service
          </a>
          ,{" "}
          <a href="/legal/privacy" className="link" target="_blank">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/legal/acceptable-use" className="link" target="_blank">
            Acceptable Use Policy
          </a>
          .
        </span>
      </label>
      <button type="submit" className="btn-gradient w-full py-3" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (done) return <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{done}</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await apiFetch<{ message: string }>("/api/v1/auth/password", { body: { email: new FormData(e.currentTarget).get("email") } });
        setPending(false);
        if (r.ok) setDone(r.data.message);
        else setError(r.error.message);
      }}
    >
      <ErrorBox message={error} />
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <button className="btn-primary w-full py-3" disabled={pending}>
        Send reset link
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("password") !== fd.get("confirm")) return setError("Passwords do not match");
        const r = await apiFetch("/api/v1/auth/password", { body: { token, password: fd.get("password") } });
        if (!r.ok) return setError(r.error.message);
        router.push("/login?reset=1");
      }}
    >
      <ErrorBox message={error} />
      <div>
        <label htmlFor="password" className="label">
          New password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" />
      </div>
      <div>
        <label htmlFor="confirm" className="label">
          Confirm password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
      </div>
      <button className="btn-primary w-full py-3">Set new password</button>
    </form>
  );
}
