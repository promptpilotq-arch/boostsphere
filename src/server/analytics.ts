import { db } from "@/lib/db";

/**
 * Admin analytics computed from live database records only.
 * Gross revenue = verified successful payments. Net = gross − refunds issued − provider fees (where reported).
 * Wallet deposits are customer liabilities, not revenue, and are excluded from revenue figures.
 */
export async function getAnalytics(opts: { days?: number; currency?: string } = {}) {
  const days = opts.days ?? 30;
  const currency = opts.currency ?? "NGN";
  const since = new Date(Date.now() - days * 86_400_000);
  const revenuePurposes = ["SERVICE_ORDER", "MARKETPLACE_PURCHASE"] as const;

  const [paid, attempts, succeeded, refunds, fees, orderGroups, newCustomers, buyers, platformSales, popular, listingGroups, openDisputes, pendingRefunds, pendingPayments] = await Promise.all([
    db.payment.aggregate({ where: { currency, status: { in: ["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"] }, purpose: { in: [...revenuePurposes] }, verifiedAt: { gte: since } }, _sum: { amountMinor: true }, _count: true }),
    db.payment.count({ where: { createdAt: { gte: since }, provider: { not: "wallet" }, status: { in: ["SUCCEEDED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"] } } }),
    db.payment.count({ where: { createdAt: { gte: since }, provider: { not: "wallet" }, status: { in: ["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"] } } }),
    db.transaction.aggregate({ where: { currency, type: "REFUND_ISSUED", createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    db.transaction.aggregate({ where: { currency, type: "PROVIDER_FEE", createdAt: { gte: since } }, _sum: { amountMinor: true } }),
    db.serviceOrder.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.serviceOrder.groupBy({ by: ["userId"], where: { paidAt: { not: null } }, _count: true }),
    db.$queryRaw<{ name: string; total: bigint; orders: bigint }[]>`
      SELECT p.name, COALESCE(SUM(o."totalMinor"),0)::bigint AS total, COUNT(o.id)::bigint AS orders
      FROM service_orders o JOIN services s ON s.id = o."serviceId" JOIN social_platforms p ON p.id = s."platformId"
      WHERE o."paidAt" >= ${since} AND o.currency = ${currency}
      GROUP BY p.name ORDER BY total DESC`,
    db.$queryRaw<{ name: string; orders: bigint; total: bigint }[]>`
      SELECT s.name, COUNT(o.id)::bigint AS orders, COALESCE(SUM(o."totalMinor"),0)::bigint AS total
      FROM service_orders o JOIN services s ON s.id = o."serviceId"
      WHERE o."paidAt" >= ${since} GROUP BY s.name ORDER BY orders DESC LIMIT 8`,
    db.marketplaceListing.groupBy({ by: ["status"], _count: true }),
    db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.refund.count({ where: { status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } } }),
    db.payment.count({ where: { status: "PENDING" } }),
  ]);

  const gross = paid._sum.amountMinor ?? 0;
  const refunded = Math.abs(refunds._sum.amountMinor ?? 0);
  const providerFees = Math.abs(fees._sum.amountMinor ?? 0);
  const count = (s: string) => orderGroups.find((g) => g.status === s)?._count ?? 0;
  const totalOrders = orderGroups.reduce((n, g) => n + g._count, 0);

  return {
    days,
    currency,
    grossRevenueMinor: gross,
    refundsMinor: refunded,
    providerFeesMinor: providerFees,
    netRevenueMinor: gross - refunded - providerFees,
    paidTransactions: paid._count,
    averageOrderValueMinor: paid._count ? Math.round(gross / paid._count) : 0,
    orders: {
      total: totalOrders,
      completed: count("COMPLETED"),
      pending: count("PENDING_PAYMENT"),
      cancelled: count("CANCELLED"),
      active: ["PAYMENT_CONFIRMED", "PROCESSING", "IN_PROGRESS", "AWAITING_CUSTOMER_INFO", "UNDER_REVIEW"].reduce((n, s) => n + count(s), 0),
      refunded: count("REFUNDED"),
    },
    paymentSuccessRate: attempts ? succeeded / attempts : null,
    newCustomers,
    repeatCustomers: buyers.filter((b) => b._count > 1).length,
    payingCustomers: buyers.length,
    salesByPlatform: platformSales.map((r) => ({ name: r.name, totalMinor: Number(r.total), orders: Number(r.orders) })),
    popularServices: popular.map((r) => ({ name: r.name, orders: Number(r.orders), totalMinor: Number(r.total) })),
    listings: Object.fromEntries(listingGroups.map((g) => [g.status, g._count])) as Record<string, number>,
    openDisputes,
    pendingRefunds,
    pendingPayments,
  };
}

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;
