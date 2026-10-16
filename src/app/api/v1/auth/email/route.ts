import { z } from "zod";
import { route } from "@/server/http";
import { sendVerificationEmail, verifyEmail } from "@/server/auth/account";
import { AppError } from "@/lib/errors";

/** POST { token } verifies an email address. POST {} (signed in) re-sends the verification email. */
export const POST = route(
  async ({ body, auth }) => {
    const { token } = await body(z.object({ token: z.string().min(10).max(200).optional() }));
    if (token) {
      await verifyEmail(token);
      return { verified: true };
    }
    if (!auth) throw new AppError("UNAUTHENTICATED", "Sign in to resend the verification email");
    if (auth.user.emailVerifiedAt) return { verified: true };
    await sendVerificationEmail(auth.user.id, auth.user.email);
    return { sent: true };
  },
  { rateLimit: { name: "email-verify", limit: 10, windowSec: 3600 } },
);
