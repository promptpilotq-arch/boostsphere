import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { hmacHex } from "@/lib/crypto";
import { call, makeUser, resetDb, seedCatalog } from "../helpers";
import * as servicesRoute from "@/app/api/v1/services/route";
import * as loginRoute from "@/app/api/v1/auth/login/route";
import * as ordersRoute from "@/app/api/v1/orders/route";
import * as orderRoute from "@/app/api/v1/orders/[id]/route";
import * as paymentsRoute from "@/app/api/v1/payments/route";
import * as sandboxRoute from "@/app/api/v1/payments/sandbox/route";
import * as webhookRoute from "@/app/api/v1/webhooks/[provider]/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as adminAnalytics from "@/app/api/v1/admin/analytics/route";
import * as adminServiceRoute from "@/app/api/v1/admin/services/[id]/route";
import * as adminRefundRoute from "@/app/api/v1/admin/refunds/[id]/route";
import * as adminOrderRoute from "@/app/api/v1/admin/orders/[id]/route";

let cat: Awaited<ReturnType<typeof seedCatalog>>;

beforeEach(async () => {
  await resetDb();
  cat = await seedCatalog();
});
afterEach(() => vi.restoreAllMocks());

const orderBody = (overrides: Record<string, unknown> = {}) => ({
  serviceId: cat.packageService.id,
  packageId: cat.packageService.packages[0].id,
  quantity: 1,
  inputs: { target_url: "https://www.instagram.com/p/abc123/" },
  acceptTerms: true,
  ...overrides,
});

async function placeOrder(cookie: string) {
  const r = await call(ordersRoute.POST, { cookie, body: orderBody() });
  expect(r.status).toBe(200);
  return r.json.order as { id: string; totalMinor: number };
}

async function startSandboxPayment(cookie: string, orderId: string) {
  const r = await call(paymentsRoute.POST, { cookie, body: { purpose: "SERVICE_ORDER", orderId, provider: "sandbox" } });
  expect(r.status).toBe(200);
  return r.json as { reference: string; paymentId: string };
}

function paystackWebhook(reference: string, eventId = 1) {
  const raw = JSON.stringify({ event: "charge.success", data: { id: eventId, reference, status: "success" } });
  const sig = hmacHex("sha512", process.env.PAYSTACK_SECRET_KEY!, raw);
  return new Request("http://localhost:3000/api/v1/webhooks/paystack", { method: "POST", headers: { "x-paystack-signature": sig, "content-type": "application/json" }, body: raw });
}

describe("catalog", () => {
  it("1. a guest can browse published services only", async () => {
    const r = await call(servicesRoute.GET);
    expect(r.status).toBe(200);
    const slugs = r.json.items.map((s: { slug: string }) => s.slug);
    expect(slugs).toContain("ig-promo");
    expect(slugs).not.toContain("ig-draft");
  });
});

