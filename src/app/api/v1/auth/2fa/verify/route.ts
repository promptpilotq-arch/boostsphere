import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { route } from "@/server/http";
import { completeTwoFactor } from "@/server/auth/account";
import { authFromRequest, sessionCookie } from "@/server/auth/session";

export const POST = route(
  async ({ body, ip, req }) => {
    const { code } = await body(z.object({ code: z.string().trim().min(6).max(20) }));
    const pending = await authFromRequest(req, { allowPending: true });
    if (!pending) throw new AppError("UNAUTHENTICATED", "Your sign-in attempt expired. Please sign in again.");
    const s = await completeTwoFactor(pending.sessionId, code, { ip, userAgent: req.headers.get("user-agent") });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookie(s.token, s.expiresAt));
    return res;
  },
  { rateLimit: { name: "2fa", limit: 10, windowSec: 900 } },
);
