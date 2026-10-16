# Payments

## How payment processing works

```
customer ── POST /api/v1/payments ──► create Payment(PENDING) ──► provider.initiate() ──► redirect to provider checkout
                                                                                          │
provider ── POST /api/v1/webhooks/{provider} ──► verify signature (raw body)               │
                                              ──► dedupe (payment_webhook_events unique)   │
                                              ──► provider.verify(reference)  ◄────────────┘  (server-to-server)
                                              ──► settle(): lock payment row, check amount + currency,
                                                  mark SUCCEEDED once, journal entry, mark order/purchase paid
customer returns ── /checkout/return?reference=… ──► the same verifyAndSettle() call (the redirect alone proves nothing)
```

Guarantees:

- **An order is never marked paid because of a browser redirect.** The return page and the webhook both call the provider's verification API first.
- **Exactly-once settlement.** `settle()` runs in a database transaction behind `SELECT … FOR UPDATE` on the payment row. A payment that is already `SUCCEEDED` is never processed again. Journal rows have a unique `(sourceType, sourceId, type)` key, and coupon redemptions are unique per order.
- **Duplicate webhooks** are absorbed by the unique `(provider, eventKey)` constraint. If processing fails, the dedupe row is removed so the provider's retry gets processed.
- **Amount and currency must match** what was charged. A mismatch marks the payment `FAILED` and writes a `payment.mismatch` audit entry.
- **Late payments** (money that arrives after an order was cancelled or already paid) automatically get a `REQUESTED` refund for an administrator to review.
- **Idempotency keys.** `POST /payments`, `POST /orders`, refund requests and disputes accept an `Idempotency-Key` header.
- No card data ever reaches this application. Only provider references are stored.

## Paystack (recommended for Nigeria)

1. Create a business on [Paystack](https://dashboard.paystack.com) and complete **business verification** (CAC documents, settlement bank). Until it's verified you can only use test mode.
2. **Settings → API Keys & Webhooks**:
   - Copy the **secret key** (`sk_test_…` for testing, `sk_live_…` for production) into `PAYSTACK_SECRET_KEY`.
   - Set the **Webhook URL** to `https://YOUR_DOMAIN/api/v1/webhooks/paystack`.
   - Set the **Callback URL** (optional, since the app sends one per transaction) to `https://YOUR_DOMAIN/checkout/return`.
3. Add `paystack` to `PAYMENT_PROVIDERS`.
4. Test with the [Paystack test cards](https://paystack.com/docs/payments/test-payments/) while using `sk_test_` keys.

Paystack signs webhooks with HMAC-SHA512 of the raw body using your secret key (`x-paystack-signature`), and the adapter validates it. Refunds use `POST /refund` and are confirmed through the `refund.processed` webhook or by an admin on the Refunds page.

## Flutterwave

1. Create and verify a business at [Flutterwave](https://dashboard.flutterwave.com).
2. **Settings → API keys**: copy the secret key into `FLUTTERWAVE_SECRET_KEY`.
3. **Settings → Webhooks**: set the URL to `https://YOUR_DOMAIN/api/v1/webhooks/flutterwave`, choose a **Secret hash**, and put the same value in `FLUTTERWAVE_WEBHOOK_HASH`.
4. Add `flutterwave` to `PAYMENT_PROVIDERS`.

Flutterwave amounts are in major units, and the adapter converts at the boundary. Verification uses `GET /v3/transactions/verify_by_reference`.

## Stripe (international only)

Stripe doesn't currently onboard businesses registered in Nigeria directly. Enable it only if you operate an entity in a [Stripe-supported country](https://stripe.com/global).

- `STRIPE_SECRET_KEY`: `sk_test_…` or `sk_live_…`
- `STRIPE_WEBHOOK_SECRET`: `whsec_…` from a webhook endpoint pointing at `/api/v1/webhooks/stripe` with the `checkout.session.completed` event.
- The adapter advertises USD, GBP and EUR. Services priced in NGN won't offer Stripe.

## Wallet

The `wallet` provider pays from the customer's internal ledger balance (promotional credit first, then available funds). It debits the ledger and settles in **one** database transaction.

## Sandbox (development only)

`PAYMENT_SANDBOX_ENABLED=true` plus `sandbox` in `PAYMENT_PROVIDERS`. The sandbox hosted page at `/pay/sandbox/[reference]` simulates success or decline and delivers an HMAC-signed webhook through `handleWebhook()`. The provider is disabled whenever `NODE_ENV=production`, whatever the configuration says.

## Fees, tax and currency

Configure these under **Admin → Settings → Commerce**:

- VAT (default 7.5%, applied after discounts)
- An optional processing fee passed to customers (basis points plus a fixed amount in kobo)
- Marketplace buyer fee and seller commission

Provider fees reported by Paystack or the sandbox are journaled as `PROVIDER_FEE` and subtracted in net revenue. Prices carry their own currency code. NGN is the default, and other currencies are supported per package or service.

## Reconciliation

- **Admin → Payments → "Reconcile all pending"** re-verifies every pending payment with its provider.
- `POST /api/v1/cron/maintenance` (with `Authorization: Bearer $CRON_SECRET`) reconciles payments older than 15 minutes. It also expires unpaid orders and listing reservations. Schedule it every 10–15 minutes.
- CSV exports for accounting: **Admin → Overview → Exports** (orders, payments, refunds, transactions).

## Refunds

1. The customer requests a refund on the order page, or an admin resolves a dispute in the buyer's favour.
2. An admin approves a full or partial amount, picks the destination (original method or wallet) and adds a note.
3. **Wallet refunds** post to the ledger immediately. **Provider refunds** call the provider API and stay `PROCESSING` until the provider confirms, either by webhook or via the admin's "Mark as processed" after checking the provider dashboard.
4. When the refund succeeds, the app writes a `REFUND_ISSUED` journal line and updates the payment to `REFUNDED` or `PARTIALLY_REFUNDED`. The order moves to `REFUNDED` (full) or back to its previous status (partial).
5. If a provider refund isn't configured or fails, the refund goes to `FAILED` and an admin can re-decide it to the wallet.

## Withdrawals

Users withdraw **available** funds from **Dashboard → Wallet**. Promotional credit is never withdrawable.

1. The user saves a payout bank account. The account number is stored encrypted, and only the last 4 digits are ever shown to them.
2. They request a withdrawal (minimum set under Admin → Settings → Commerce). The amount moves from `AVAILABLE` to `PENDING` in the ledger, so it can't be spent while the request is open. One open request per user.
3. An admin opens **Admin → Withdrawals**, reveals the account number (audit-logged), sends the bank transfer from your business account, then clicks **Mark paid** with the transfer reference. This debits the `PENDING` funds and writes a `PAYOUT_SENT` journal line.
4. **Reject** (with a reason) or a user **cancel** returns the funds to `AVAILABLE`.

To automate step 3 later, call Paystack Transfers (`POST /transfer`) from `decideWithdrawal()` and confirm completion with the `transfer.success` webhook.

## Marketplace settlement — important

The buyer's payment is collected by the platform operator. The seller's proceeds are recorded in their wallet's `PENDING` bucket and moved to `AVAILABLE` only after an administrator verifies the final transfer step. The seller then withdraws them (see "Withdrawals" above).

**This is a platform settlement hold, not a licensed escrow service**, and the UI and Terms say so. Before launch:

- Confirm with counsel whether holding seller funds needs a licence in your jurisdiction (e.g. CBN payment service regulations in Nigeria).
- Consider [Paystack Split Payments / Subaccounts](https://paystack.com/docs/payments/split-payments/), or a licensed escrow partner, to avoid holding third-party funds directly.
