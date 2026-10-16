import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { expireStaleOrders } from "@/server/orders";
import { expireUnpaidPurchases } from "@/server/marketplace";
import { reconcilePending } from "@/server/payments/process";

/**
 * Scheduled maintenance — call every 10–15 minutes from your scheduler with
 * `Authorization: Bearer $CRON_SECRET`. Reconciles pending payments, then expires
 * unpaid orders and listing reservations, and prunes expired sessions/rate-limit rows.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const reconciled = await reconcilePending(15);
  const expiredOrders = await expireStaleOrders();
  const expiredPurchases = await expireUnpaidPurchases();
  const now = new Date();
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } });
  return NextResponse.json({ reconciled: reconciled.length, expiredOrders, expiredPurchases });
}
