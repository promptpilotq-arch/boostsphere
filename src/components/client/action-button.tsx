"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { apiFetch, interpolate, newIdempotencyKey } from "./api";
import { toast } from "./toaster";

/** A button that sends one JSON request (e.g. publish, cancel, approve), then refreshes or redirects. */
export function ActionButton({
  endpoint,
  method = "POST",
  body,
  children,
  className = "btn-secondary",
  confirm,
  successMessage,
  redirect,
  hardRedirect,
  idempotent,
}: {
  endpoint: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  children: ReactNode;
  className?: string;
  confirm?: string;
  successMessage?: string;
  redirect?: string;
  hardRedirect?: boolean;
  idempotent?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const key = useRef(newIdempotencyKey());
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setPending(true);
        const res = await apiFetch(endpoint, { method, body: body ?? {}, idempotencyKey: idempotent ? key.current : undefined });
        setPending(false);
        if (!res.ok) {
          toast(res.error.message, "error");
          return;
        }
        if (successMessage) toast(successMessage);
        if (redirect) {
          const url = interpolate(redirect, res.data);
          if (hardRedirect || /^https?:/.test(url)) window.location.assign(url);
          else router.push(url);
        }
        router.refresh();
      }}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
