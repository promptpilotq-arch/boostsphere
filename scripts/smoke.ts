/**
 * Page smoke test: requests every page as guest, customer and admin and reports any non-2xx/3xx/404.
 * Usage (dev server running, seeded DB):  npx tsx --env-file=.env scripts/smoke.ts [baseUrl]
 */
import { db } from "../src/lib/db";
import { createSession, SESSION_COOKIE } from "../src/server/auth/session";

const base = process.argv[2] ?? "http://localhost:3000";

async function cookieFor(email: string) {
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  const { token } = await createSession(u.id, { userAgent: "smoke-test" });
  return `${SESSION_COOKIE}=${token}`;
}

const PUBLIC = ["/", "/services", "/services?q=youtube&sort=price_asc", "/platforms/instagram", "/platforms/youtube?category=optimization", "/services/youtube-thumbnail-title-optimization", "/services/instagram-content-promotion", "/marketplace", "/marketplace?platform=youtube&sort=price_desc", "/marketplace/sample-listing-1", "/how-it-works", "/pricing", "/faq", "/contact", "/about", "/legal/terms", "/legal/privacy", "/legal/refunds", "/legal/acceptable-use", "/login", "/register", "/forgot-password", "/reset-password?token=x", "/verify-email", "/sitemap.xml", "/robots.txt"];
const CUSTOMER = ["/dashboard", "/dashboard/selling", "/dashboard/orders", "/dashboard/purchases", "/dashboard/wallet", "/dashboard/transactions", "/dashboard/saved", "/dashboard/selling", "/dashboard/selling/new", "/dashboard/support", "/dashboard/support/new", "/dashboard/notifications", "/dashboard/referrals", "/dashboard/settings", "/dashboard/security"];
const ADMIN = ["/admin", "/admin/payouts", "/admin/payouts?all=1", "/admin?days=7", "/admin/orders", "/admin/orders?t=5", "/admin/payments", "/admin/refunds", "/admin/services", "/admin/services/new", "/admin/catalog", "/admin/coupons", "/admin/marketplace", "/admin/marketplace?s=APPROVED", "/admin/sellers", "/admin/reports", "/admin/purchases", "/admin/disputes", "/admin/support", "/admin/reviews", "/admin/users", "/admin/audit", "/admin/settings"];

async function check(path: string, cookie?: string) {
  const res = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  return res.status;
}

async function main() {
  const customer = await cookieFor("customer@boostsphere.test");
  const admin = await cookieFor("admin@boostsphere.test");
  const failures: string[] = [];
  const run = async (label: string, paths: string[], cookie?: string, expect = (s: number) => s < 400) => {
    for (const p of paths) {
      const s = await check(p, cookie);
      const ok = expect(s);
      console.log(`${ok ? "ok  " : "FAIL"} ${s} ${label.padEnd(8)} ${p}`);
      if (!ok) failures.push(`${label} ${p} → ${s}`);
    }
  };
  await run("guest", PUBLIC);
  await run("customer", CUSTOMER, customer);
  await run("admin", ADMIN, admin);
  // Access control: guests are redirected from private pages, customers from admin pages.
  await run("guest", ["/dashboard", "/admin"], undefined, (s) => s === 307 || s === 303 || s === 302);
  await run("customer", ["/admin", "/admin/settings"], customer, (s) => s === 307 || s === 303 || s === 302);
  await run("guest", ["/definitely-missing"], undefined, (s) => s === 404);
  console.log(failures.length ? `\n${failures.length} failure(s):\n${failures.join("\n")}` : "\nAll pages OK");
  await db.session.deleteMany({ where: { userAgent: "smoke-test" } });
  await db.$disconnect();
  process.exit(failures.length ? 1 : 0);
}

main();
