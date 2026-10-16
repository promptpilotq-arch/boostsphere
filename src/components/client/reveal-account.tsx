"use client";

import { useState } from "react";
import { apiFetch } from "./api";
import { toast } from "./toaster";

/** Shows the full payout account number on demand. Each reveal is audit-logged on the server. */
export function RevealAccount({ payoutId, last4 }: { payoutId: string; last4: string }) {
  const [number, setNumber] = useState<string | null>(null);
  if (number) return <span className="font-mono">{number}</span>;
  return (
    <button
      type="button"
      className="font-mono text-brand hover:underline"
      onClick={async () => {
        const r = await apiFetch<{ accountNumber: string }>(`/api/v1/admin/payouts/${payoutId}`, { body: { decision: "REVEAL_ACCOUNT" } });
        if (r.ok) setNumber(r.data.accountNumber);
        else toast(r.error.message, "error");
      }}
    >
      ••••{last4} (reveal)
    </button>
  );
}
