import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by PostgreSQL, so limits hold across multiple app instances.
 * A single atomic upsert increments the counter (or resets an expired window).
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  if (process.env.DISABLE_RATE_LIMIT === "true") return;
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_buckets (key, count, "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets."resetAt" < now() THEN 1 ELSE rate_limit_buckets.count + 1 END,
      "resetAt" = CASE WHEN rate_limit_buckets."resetAt" < now() THEN now() + make_interval(secs => ${windowSec}) ELSE rate_limit_buckets."resetAt" END
    RETURNING count`;
  if ((rows[0]?.count ?? 0) > limit) throw new AppError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
}
