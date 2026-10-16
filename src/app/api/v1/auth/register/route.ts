import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { register, registerSchema, login } from "@/server/auth/account";
import { sessionCookie } from "@/server/auth/session";

export const POST = route(
  async ({ body, ip, req }) => {
    const input = await body(registerSchema);
    const user = await register(input, ip);
    // Sign the new user in immediately; ordering still requires a verified email.
    const s = await login({ email: input.email, password: input.password }, { ip, userAgent: req.headers.get("user-agent") });
    const res = NextResponse.json({ user: { id: user.id, email: user.email }, verificationRequired: true }, { status: 201 });
    res.cookies.set(sessionCookie(s.token, s.expiresAt));
    return res;
  },
  { rateLimit: { name: "register", limit: 5, windowSec: 3600 } },
);
