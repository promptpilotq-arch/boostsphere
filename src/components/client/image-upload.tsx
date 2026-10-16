"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./toaster";

export function ImageUpload({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        const res = await fetch(`/api/v1/seller/listings/${listingId}`, { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        setPending(false);
        if (!res.ok) return toast(json.error?.message ?? "Upload failed", "error");
        toast("Image added");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }}
    >
      <input type="file" name="image" accept="image/png,image/jpeg,image/webp" required className="block w-full text-sm" aria-label="Image file" />
      <input name="alt" placeholder="Short description" className="input" aria-label="Image description" />
      <button className="btn-secondary w-full" disabled={pending}>
        {pending ? "Uploading…" : "Upload image"}
      </button>
    </form>
  );
}
