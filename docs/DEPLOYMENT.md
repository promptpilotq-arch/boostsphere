# Deployment

## Recommended topology

- **App:** Vercel, Render, Railway, Fly.io, or any Node 20+ host (`npm run build && npm start`).
- **Database:** managed PostgreSQL 15+ (Neon, Supabase, AWS RDS, Render Postgres) with automated backups and point-in-time recovery.
- **Private storage:** an S3-compatible bucket (AWS S3, Cloudflare R2, DigitalOcean Spaces) with public access blocked.
- **Email:** Resend (or adapt `src/server/email.ts` for Postmark or SES).
- **Scheduler:** any cron service (Vercel Cron, GitHub Actions, cron-job.org) to call the maintenance endpoint.

## Environment variables

Set these in your host's secret manager. Never commit `.env`.

| Variable | Required | Notes |
|---|---|---|
| `APP_URL` | yes | `https://yourdomain.com`, no trailing slash |
| `DATABASE_URL` | yes | Pooled connection string. Add `?sslmode=require` for managed DBs. |
| `APP_ENCRYPTION_KEY` | yes | 32 random bytes, base64. Encrypts 2FA secrets. **Rotating it invalidates existing 2FA enrolments.** |
| `PAYMENT_PROVIDERS` | yes | e.g. `paystack,wallet`. Don't include `sandbox` in production. |
| `PAYSTACK_SECRET_KEY` | for Paystack | `sk_live_…` |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | for Flutterwave | |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for Stripe | |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email | Verify your sending domain in Resend. |
| `CRON_SECRET` | yes | Long random string for `/api/v1/cron/maintenance` |
| `STORAGE_DRIVER` | yes | `s3` in production (default `local`) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for s3 | Private bucket credentials |
| `STORAGE_DIR` | local driver only | Must be outside `public/` |
| `NODE_ENV` | yes | `production` (disables the sandbox provider and demo seeding) |

## Steps

1. Provision PostgreSQL and set `DATABASE_URL`.
2. Run `npm ci && npx prisma migrate deploy` in the deploy pipeline. **Don't** run `db:seed` in production.
3. `npm run build`, then `npm start`. Most PaaS hosts detect Next.js automatically.
4. Create the first super admin: `npm run admin:create -- you@company.com "Your Name"`.
5. Sign in, enable 2FA, and complete **Admin → Settings** (brand, company legal name, support email, tax). Turn off "Show sample content notice" only once the sample listings are gone.
6. Remove the seeded `[Sample]` listings if you seeded a staging copy. Production should start empty.
7. Configure payment providers (see [PAYMENTS.md](PAYMENTS.md)) and register the webhook URLs.
8. Schedule maintenance every 10–15 minutes:
   ```bash
   curl -X POST https://yourdomain.com/api/v1/cron/maintenance -H "Authorization: Bearer $CRON_SECRET"
   ```
9. Put the site behind HTTPS. HSTS is sent automatically in production.

### Private storage in production

Set `STORAGE_DRIVER=s3` and the `S3_*` variables (endpoint, region, bucket, access key, secret). This works with AWS S3, Cloudflare R2, DigitalOcean Spaces and MinIO. The bucket **must be private**: files are always served through `/api/v1/files/[...key]`, which checks authorization. The local driver (default) doesn't persist files on serverless hosts.

### Content-Security-Policy

`src/middleware.ts` issues a fresh nonce CSP for every HTML page, and the root layout forces per-request rendering so every Next.js script gets the nonce. If you add third-party scripts (analytics, chat widgets), load them with `next/script` and the `nonce` from `headers().get("x-nonce")`, and add their origins to `connect-src` and `img-src`.

## Backups and recovery

- Turn on the provider's automated daily backups **and** point-in-time recovery (7–30 days).
- Also take a weekly logical dump to separate storage: `pg_dump --format=custom "$DATABASE_URL" > boostsphere-$(date +%F).dump`.
- Back up the object-storage bucket with versioning or replication.
- **Restore drill (quarterly):** `pg_restore --clean --no-owner -d "$STAGING_DATABASE_URL" backup.dump`, run `npx prisma migrate deploy`, start the app against staging, and check that the admin overview totals match production for the same period.
- The financial tables (`payments`, `transactions`, `wallet_ledger_entries`, `refunds`) are append-mostly. Never hand-edit them. Use admin wallet adjustments, which are audited.

## Monitoring

- **Uptime:** monitor `/` and `/api/v1/platforms`.
- **Errors:** add Sentry (or similar) to `src/lib/errors.ts`, where unhandled errors are logged.
- **Business alerts:** watch for pending payments older than one hour, `FAILED` refunds, `webhook.rejected` audit entries (possible spoofing) and `payment.mismatch` entries.
- **Logs:** route the host's stdout to your log platform. Logs don't include secrets, card data or passwords.

## Scaling notes

- The app is stateless apart from the database and storage, so you can run multiple instances.
- Rate limiting is DB-backed. Move to Redis if the `rate_limit_buckets` table gets hot.
- Use a pooled connection (PgBouncer, Prisma Accelerate or Neon pooling) on serverless platforms.
