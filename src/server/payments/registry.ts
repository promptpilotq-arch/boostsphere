import { flutterwave } from "./flutterwave";
import { paystack } from "./paystack";
import { sandbox } from "./sandbox";
import { stripe } from "./stripe";
import type { PaymentProvider } from "./types";

const wallet: PaymentProvider = {
  key: "wallet",
  displayName: "Wallet balance",
  description: "Pay instantly from your BoostSphere wallet",
  isConfigured: () => true,
  supportsCurrency: () => true,
};

const ALL: Record<string, PaymentProvider> = { paystack, flutterwave, stripe, wallet, sandbox };

function enabledKeys() {
  return (process.env.PAYMENT_PROVIDERS ?? "wallet")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function getProvider(key: string): PaymentProvider | null {
  return ALL[key] ?? null;
}

export type ProviderStatus = { key: string; displayName: string; description: string; enabled: boolean; configured: boolean };

/** Every known provider and whether it is enabled + configured (for the admin dashboard). */
export function providerStatuses(): ProviderStatus[] {
  const enabled = enabledKeys();
  return Object.values(ALL).map((p) => ({
    key: p.key,
    displayName: p.displayName,
    description: p.description,
    enabled: enabled.includes(p.key),
    configured: p.isConfigured(),
  }));
}

/** Providers a customer may choose for a given currency: enabled AND configured. */
export function availableProviders(currency: string, opts: { walletEnabled: boolean; allowWallet: boolean }): PaymentProvider[] {
  return enabledKeys()
    .map((k) => ALL[k])
    .filter((p): p is PaymentProvider => Boolean(p))
    .filter((p) => p.isConfigured() && p.supportsCurrency(currency))
    .filter((p) => p.key !== "wallet" || (opts.walletEnabled && opts.allowWallet));
}
