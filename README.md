# BoostSphere

A full-stack platform for **authorized social media promotion services** and a **moderated marketplace for transferable digital assets**, built for international customers with Nigeria (NGN) as the launch market.

- Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS
- PostgreSQL · Prisma ORM with migrations
- Zod validation on every API input
- Paystack and Flutterwave adapters for Nigeria, plus a Stripe adapter. A sandbox provider covers local development.
- Ledger-based wallet. Server-side pricing. Idempotent payment processing. RBAC. Audit log.

> **What this is not:** BoostSphere doesn't sell bots, fake followers or artificial engagement. It never collects social media passwords, login codes or session cookies, and its marketplace doesn't list stolen, compromised or non-transferable accounts. These rules are enforced in code (see [docs/SECURITY.md](docs/SECURITY.md)), not just in the copy.

---

## Quick start (local development)

Requirements: **Node.js 20+** and npm. You don't need Docker or a system PostgreSQL. The project ships an embedded PostgreSQL launcher for development.

```bash
npm install
cp .env.example .env          # then set APP_ENCRYPTION_KEY (command in the file)
npm run db:start              # terminal 1: starts PostgreSQL on :5433 (leave running)
npx prisma migrate deploy     # terminal 2: apply migrations
npm run db:seed               # demo catalog, sample listings, demo accounts
npm run dev                   # http://localhost:3000
```

To try the full payment flow without any provider account, set these in `.env`:

```
PAYMENT_PROVIDERS=paystack,flutterwave,wallet,sandbox
PAYMENT_SANDBOX_ENABLED=true
```

Paystack and Flutterwave stay hidden at checkout until you add their keys. The **Sandbox** provider runs a simulated hosted checkout. It sends a **signed webhook** through the same verification pipeline that real providers use, and it's hard-disabled when `NODE_ENV=production`.

### Using your own PostgreSQL

Point `DATABASE_URL` at your server and skip `npm run db:start`. Tests use `TEST_DATABASE_URL`, which defaults to the `boostsphere_test` database on the embedded server.

### Demo accounts (development only)

The seed creates these accounts, all with email verified. They share one password: the value of `SEED_PASSWORD`, or `DevOnly-Passw0rd` if it isn't set.

| Email | Roles |
|---|---|
| `superadmin@boostsphere.test` | Super administrator |
| `admin@boostsphere.test` | Administrator |
| `support@boostsphere.test` | Support agent |
| `customer@boostsphere.test` | Customer |
| `seller@boostsphere.test` | Verified seller (owns the `[Sample]` listings) |

The seed script refuses to run when `NODE_ENV=production`.

### Emails in development

When `RESEND_API_KEY` is empty, emails aren't sent. Each one (verification links, password resets, notifications) is printed to the dev-server console and stored in the `email_outbox` table with status `LOGGED`.

---

## Creating the first real administrator (production)

```bash
npm run admin:create -- owner@yourcompany.com "Owner Name"
```

The command prompts for a password (minimum 10 characters, letters and numbers) and creates a verified **SUPER_ADMIN**. Super admins can grant ADMIN and SUPPORT roles from **Admin → Users & roles**. Plain admins can't grant or remove admin roles.

---

## Project structure

```
prisma/
  schema.prisma            database schema (30+ tables)
  migrations/              SQL migrations
  seed.ts                  development seed data (no real data or secrets)
scripts/
  dev-db.mjs               embedded PostgreSQL for local dev
  create-admin.ts          bootstrap a super administrator
  smoke.ts                 render every page as guest / customer / admin
src/
  app/
    (public)/              home, catalog, platform pages, marketplace, checkout, info and legal pages
    (auth)/                login, register, password recovery, email verification
    dashboard/             customer dashboard
    admin/                 admin dashboard
    api/v1/                REST API (see docs/openapi.yaml)
    pay/sandbox/           dev-only simulated provider checkout page
  components/              UI primitives, layouts, client components (forms, actions)
  lib/                     framework-free helpers: money, crypto, errors, order state machine, input schemas
  server/                  business logic (all authorization and state changes live here)
    auth/                  sessions, passwords, 2FA, RBAC
    payments/              provider adapters + idempotent settlement (process.ts)
    orders.ts pricing.ts refunds.ts wallet.ts marketplace.ts catalog.ts support.ts analytics.ts …
tests/
  unit/                    pricing, state machine, input validation, money
  integration/             API route handlers against a real PostgreSQL database
  e2e/                     Playwright browser journeys
docs/                      architecture, payments, deployment, security, testing, OpenAPI
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:start` | Embedded PostgreSQL (dev only) |
| `npx prisma migrate dev --name <change>` | Create a new migration after editing the schema |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed demo data (refuses in production) |
| `npm test` | Unit + integration tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run typecheck` | TypeScript check |
| `npx tsx --env-file=.env scripts/smoke.ts` | Render-check every page by role |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): design decisions, data model, order and purchase state machines
- [docs/PAYMENTS.md](docs/PAYMENTS.md): configuring Paystack, Flutterwave and Stripe, webhooks, reconciliation, refunds
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): production deployment, environment, backups, monitoring, cron
- [docs/SECURITY.md](docs/SECURITY.md): security controls and pre-launch checklist
- [docs/TESTING.md](docs/TESTING.md): test procedure and scenario coverage
- [docs/openapi.yaml](docs/openapi.yaml): API reference
- [docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md): known limitations and what still needs a business decision

## Integration status at a glance

| Integration | Status |
|---|---|
| Sandbox payments | Works locally, disabled in production |
| Wallet payments | Works (internal ledger) |
| Paystack | Adapter implemented against the documented API. **Needs your keys and a verified Paystack business account.** Not exercised against live Paystack in this build. |
| Flutterwave | Same as Paystack: implemented, needs keys and a webhook secret hash. |
| Stripe | Implemented. Only for entities Stripe supports, which generally excludes Nigerian-registered businesses. |
| Email (Resend) | Implemented. Without a key, emails are only logged. |
| Fulfillment provider APIs | Adapter interface only. **No third-party adapters ship**, and orders go to the manual queue. |
| Object storage | Local private disk (dev) or any S3-compatible private bucket (`STORAGE_DRIVER=s3`). The S3 driver signs requests correctly in tests but hasn't been run against a real bucket. |
| Withdrawals | Works. Users request, an admin pays by bank transfer and records the reference. There's no automated transfer API. |
