"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { apiFetch, interpolate, newIdempotencyKey, type ApiError } from "./api";
import { toast } from "./toaster";

type Success = { redirect?: string; refresh?: boolean; message?: string; reset?: boolean; hardRedirect?: boolean };

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur: Record<string, unknown> = obj;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) {
      cur[k] = value;
      return;
    }
    const nextIsIndex = /^\d+$/.test(keys[i + 1]);
    cur[k] ??= nextIsIndex ? [] : {};
    cur = cur[k] as Record<string, unknown>;
  });
}

/**
 * Serialise a form to JSON with a few conventions:
 *  name="a.b" / "list[0].x"   nested objects and arrays
 *  type=checkbox              boolean (unless data-array, which collects values)
 *  type=number                number (empty → omitted)
 *  data-money                 major units → integer minor units (×100)
 *  data-lines                 textarea → array of non-empty lines
 *  data-json                  textarea → parsed JSON
 *  data-nullable              empty → null
 */
export function formToJson(form: HTMLFormElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const arrays: Record<string, string[]> = {};
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name || el.disabled || el.type === "submit" || el.type === "button" || el.type === "file") continue;
    const d = el.dataset;
    if (el.type === "checkbox") {
      if (d.array !== undefined) {
        arrays[el.name] ??= [];
        if (el.checked) arrays[el.name].push(el.value);
      } else setPath(out, el.name, el.checked);
      continue;
    }
    if (el.type === "radio") {
      if (el.checked) setPath(out, el.name, el.value);
      continue;
    }
    const raw = el.value;
    if (raw === "" && d.nullable !== undefined) {
      setPath(out, el.name, null);
      continue;
    }
    if (raw === "" && (el.type === "number" || d.money !== undefined)) continue;
    let value: unknown = raw;
    if (d.money !== undefined) value = Math.round(Number(raw) * 100);
    else if (el.type === "number") value = Number(raw);
    else if (d.lines !== undefined) value = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    else if (d.json !== undefined) {
      try {
        value = JSON.parse(raw || "null");
      } catch {
        throw new Error(`"${el.name}" must be valid JSON`);
      }
    }
    setPath(out, el.name, value);
  }
  for (const [k, v] of Object.entries(arrays)) setPath(out, k, v);
  return out;
}

export function ApiForm({
  action,
  method = "POST",
  extra,
  success,
  idempotent,
  children,
  className,
  confirm,
}: {
  action: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  extra?: Record<string, unknown>;
  success?: Success;
  idempotent?: boolean;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(newIdempotencyKey());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    let body: Record<string, unknown>;
    try {
      body = { ...formToJson(e.currentTarget), ...(extra ?? {}) };
    } catch (err) {
      setError({ code: "VALIDATION_ERROR", message: (err as Error).message });
      return;
    }
    setPending(true);
    const form = e.currentTarget;
    const res = await apiFetch(action, { method, body, idempotencyKey: idempotent ? key.current : undefined });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      if (res.status === 401) toast("Please sign in to continue", "error");
      return;
    }
    key.current = newIdempotencyKey();
    if (success?.message) toast(success.message);
    if (success?.reset) form.reset();
    if (success?.redirect) {
      const url = interpolate(success.redirect, res.data);
      if (success.hardRedirect || /^https?:/.test(url)) window.location.assign(url);
      else router.push(url);
    }
    if (success?.refresh !== false) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className={className} noValidate={false} aria-busy={pending}>
      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">{error.message}</p>
          {error.details && error.details.length > 1 && (
            <ul className="mt-1 list-disc pl-5">
              {error.details.slice(0, 6).map((d, i) => (
                <li key={i}>{d.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}

export function SubmitButton({ children, className = "btn-primary", pendingLabel }: { children: ReactNode; className?: string; pendingLabel?: string }) {
  return (
    <button type="submit" className={className} data-pending-label={pendingLabel}>
      {children}
    </button>
  );
}