describe("auth", () => {
  it("2. a registered customer can sign in and receives a session cookie", async () => {
    const { user } = await makeUser(["CUSTOMER"], { password: "Correct-horse-42" });
    const bad = await call(loginRoute.POST, { body: { email: user.email, password: "wrong-password-1" } });
    expect(bad.status).toBe(401);
    const ok = await call(loginRoute.POST, { body: { email: user.email, password: "Correct-horse-42" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/bs_session=.+HttpOnly/i);
  });

  it("rejects state-changing requests from another origin (CSRF)", async () => {
    const { cookie } = await makeUser();
    const r = await call(ordersRoute.POST, { cookie, body: orderBody(), origin: "https://evil.example" });
    expect(r.status).toBe(403);
  });
});

describe("orders", () => {
  it("3. invalid service quantities are rejected", async () => {
    const { cookie } = await makeUser();
    for (const quantity of [0, 11, 2.5]) {
      const r = await call(ordersRoute.POST, { cookie, body: { serviceId: cat.unitService.id, quantity, inputs: { target_url: "https://instagram.com/x" }, acceptTerms: true } });
      expect(r.status).toBe(422);
    }
    const ok = await call(ordersRoute.POST, { cookie, body: { serviceId: cat.unitService.id, quantity: 3, inputs: { target_url: "https://instagram.com/x" }, acceptTerms: true } });
    expect(ok.status).toBe(200);
  });

  it("rejects URLs on the wrong host and draft services", async () => {
    const { cookie } = await makeUser();
    const wrongHost = await call(ordersRoute.POST, { cookie, body: orderBody({ inputs: { target_url: "https://evil.example/p/1" } }) });
    expect(wrongHost.status).toBe(422);
    const draft = await call(ordersRoute.POST, { cookie, body: orderBody({ serviceId: cat.draftService.id, packageId: cat.draftService.packages[0].id }) });
    expect(draft.status).toBe(422);
  });

  it("4. a customer can create a pending order", async () => {
    const { cookie, user } = await makeUser();
    const order = await placeOrder(cookie);
    const row = await db.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("PENDING_PAYMENT");
    expect(row.userId).toBe(user.id);
  });

  it("14. pricing is recalculated on the server, ignoring client totals", async () => {
    const { cookie } = await makeUser();
    const r = await call(ordersRoute.POST, { cookie, body: { ...orderBody(), totalMinor: 1, priceMinor: 1, subtotalMinor: 1 } });
    expect(r.status).toBe(200);
    // ₦50,000 + 7.5% VAT
    expect(r.json.order.totalMinor).toBe(5_000_000 + 375_000);
  });

  it("requires a verified email to order", async () => {
    const { cookie } = await makeUser(["CUSTOMER"], { verified: false });
    const r = await call(ordersRoute.POST, { cookie, body: orderBody() });
    expect(r.status).toBe(403);
  });

  it("8. a customer cannot access another customer's private order", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const order = await placeOrder(a.cookie);
    const r = await call(orderRoute.GET, { cookie: b.cookie, params: { id: order.id } });
    expect(r.status).toBe(404);
    const cancel = await call(orderRoute.POST, { cookie: b.cookie, params: { id: order.id }, body: { action: "cancel" } });
    expect(cancel.status).toBe(404);
  });
});

describe("payments", () => {
  it("5. a failed payment does not mark an order as paid", async () => {
    const { cookie } = await makeUser();
    const order = await placeOrder(cookie);
    const { reference } = await startSandboxPayment(cookie, order.id);
    const r = await call(sandboxRoute.POST, { cookie, body: { reference, outcome: "failed" } });
    expect(r.status).toBe(200);
    expect((await db.payment.findUniqueOrThrow({ where: { reference } })).status).toBe("FAILED");
    expect((await db.serviceOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    expect(await db.transaction.count()).toBe(0);
  });

  it("6. a verified payment updates the order exactly once", async () => {
    const { cookie } = await makeUser();
    const order = await placeOrder(cookie);
    const { reference } = await startSandboxPayment(cookie, order.id);
    await call(sandboxRoute.POST, { cookie, body: { reference, outcome: "success" } });
    await call(sandboxRoute.POST, { cookie, body: { reference, outcome: "success" } });
    const o = await db.serviceOrder.findUniqueOrThrow({ where: { id: order.id }, include: { events: true } });
    expect(o.status).toBe("PAYMENT_CONFIRMED");
    expect(o.events.filter((e) => e.toStatus === "PAYMENT_CONFIRMED")).toHaveLength(1);
    expect(await db.transaction.count({ where: { type: "PAYMENT_RECEIVED" } })).toBe(1);
  });

  it("7. duplicate and concurrent webhooks do not create duplicate transactions", async () => {
    const { cookie, user } = await makeUser();
    const order = await placeOrder(cookie);
    // A Paystack payment record, verified via a mocked Paystack API.
    const payment = await db.payment.create({ data: { reference: "PAY-TESTDUP0001", provider: "paystack", purpose: "SERVICE_ORDER", userId: user.id, orderId: order.id, amountMinor: order.totalMinor, currency: "NGN" } });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ status: true, data: { status: "success", amount: order.totalMinor, currency: "NGN", id: 991, fees: 1000 } }), { status: 200 }),
    );
    const results = await Promise.all([1, 1, 1, 2].map((id) => webhookRoute.POST(paystackWebhook(payment.reference, id), { params: Promise.resolve({ provider: "paystack" }) })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await db.transaction.count({ where: { type: "PAYMENT_RECEIVED", sourceId: payment.id } })).toBe(1);
    expect(await db.orderEvent.count({ where: { orderId: order.id, toStatus: "PAYMENT_CONFIRMED" } })).toBe(1);
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("SUCCEEDED");
  });

  it("rejects webhooks with an invalid signature", async () => {
    const raw = JSON.stringify({ event: "charge.success", data: { reference: "X" } });
    const req = new Request("http://localhost:3000/api/v1/webhooks/paystack", { method: "POST", headers: { "x-paystack-signature": "deadbeef" }, body: raw });
    const res = await webhookRoute.POST(req, { params: Promise.resolve({ provider: "paystack" }) });
    expect(res.status).toBe(401);
  });

  it("does not settle when the provider reports a different amount", async () => {
    const { cookie, user } = await makeUser();
    const order = await placeOrder(cookie);
    const payment = await db.payment.create({ data: { reference: "PAY-TESTAMT0001", provider: "paystack", purpose: "SERVICE_ORDER", userId: user.id, orderId: order.id, amountMinor: order.totalMinor, currency: "NGN" } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: true, data: { status: "success", amount: 100, currency: "NGN", id: 5 } })));
    await webhookRoute.POST(paystackWebhook(payment.reference), { params: Promise.resolve({ provider: "paystack" }) });
    expect((await db.serviceOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("FAILED");
  });

  it("idempotency keys prevent duplicate orders", async () => {
    const { cookie } = await makeUser();
    const headers = { "idempotency-key": "abc-123-key" };
    const a = await call(ordersRoute.POST, { cookie, body: orderBody(), headers });
    const b = await call(ordersRoute.POST, { cookie, body: orderBody(), headers });
    expect(a.json.order.id).toBe(b.json.order.id);
    expect(await db.serviceOrder.count()).toBe(1);
  });
});

