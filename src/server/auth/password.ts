import bcrypt from "bcryptjs";
import { z } from "zod";

const COST = process.env.NODE_ENV === "test" ? 4 : 12;

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password is too long")
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Password must contain letters and numbers");

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Used to keep login timing similar whether or not the email exists.
let dummy: string | undefined;
export const dummyHash = () => (dummy ??= bcrypt.hashSync("timing-equaliser", COST));
