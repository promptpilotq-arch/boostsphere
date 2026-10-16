// Money helpers. All amounts are integers in minor units (kobo, cents).

const MINOR_DIGITS: Record<string, number> = { NGN: 2, USD: 2, GBP: 2, EUR: 2, GHS: 2, KES: 2, ZAR: 2 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export function formatMoney(minor: number, currency: string, locale = "en-NG"): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits === 0 ? 0 : 2, maximumFractionDigits: digits }).format(
    minor / 10 ** digits,
  );
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** minorDigits(currency);
}

/** Parse a user-entered major amount ("1500.50") into minor units without floating-point drift. */
export function parseMajor(input: string | number, currency: string): number {
  const digits = minorDigits(currency);
  const s = String(input).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid amount");
  const [whole, frac = ""] = s.split(".");
  if (frac.length > digits) throw new Error("Too many decimal places");
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || 0);
}

/** Basis-point percentage of an amount, rounded half-up to the nearest minor unit. */
export function bps(amountMinor: number, basisPoints: number): number {
  return Math.round((amountMinor * basisPoints) / 10000);
}
