"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "./api";
import { toast } from "./toaster";

export function TwoFactorSetup() {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (codes) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-emerald-800">Two-factor authentication is on.</p>
        <p className="text-sm text-slate-600">Save these single-use backup codes somewhere safe. They won&apos;t be shown again.</p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 font-mono text-sm">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button className="btn-primary" onClick={() => router.refresh()}>
          Done
        </button>
      </div>
    );
  }
  if (!setup) {
    return (
      <button
        className="btn-primary"
        onClick={async () => {
          const r = await apiFetch<{ secret: string; qrDataUrl: string }>("/api/v1/me/security", { body: { action: "2fa_setup" } });
          if (r.ok) setSetup(r.data);
          else toast(r.error.message, "error");
        }}
      >
        Set up authenticator app
      </button>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const code = new FormData(e.currentTarget).get("code");
        const r = await apiFetch<{ backupCodes: string[] }>("/api/v1/me/security", { body: { action: "2fa_enable", code } });
        if (r.ok) setCodes(r.data.backupCodes);
        else setError(r.error.message);
      }}
    >
      <p className="text-sm text-slate-600">Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qrDataUrl} alt="Two-factor authentication QR code" className="h-44 w-44 rounded-xl border border-slate-200" />
      <p className="text-xs text-slate-500">
        Can&apos;t scan? Enter this key: <code className="break-all font-mono">{setup.secret}</code>
      </p>
      <input name="code" inputMode="numeric" autoComplete="one-time-code" className="input max-w-[200px] tracking-widest" required aria-label="6-digit code" />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button className="btn-primary">Verify and enable</button>
    </form>
  );
}
