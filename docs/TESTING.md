# Testing

## Repeatable procedure

```bash
npm run db:start                    # terminal 1 (creates the boostsphere_test database too)
npm test                            # unit + integration (migrates the test DB automatically)
npm run typecheck
npm run dev                         # terminal 2, for the steps below
npx tsx --env-file=.env scripts/smoke.ts   # renders every page as guest / customer / admin
npx playwright install chromium     # first time only
# Tip: run the smoke script first; it compiles every page, so the e2e run doesn't time out on first-compile delays.
# If you ran `npm run build`, delete .next before `npm run dev` (dev and prod build output don't mix).
npm run test:e2e                    # browser journeys (desktop + mobile viewports)
```

The integration tests call the real Next.js route handlers with real `Request` objects against a real PostgreSQL database (`boostsphere_test`), which is truncated before each test. External provider APIs are mocked only where a live sandbox account would be needed (Paystack verify). Webhook **signatures are computed for real**.

## Required scenarios → tests

| # | Scenario | Test |
|---|---|---|
| 1 | Guest can browse published services | `orders-payments.test.ts` › catalog; e2e › guest can browse |
| 2 | Registered customer can sign in | `orders-payments.test.ts` › auth |
| 3 | Invalid service quantities are rejected | `orders-payments.test.ts` › orders 3; `domain.test.ts` › pricing |
| 4 | Customer can create a pending order | `orders-payments.test.ts` › orders 4 |
| 5 | Failed payment doesn't mark an order paid | `orders-payments.test.ts` › payments 5; e2e › declined payment |
| 6 | Verified payment updates an order exactly once | `orders-payments.test.ts` › payments 6 |
| 7 | Duplicate webhooks don't create duplicate transactions | `orders-payments.test.ts` › payments 7 (concurrent and duplicate deliveries) |
| 8 | Customer can't access another customer's order | `orders-payments.test.ts` › orders 8 |
| 9 | Customer can't access admin endpoints | `orders-payments.test.ts` › authorization 9; e2e › kept out of admin |
| 10 | Admin can publish or pause a service | `orders-payments.test.ts` › authorization 10; e2e › admin pause |
| 11 | Unapproved listing can't be purchased | `marketplace.test.ts` › 11 |
| 12 | Disputed transaction can't be silently completed | `marketplace.test.ts` › 12 |
| 13 | Refunds are recorded accurately | `orders-payments.test.ts` › refunds 13 (partial and over-refund) |
| 14 | Pricing is recalculated on the server | `orders-payments.test.ts` › orders 14 |
| 15 | Sensitive credentials never exposed in API responses | `orders-payments.test.ts` › authorization 15; `marketplace.test.ts` › moderation evidence |

Withdrawals (`payouts.test.ts`): funds are held on request and debited once on payment, promotional credit can't be withdrawn, one open request per user, rejection and cancellation release funds, account numbers never appear in API responses, and reveals are admin-only and audited. Seller documents (`files.test.ts`): only the seller and marketplace moderators can open them, and files are rejected by content type, not filename. S3 driver (`storage.test.ts`): SigV4-signed path-style requests.

Additional coverage: CSRF origin rejection, invalid webhook signatures, provider amount mismatch, idempotency keys, verified-email requirement, wrong-host URLs, draft services, support-agent permission limits, invalid staff transitions, credential-like evidence rejection, unverified-seller approval, the full marketplace transfer with proceeds release, and the credential-field ban on admin-defined inputs.

## Manual sandbox payment test

1. Sign in as `customer@boostsphere.test` and open any service. Fill in the public link, accept the terms, then **Continue to payment**.
2. Choose **Sandbox**. On the simulated checkout, click **Simulate successful payment**.
3. The return page shows **Payment confirmed**. The order timeline shows *Payment confirmed* exactly once. **Admin → Payments** shows the webhook event and provider fee.
4. Repeat with **Simulate declined payment**. The order stays *Pending payment* and no journal entry is created.

## Paystack test mode

Set `PAYSTACK_SECRET_KEY=sk_test_…`, add `paystack` to `PAYMENT_PROVIDERS`, and expose your dev server for webhooks (e.g. `cloudflared tunnel --url http://localhost:3000`). Register `https://<tunnel>/api/v1/webhooks/paystack` in the Paystack dashboard, then pay with a [Paystack test card](https://paystack.com/docs/payments/test-payments/). Without a tunnel, the return page still verifies the payment server-to-server.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

1. **Typecheck, tests, build:** `npm ci`, TypeScript check, unit and integration tests against a PostgreSQL 16 service container, a check that migrations apply to an empty database and match `schema.prisma` (catches forgotten migrations), then the production build.
2. **Browser journeys:** migrates and seeds a fresh database, starts the dev server (the sandbox payment provider is disabled in production builds), runs the page smoke test, then the Playwright journeys on desktop and mobile. Screenshots, traces and the server log are uploaded if it fails.

The CI environment variables are throwaway test values. No repository secrets are needed. Dependabot (`.github/dependabot.yml`) opens weekly grouped dependency updates. Major framework upgrades are left for a deliberate, manual upgrade.
