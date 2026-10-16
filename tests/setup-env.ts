// Test environment. Uses a dedicated database and sandbox/dummy payment configuration only.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/boostsphere_test?schema=public";
process.env.APP_URL = "http://localhost:3000";
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.PAYMENT_PROVIDERS = "paystack,wallet,sandbox";
process.env.PAYMENT_SANDBOX_ENABLED = "true";
process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy_key_for_signature_tests";
process.env.DISABLE_RATE_LIMIT = "true";
process.env.RESEND_API_KEY = "";
process.env.STORAGE_DIR = "./storage/test";
