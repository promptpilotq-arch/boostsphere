"use client";

export type ApiError = { code: string; message: string; details?: { path: string; message: string }[] };

/** JSON fetch against our own API. Same-origin cookies carry the session; Origin header satisfies CSRF checks. */
export async function apiFetch<T = unknown>(url: string, opts: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<{ ok: true; data: T } | { ok: false; error: ApiError; status: number }> {
  try {
    const res = await fetch(url, {
      method: opts.method ?? "POST",
      headers: { "Content-Type": "application/json", ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: json.error ?? { code: "INTERNAL", message: "Request failed" } };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, error: { code: "NETWORK", message: "Network error — check your connection and try again." } };
  }
}

/** Replace {path.to.value} placeholders with values from an API response. */
export function interpolate(template: string, data: unknown): string {
  const lookup = (path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), data);
  // A template that is exactly one placeholder is a full URL from the server: use it verbatim (same-origin paths only).
  const whole = /^\{([\w.]+)\}$/.exec(template);
  if (whole) {
    const v = String(lookup(whole[1]) ?? "/");
    return v.startsWith("/") && !v.startsWith("//") ? v : /^https:\/\//.test(v) ? v : "/";
  }
  return template.replace(/\{([\w.]+)\}/g, (_, path: string) => {
    const v = path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), data);
    return v == null ? "" : encodeURIComponent(String(v));
  });
}

export const newIdempotencyKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
