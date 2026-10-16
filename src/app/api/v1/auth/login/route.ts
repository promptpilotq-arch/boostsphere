import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { login, loginSchema } from "@/server/auth/account";
import { sessionCookie } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";

export const POST = route(
  async ({ body, ip, req }) => {
    const input = await body(loginSchema);
    // Per-account limit in addition to the per-IP limit, to slow credential stuffing.
    await rateLimit(`login-account:${input.email}`, 10, 900);
    const result = await login(input, { ip, userAgent: req.headers.get("user-agent") });
    const res = NextResponse.json({ twoFactorRequired: result.twoFactorRequired });
    res.cookies.set(sessionCookie(result.token, result.expiresAt));
    return res;
  },
  { rateLimit: { name: "login", limit: 20, windowSec: 900 } },
);
