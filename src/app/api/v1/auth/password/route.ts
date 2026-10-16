import { z } from "zod";
import { route } from "@/server/http";
import { requestPasswordReset, resetPassword } from "@/server/auth/account";

/** POST { email } requests a reset link; POST { token, password } sets a new password. */
export const POST = route(
  async ({ body, ip }) => {
    const input = await body(z.union([z.object({ token: z.string().min(10), password: z.string() }), z.object({ email: z.string().email() })]));
    if ("token" in input) {
      await resetPassword(input.token, input.password, ip);
      return { reset: true };
    }
    await requestPasswordReset(input.email);
    return { message: "If an account exists for that email, a reset link is on its way." };
  },
  { rateLimit: { name: "password-reset", limit: 5, windowSec: 900 } },
);
