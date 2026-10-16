"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./toaster";

/** Multipart upload of a single file to one of our API routes, then refresh. */
export function FileUpload({ endpoint, field, accept, label, successMessage }: { endpoint: string; field: string; accept: string; label: string; successMessage: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setPending(true);
        const res = await fetch(endpoint, { method: "POST", body: new FormData(form) });
        const json = await res.json().catch(() => ({}));
        setPending(false);
        if (!res.ok) return toast(json.error?.message ?? "Upload failed", "error");
        toast(successMessage);
        form.reset();
        router.refresh();
      }}
    >
      <label className="block text-sm text-slate-700">
        {label}
        <input type="file" name={field} accept={accept} required className="mt-1 block w-full text-sm" />
      </label>
      <button className="btn-secondary" disabled={pending}>
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
