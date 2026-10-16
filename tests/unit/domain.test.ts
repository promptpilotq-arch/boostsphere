import { describe, expect, it } from "vitest";
import { computePrice } from "@/server/pricing";
import { DEFAULT_SETTINGS } from "@/server/settings";
import { canTransition } from "@/lib/order-status";
import { inputFieldSchema, validateInputs } from "@/lib/service-inputs";
import { parseMajor, bps } from "@/lib/money";

const commerce = DEFAULT_SETTINGS.commerce;
const svc = { pricingModel: "PER_UNIT" as const, unitPriceMinor: 1500, unitSize: 100, unitLabel: "units", minQuantity: 100, maxQuantity: 1000, currency: "NGN", name: "S" };

describe("pricing", () => {
  it("prices per-unit services and applies coupon, VAT and fees", () => {
    const q = computePrice({ service: svc, pkg: null, quantity: 300, coupon: { id: "c", code: "TEN", type: "PERCENT", value: 1000, currency: null, minOrderMinor: 0, maxDiscountMinor: null }, commerce: { ...commerce, processingFeeBps: 150, processingFeeFixedMinor: 10000 } });
    expect(q.subtotalMinor).toBe(4500);
    expect(q.discountMinor).toBe(450);
    expect(q.taxMinor).toBe(bps(4050, 750));
    expect(q.totalMinor).toBe(4050 + q.taxMinor + q.feeMinor);
  });
  it("rejects quantities outside limits or not a multiple of the unit size", () => {
    for (const quantity of [50, 2000, 150]) expect(() => computePrice({ service: svc, pkg: null, quantity, coupon: null, commerce })).toThrow();
  });
  it("never discounts below zero", () => {
    const q = computePrice({ service: svc, pkg: null, quantity: 100, coupon: { id: "c", code: "BIG", type: "FIXED", value: 999999, currency: "NGN", minOrderMinor: 0, maxDiscountMinor: null }, commerce });
    expect(q.totalMinor).toBe(0);
  });
});

describe("order state machine", () => {
  it("only the system can confirm payment", () => {
    expect(canTransition("PENDING_PAYMENT", "PAYMENT_CONFIRMED", "SYSTEM")).toBe(true);
    expect(canTransition("PENDING_PAYMENT", "PAYMENT_CONFIRMED", "STAFF")).toBe(false);
    expect(canTransition("PENDING_PAYMENT", "PAYMENT_CONFIRMED", "CUSTOMER")).toBe(false);
  });
  it("terminal states have no exits", () => {
    expect(canTransition("REFUNDED", "PROCESSING", "STAFF")).toBe(false);
    expect(canTransition("CANCELLED", "PAYMENT_CONFIRMED", "SYSTEM")).toBe(false);
  });
  it("paid orders cannot be cancelled directly (must be refunded)", () => {
    expect(canTransition("PROCESSING", "CANCELLED", "STAFF")).toBe(false);
  });
});

describe("service input fields", () => {
  it("refuses credential-like fields", () => {
    for (const label of ["Instagram password", "2FA code", "Session cookie", "Recovery code"]) {
      expect(inputFieldSchema.safeParse({ key: "field_x", label, type: "text" }).success).toBe(false);
    }
  });
  it("validates URL hosts and strips embedded credentials", () => {
    const fields = [{ key: "url", label: "Post URL", type: "url" as const, required: true, allowedHosts: ["instagram.com"] }];
    expect(validateInputs(fields, { url: "https://www.instagram.com/p/1" }).ok).toBe(true);
    expect(validateInputs(fields, { url: "https://user:pass@instagram.com/p/1" }).ok).toBe(false);
    expect(validateInputs(fields, { url: "javascript:alert(1)" }).ok).toBe(false);
    expect(validateInputs(fields, { url: "https://instagram.com.evil.io/p" }).ok).toBe(false);
  });
});

describe("money", () => {
  it("parses major units without float drift", () => {
    expect(parseMajor("1500.10", "NGN")).toBe(150010);
    expect(parseMajor("0.29", "NGN")).toBe(29);
    expect(() => parseMajor("1.234", "NGN")).toThrow();
  });
});