describe("authorization", () => {
  it("9. a customer cannot access admin endpoints", async () => {
    const { cookie } = await makeUser(["CUSTOMER"]);
    expect((await call(adminAnalytics.GET, { cookie })).status).toBe(403);
    expect((await call(adminServiceRoute.POST, { cookie, params: { id: cat.packageService.id }, body: { status: "PAUSED" } })).status).toBe(403);
    expect((await call(adminAnalytics.GET)).status).toBe(401);
  });

  it("support agents cannot approve refunds or change the catalog", async () => {
    const { cookie } = await makeUser(["SUPPORT"]);
    expect((await call(adminServiceRoute.POST, { cookie, params: { id: cat.packageService.id }, body: { status: "PAUSED" } })).status).toBe(403);
    expect((await call(adminRefundRoute.POST, { cookie, params: { id: "x" }, body: { decision: "APPROVE" } })).status).toBe(403);
  });

  it("10. an administrator can publish or pause a service", async () => {
    const { cookie } = await makeUser(["ADMIN"]);
    const pause = await call(adminServiceRoute.POST, { cookie, params: { id: cat.packageService.id }, body: { status: "PAUSED" } });
    expect(pause.status).toBe(200);
    const guestView = await call(servicesRoute.GET);
    expect(guestView.json.items.map((s: { slug: string }) => s.slug)).not.toContain("ig-promo");
    const publish = await call(adminServiceRoute.POST, { cookie, params: { id: cat.packageService.id }, body: { status: "PUBLISHED" } });
    expect(publish.status).toBe(200);
    expect(await db.auditLog.count({ where: { entityId: cat.packageService.id } })).toBe(2);
  });

  it("15. sensitive credentials are never exposed in API responses", async () => {
    const { cookie, user } = await makeUser();
    await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: "encrypted-secret", backupCodes: ["hash1"] } });
    const me = await call(meRoute.GET, { cookie });
    const text = JSON.stringify(me.json);
    expect(text).not.toMatch(/passwordHash|twoFactorSecret|backupCodes|tokenHash|encrypted-secret/);
    const order = await placeOrder(cookie);
    const o = await call(orderRoute.GET, { cookie, params: { id: order.id } });
    expect(JSON.stringify(o.json)).not.toMatch(/passwordHash|tokenHash|checkoutUrl|providerKey/);
  });
});

