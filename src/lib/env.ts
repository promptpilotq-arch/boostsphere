// Central, typed access to environment configuration. Secrets are only read on the server.

export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  isProduction: process.env.NODE_ENV === "production",
  encryptionKey: process.env.APP_ENCRYPTION_KEY ?? "",
  paymentProviders: (process.env.PAYMENT_PROVIDERS ?? "wallet")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  sandboxEnabled: process.env.PAYMENT_SANDBOX_ENABLED === "true" && process.env.NODE_ENV !== "production",
  paystackSecret: process.env.PAYSTACK_SECRET_KEY ?? "",
  flutterwaveSecret: process.env.FLUTTERWAVE_SECRET_KEY ?? "",
  flutterwaveWebhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "",
  stripeSecret: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "BoostSphere <no-reply@example.com>",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  storageDir: process.env.STORAGE_DIR ?? "./storage/private",
};
