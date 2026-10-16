import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";
import { AppError, errorBody } from "@/lib/errors";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { authFromRequest, requireAuth, requirePermission, type Auth } from "./auth/session";
import type { Permission } from "./auth/rbac";
import { rateLimit } from "./rate-limit";

export type RouteCtx<P = Record<string, string>> = {
  req: Request;
  auth: Auth;
  params: P;
  ip: string;
  body: <T>(schema: ZodType<T, ZodTypeDef, unknown>) => Promise<T>;
  query: URLSearchParams;
};

type AuthedCtx<P> = RouteCtx<P> & { auth: NonNullable<Auth> };

type Options = {
  auth?: "required" | "optional";
  permission?: Permission;
  /** Origin check for state-changing requests (default on for non-GET). Disable only for signed webhooks. */
  csrf?: boolean;
  rateLimit?: { name: string; limit: number; windowSec: number; by?: "ip" | "user" };
};

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(req.url).origin, (process.env.APP_URL ?? "").replace(/\/$/, "")]);
  if (!origin || !allowed.has(origin)) throw new AppError("FORBIDDEN", "Cross-site request blocked");
}

/**
 * Wraps every API route: authentication, authorization, CSRF origin check, rate limiting,
 * JSON parsing with Zod validation and a consistent error envelope { error: { code, message } }.
 */
export function route<P = Record<string, string>>(fn: (ctx: RouteCtx<P>) => Promise<unknown>, opts?: Omit<Options, "permission" | "auth"> & { auth?: "optional"; permission?: never }): (req: Request, context: { params: Promise<P> }) => Promise<Response>;
export function route<P = Record<string, string>>(fn: (ctx: AuthedCtx<P>) => Promise<unknown>, opts: Options & ({ auth: "required" } | { permission: Permission })): (req: Request, context: { params: Promise<P> }) => Promise<Response>;
export function route<P>(fn: (ctx: never) => Promise<unknown>, opts: Options = {}) {
  return async (req: Request, context?: { params: Promise<P> }) => {
    try {
      const method = req.method.toUpperCase();
      if (method !== "GET" && method !== "HEAD" && opts.csrf !== false) checkOrigin(req);
      const ip = clientIp(req);
      let auth = await authFromRequest(req);
      if (opts.permission) auth = requirePermission(auth, opts.permission);
      else if (opts.auth === "required") auth = requireAuth(auth);
      if (opts.rateLimit) {
        const who = opts.rateLimit.by === "user" && auth ? auth.user.id : ip;
        await rateLimit(`${opts.rateLimit.name}:${who}`, opts.rateLimit.limit, opts.rateLimit.windowSec);
      }
      let rawBody: unknown;
      const ctx: RouteCtx<P> = {
        req,
        auth,
        ip,
        params: ((await context?.params) ?? {}) as P,
        query: new URL(req.url).searchParams,
        body: async (schema) => {
          if (rawBody === undefined) {
            const type = req.headers.get("content-type") ?? "";
            if (!type.includes("application/json")) throw new AppError("BAD_REQUEST", "Expected a JSON request body");
            rawBody = await req.json().catch(() => {
              throw new AppError("BAD_REQUEST", "Malformed JSON body");
            });
          }
          return schema.parse(rawBody);
        },
      };
      const result = await (fn as (c: RouteCtx<P>) => Promise<unknown>)(ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      const { status, body } = errorBody(err);
      return NextResponse.json(body, { status });
    }
  };
}

/**
 * Idempotency for operations that create charges, orders or ledger entries.
 * The client sends an Idempotency-Key header; a retried request with the same key and body
 * returns the original response instead of repeating the side effect.
 */
export async function idempotent<T>(ctx: { req: Request; auth: Auth }, scope: string, payload: unknown, fn: () => Promise<T>): Promise<T> {
  const key = ctx.req.headers.get("idempotency-key");
  const userId = ctx.auth?.user.id;
  if (!key || !userId) return fn();
  if (key.length > 100) throw new AppError("BAD_REQUEST", "Idempotency-Key is too long");
  const requestHash = sha256(JSON.stringify(payload ?? null));
  const existing = await db.idempotencyKey.findUnique({ where: { userId_scope_key: { userId, scope, key } } });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new AppError("CONFLICT", "Idempotency-Key was reused with a different request");
    if (existing.responseBody === null) throw new AppError("CONFLICT", "A request with this Idempotency-Key is still being processed");
    return existing.responseBody as T;
  }
  let row;
  try {
    row = await db.idempotencyKey.create({ data: { userId, scope, key, requestHash } });
  } catch {
    throw new AppError("CONFLICT", "A request with this Idempotency-Key is still being processed");
  }
  try {
    const result = await fn();
    await db.idempotencyKey.update({
      where: { id: row.id },
      data: { responseStatus: 200, responseBody: JSON.parse(JSON.stringify(result ?? null)) },
    });
    return result;
  } catch (e) {
    await db.idempotencyKey.delete({ where: { id: row.id } }).catch(() => {});
    throw e;
  }
}

export function paginate(query: URLSearchParams, defaults = { pageSize: 20, max: 100 }) {
  const page = Math.max(1, Number(query.get("page")) || 1);
  const pageSize = Math.min(defaults.max, Math.max(1, Number(query.get("pageSize")) || defaults.pageSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const pageMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});