describe("refunds", () => {
  it("13. refunds are recorded accurately (wallet refund)", async () => {
    const customer = await makeUser();
    const admin = await makeUser(["ADMIN"]);
    const order = await placeOrder(customer.cookie);
    const { reference } = await startSandboxPayment(customer.cookie, order.id);
    await call(sandboxRoute.POST, { cookie: customer.cookie, body: { reference, outcome: "success" } });

    const req = await call(orderRoute.POST, { cookie: customer.cookie, params: { id: order.id }, body: { action: "request_refund", reason: "Changed my mind about this campaign" } });
    expect(req.status).toBe(200);
    expect((await db.serviceOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUND_PENDING");

    const partial = 1_000_000;
    const decide = await call(adminRefundRoute.POST, { cookie: admin.cookie, params: { id: req.json.refund.id }, body: { decision: "APPROVE", amountMinor: partial, destination: "WALLET", note: "Partial goodwill refund" } });
    expect(decide.status).toBe(200);
    expect(decide.json.refund.status).toBe("SUCCEEDED");

    const journal = await db.transaction.findMany({ where: { type: "REFUND_ISSUED" } });
    expect(journal).toHaveLength(1);
    expect(journal[0].amountMinor).toBe(-partial);
    const wallet = await db.walletAccount.findUniqueOrThrow({ where: { userId_currency: { userId: customer.user.id, currency: "NGN" } }, include: { entries: true } });
    expect(wallet.entries.reduce((n, e) => n + e.amountMinor, 0)).toBe(partial);
    expect((await db.payment.findUniqueOrThrow({ where: { reference } })).status).toBe("PARTIALLY_REFUNDED");
    // Partial refund restores the order's previous status.
    expect((await db.serviceOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_CONFIRMED");

    // Over-refund is rejected.
    const req2 = await call(orderRoute.POST, { cookie: customer.cookie, params: { id: order.id }, body: { action: "request_refund", reason: "Requesting the remaining balance" } });
    const over = await call(adminRefundRoute.POST, { cookie: admin.cookie, params: { id: req2.json.refund.id }, body: { decision: "APPROVE", amountMinor: order.totalMinor, destination: "WALLET" } });
    expect(over.status).toBe(422);
  });

  it("staff cannot set PAYMENT_CONFIRMED or skip evidence when completing", async () => {
    const customer = await makeUser();
    const support = await makeUser(["SUPPORT"]);
    const order = await placeOrder(customer.cookie);
    const forced = await call(adminOrderRoute.PATCH, { method: "PATCH", cookie: support.cookie, params: { id: order.id }, body: { status: "PAYMENT_CONFIRMED" } });
    expect(forced.status).toBe(422);
    const complete = await call(adminOrderRoute.PATCH, { method: "PATCH", cookie: support.cookie, params: { id: order.id }, body: { status: "COMPLETED", completionEvidence: "done" } });
    expect(complete.status).toBe(409); // PENDING_PAYMENT → COMPLETED is not a valid transition
  });
});
