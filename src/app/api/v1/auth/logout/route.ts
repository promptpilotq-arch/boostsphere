import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { authFromRequest, clearedSessionCookie, revokeSession } from "@/server/auth/session";

export const POST = route(async ({ req }) => {
  const auth = await authFromRequest(req, { allowPending: true });
  if (auth) await revokeSession(auth.sessionId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearedSessionCookie);
  return res;
});
