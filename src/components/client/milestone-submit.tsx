"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "./api";
import { toast } from "./toaster";

/** Submit transfer evidence: an optional screenshot/PDF (uploaded to private storage) plus a note. */
export function MilestoneSubmit({ purchaseId, milestoneId }: { purchaseId: string; milestoneId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        setError(null);
        let evidenceKey: string | null = null;
        const file = fd.get("file");
        if (file instanceof File && file.size > 0) {
          const up = new FormData();
          up.append("file", file);
          const res = await fetch(`/api/v1/purchases/${purchaseId}`, { method: "POST", body: up });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            setPending(false);
            return setError(json.error?.message ?? "Upload failed");
          }
          evidenceKey = json.key;
        }
        const r = await apiFetch(`/api/v1/purchases/${purchaseId}`, { body: { action: "submit_milestone", milestoneId, evidenceNote: fd.get("note"), evidenceKey } });
        setPending(false);
        if (!r.ok) return setError(r.error.message);
        toast("Evidence submitted");
        router.refresh();
      }}
    >
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <textarea name="note" rows={3} required minLength={10} className="input" placeholder="Describe what you did (e.g. 'Added buyer as Owner in Business Settings on 12 Oct')." aria-label="Evidence note" />
      <label className="block text-xs text-slate-600">
        Optional screenshot or PDF (max 5 MB). Make sure it shows no passwords or codes.
        <input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="mt-1 block w-full text-sm" />
      </label>
      <button className="btn-primary" disabled={pending}>
        {pending ? "Submitting…" : "Submit evidence"}
      </button>
    </form>
  );
}
