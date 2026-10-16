# Architecture

## Overview

A single Next.js 15 application serves both the UI (React Server Components) and a versioned REST API (`/api/v1`). All business rules live in `src/server/*`. Route handlers and pages are thin and call into that layer, so the same rules apply to the browser UI, API clients and tests.

```
Browser ──► Server Components (read via src/server/*)  ──┐
        └─► Client forms ──fetch JSON──► /api/v1/* ───────┼──► src/server/* (validation, RBAC, transactions) ──► Prisma ──► PostgreSQL
Providers ──signed webhooks──► /api/v1/webhooks/* ────────┘
```

### Key decisions

| Decision | Why |
|---|---|
| **One app, API routes and server components** | One deployable unit and shared types. The API is still a clean, documented surface (OpenAPI) for mobile apps or integrations later. |
| **Hand-rolled session auth with vetted primitives** (bcrypt, SHA-256 hashed DB session tokens, otplib TOTP, AES-256-GCM for 2FA secrets) | Full control over 2FA, session revocation and auditing without a managed identity provider. The flow follows the Lucia/OWASP session guidance. You can swap in a managed IdP later; only `src/server/auth/*` changes. |
| **Every mutation goes through `/api/v1`** via a small `ApiForm`/`ActionButton` client layer | There is one code path to secure and test. CSRF protection is an Origin check plus JSON-only bodies and SameSite=Lax cookies. |
| **Money as integer minor units plus a currency code** | No floating-point drift. Kobo for NGN. |
| **Server-side pricing only** (`computePrice`) | The client total is display-only. Orders store a `pricingSnapshot`. |
| **Ledger wallet** (immutable `wallet_ledger_entries`, balances = SUM per bucket) | Users can't edit balances, every change is traceable, and row locks prevent overdrafts. |
| **Provider adapters** (`src/server/payments/*`) with all state changes in `process.ts` | Adding a provider means implementing an adapter only. Settlement logic is shared and tested once. |
| **Admin-defined input fields as validated JSON** | Admins create new service types without code. A schema rejects credential-like fields. |
| **DB-backed rate limiting** | Works across multiple instances without Redis. Swap for Redis at very high traffic. |
| **Embedded PostgreSQL for development** | Zero-install local setup on any OS. Production uses managed PostgreSQL. |

## Data model (main tables)

- **Identity:** `users`, `user_profiles`, `roles`, `user_roles`, `sessions`, `auth_tokens`, `account_deletion_requests`
- **Catalog:** `social_platforms`, `service_categories`, `services` (input field schema, policies, fulfillment type), `service_packages`, `faq_items`
- **Orders:** `service_orders` (pricing snapshot, validated inputs), `order_events` (status history, customer-visible notes, internal notes, evidence)
- **Money:** `payments`, `payment_webhook_events`, `refunds`, `transactions` (platform journal), `wallet_accounts`, `wallet_ledger_entries`, `coupons`, `coupon_redemptions`, `idempotency_keys`
- **Marketplace:** `seller_profiles`, `marketplace_listings`, `listing_images`, `listing_reports`, `saved_listings`, `purchase_transactions`, `transfer_milestones`, `disputes`, `dispute_messages`
- **Engagement and ops:** `reviews`, `support_tickets`, `support_messages`, `contact_messages`, `notifications`, `email_outbox`, `audit_logs`, `site_settings`, `rate_limit_buckets`, `sandbox_charges` (dev only)

All foreign keys, unique constraints and indexes are in `prisma/schema.prisma`, and the migrations are in `prisma/migrations`.

## Service order state machine

Defined in `src/lib/order-status.ts` and enforced by `transitionOrder()`, which locks the order row and checks both the transition and the actor.

```
PENDING_PAYMENT ──(SYSTEM: verified payment)──► PAYMENT_CONFIRMED ──► PROCESSING ──► IN_PROGRESS ──► COMPLETED
      │                                              │                 │   ▲              │              │
      └──► CANCELLED (customer/staff/expiry)         │                 ▼   │              │              │
                                                     │         AWAITING_CUSTOMER_INFO     │              │
                                                     └──────────► UNDER_REVIEW ◄──────────┘◄─────────────┘
any paid state ──► REFUND_PENDING ──(SYSTEM)──► REFUNDED   (or back to the previous state if rejected/partial)
```

- Only `SYSTEM` (payment processing) can enter `PAYMENT_CONFIRMED`. Staff can't fake a payment.
- A paid order can't be cancelled directly. It has to go through a refund.
- `COMPLETED` requires completion evidence.

## Marketplace purchase lifecycle

```
listing APPROVED ──buyer accepts terms──► purchase PENDING_PAYMENT (listing RESERVED, row-locked)
  ──verified payment──► PAID (seller proceeds → seller wallet PENDING bucket, payout ON_HOLD)
  ──milestones──► TRANSFER_IN_PROGRESS ──► AWAITING_VERIFICATION ──admin confirms final step──► COMPLETED
                                                                       (proceeds PENDING → AVAILABLE, listing SOLD)
  any active state ──dispute──► DISPUTED  (completion blocked)
       ├─ RESOLVED_BUYER → full refund, seller PENDING proceeds reversed, listing back to moderation
       └─ RESOLVED_SELLER / CLOSED → previous state restored (still needs verification)
```

Default transfer milestones, each evidenced by one party and confirmed by the other:

1. Seller starts the official transfer. Buyer confirms.
2. Buyer confirms access through official roles. Seller confirms.
3. Seller hands over linked assets and removes their own access. Buyer confirms.
4. Final verification. Admin confirms.

Evidence notes that look like credentials are rejected, and evidence files live in private storage.

## Fulfillment

When payment is verified, `dispatchFulfillment()` routes the order by `fulfillmentType`:

| Type | Behaviour |
|---|---|
| `MANUAL`, `AD_CAMPAIGN`, `CONSULTATION`, `DIGITAL_DELIVERABLE` | Manual queue with type-specific internal instructions. Staff assign, update status, message the customer and attach evidence. |
| `PROVIDER_API` | Uses an adapter from `ADAPTERS` in `src/server/fulfillment.ts`. **None ship.** Implement one only against an authorized, documented API. Until then these orders fall back to the manual queue with a note. |

## Roles and permissions

`src/server/auth/rbac.ts` holds a single permission matrix. Every admin API route declares a `permission`, which `route()` enforces server-side before running any logic. Admin pages use `requirePermissionPage()`. Hiding navigation is only a convenience.

| Permission | Support | Admin | Super admin |
|---|:-:|:-:|:-:|
| Fulfillment, support, disputes, reviews, read payments | ✓ | ✓ | ✓ |
| Catalog, coupons, listing moderation, refunds, users, wallet adjustments, settings, analytics, audit | | ✓ | ✓ |
| Grant or remove ADMIN / SUPER_ADMIN | | | ✓ |

Customers and sellers only reach their own resources. Lookups return 404, not 403, for other users' ids so the ids can't be probed.
