import type { Coupon, Service, ServicePackage } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { bps } from "@/lib/money";
import type { SiteSettings } from "./settings";

export type PriceLine = { label: string; amountMinor: number };
export type Quote = {
  currency: string;
  quantity: number;
  unitPriceMinor: number | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  feeMinor: number;
  totalMinor: number;
  lines: PriceLine[];
  couponCode: string | null;
  couponId: string | null;
};

type PriceInput = {
  service: Pick<Service, "pricingModel" | "unitPriceMinor" | "unitSize" | "unitLabel" | "minQuantity" | "maxQuantity" | "currency" | "name">;
  pkg: Pick<ServicePackage, "priceMinor" | "currency" | "name"> | null;
  quantity: number;
  coupon: Pick<Coupon, "id" | "code" | "type" | "value" | "currency" | "minOrderMinor" | "maxDiscountMinor"> | null;
  commerce: SiteSettings["commerce"];
};

/** Pure price calculation. The only source of truth for amounts — browser totals are display-only. */
export function computePrice({ service, pkg, quantity, coupon, commerce }: PriceInput): Quote {
  let subtotal: number;
  let currency: string;
  let unitPrice: number | null = null;
  const lines: PriceLine[] = [];

  if (service.pricingModel === "PACKAGE") {
    if (!pkg) throw new AppError("VALIDATION_ERROR", "Choose a package");
    if (!Number.isInteger(quantity) || quantity !== 1) throw new AppError("VALIDATION_ERROR", "Package services are ordered one at a time");
    subtotal = pkg.priceMinor;
    currency = pkg.currency;
    lines.push({ label: `${service.name} — ${pkg.name}`, amountMinor: subtotal });
  } else {
    if (service.unitPriceMinor == null) throw new AppError("NOT_CONFIGURED", "This service has no unit price configured");
    if (!Number.isInteger(quantity) || quantity < 1) throw new AppError("VALIDATION_ERROR", "Quantity must be a whole number");
    const min = service.minQuantity ?? 1;
    const max = service.maxQuantity ?? Number.MAX_SAFE_INTEGER;
    if (quantity < min) throw new AppError("VALIDATION_ERROR", `Minimum order is ${min} ${service.unitLabel}`);
    if (quantity > max) throw new AppError("VALIDATION_ERROR", `Maximum order is ${max} ${service.unitLabel}`);
    if (quantity % service.unitSize !== 0) throw new AppError("VALIDATION_ERROR", `Quantity must be a multiple of ${service.unitSize}`);
    unitPrice = service.unitPriceMinor;
    subtotal = (quantity / service.unitSize) * service.unitPriceMinor;
    currency = service.currency;
    lines.push({ label: `${service.name} × ${quantity} ${service.unitLabel}`, amountMinor: subtotal });
  }

  let discount = 0;
  if (coupon) {
    if (subtotal < coupon.minOrderMinor) throw new AppError("VALIDATION_ERROR", `Coupon ${coupon.code} requires a larger order`);
    if (coupon.type === "PERCENT") discount = bps(subtotal, coupon.value);
    else {
      if (coupon.currency !== currency) throw new AppError("VALIDATION_ERROR", `Coupon ${coupon.code} is not valid for ${currency}`);
      discount = coupon.value;
    }
    if (coupon.maxDiscountMinor != null) discount = Math.min(discount, coupon.maxDiscountMinor);
    discount = Math.min(discount, subtotal);
    lines.push({ label: `Coupon ${coupon.code}`, amountMinor: -discount });
  }

  const net = subtotal - discount;
  const tax = commerce.taxEnabled ? bps(net, commerce.taxRateBps) : 0;
  if (tax) lines.push({ label: `${commerce.taxLabel} (${commerce.taxRateBps / 100}%)`, amountMinor: tax });
  const fee = net + tax > 0 ? bps(net + tax, commerce.processingFeeBps) + commerce.processingFeeFixedMinor : 0;
  if (fee) lines.push({ label: "Processing fee", amountMinor: fee });

  return {
    currency,
    quantity,
    unitPriceMinor: unitPrice,
    subtotalMinor: subtotal,
    discountMinor: discount,
    taxMinor: tax,
    feeMinor: fee,
    totalMinor: net + tax + fee,
    lines,
    couponCode: coupon?.code ?? null,
    couponId: coupon?.id ?? null,
  };
}

/** Load and validate a coupon for a given user and service. */
export async function resolveCoupon(code: string | undefined | null, userId: string | null, service: Pick<Service, "id" | "platformId">) {
  if (!code) return null;
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  if (!coupon || !coupon.active) throw new AppError("VALIDATION_ERROR", "Coupon code is not valid");
  if (coupon.startsAt && coupon.startsAt > now) throw new AppError("VALIDATION_ERROR", "Coupon is not active yet");
  if (coupon.expiresAt && coupon.expiresAt < now) throw new AppError("VALIDATION_ERROR", "Coupon has expired");
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) throw new AppError("VALIDATION_ERROR", "Coupon has been fully redeemed");
  if (coupon.serviceId && coupon.serviceId !== service.id) throw new AppError("VALIDATION_ERROR", "Coupon does not apply to this service");
  if (coupon.platformId && coupon.platformId !== service.platformId) throw new AppError("VALIDATION_ERROR", "Coupon does not apply to this platform");
  if (userId) {
    const used = await db.couponRedemption.count({ where: { couponId: coupon.id, userId } });
    if (used >= coupon.perUserLimit) throw new AppError("VALIDATION_ERROR", "You have already used this coupon");
  }
  return coupon;
}
