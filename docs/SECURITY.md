# Security

## Controls implemented

| Area | Control | Where |
|---|---|---|
| Passwords | bcrypt (cost 12). Minimum 10 characters with letters and digits. Constant-time path for unknown emails. | `server/auth/password.ts`, `account.ts` |
| Sessions | 256-bit random tokens. Only a SHA-256 hash is stored. HttpOnly, SameSite=Lax, Secure in production. 30-day expiry. Revocable per device. Password change or reset signs out other sessions. | `server/auth/session.ts` |
| 2FA | TOTP (RFC 6238) with an AES-256-GCM encrypted secret, plus 8 single-use hashed backup codes. Login is a two-step pending session that expires after 10 minutes. | `account.ts` |
| Email verification and reset | Single-use, hashed, expiring tokens. The reset endpoint doesn't reveal whether an account exists. | `account.ts` |
| Authorization | Central permission matrix, enforced in every API route (`route({ permission })`) and every admin page. Ownership checks return 404. Admin roles can only be granted by a super admin. | `server/auth/rbac.ts`, `server/http.ts` |
| CSRF | Origin header must match `APP_URL` on every state-changing request. JSON-only bodies. SameSite=Lax cookies. | `server/http.ts` |
| XSS | React escaping everywhere. JSON-LD is serialised with `<` escaped. **Per-request nonce CSP** with `strict-dynamic`, so no inline scripts run without the nonce. API responses get `default-src 'none'`. Receipts escape all interpolated values. | `middleware.ts`, `next.config.ts` |
| SQL injection | Prisma parameterised queries. The few raw queries use tagged templates (parameterised). | |
| Rate limiting | Login (per IP and per account), registration, password reset, 2FA, orders, payments, tickets, contact. | `server/rate-limit.ts` |
| Security headers | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS (production). | `next.config.ts` |
| Input validation | Zod on every endpoint. Admin-defined service fields are schema-validated, and credential-like fields are rejected. URLs are checked for host allow-lists and embedded credentials. | `lib/service-inputs.ts` |
| Credentials never collected | Order inputs, listing text and transfer evidence are screened for password and code patterns. The UI warns throughout. | `service-inputs.ts`, `marketplace.ts` |
| Payments | Webhook signatures verified on the raw body. Events deduplicated. Server-side verification before any state change. Amount and currency matched. Row locks. Idempotency keys. No card data stored. | `server/payments/*` |
| Wallet | Immutable ledger, row-locked writes, non-negative bucket checks, unique idempotency keys. Admin adjustments need a reason and are audited. | `server/wallet.ts` |
| Files | Content-sniffed type allow-list (PNG, JPEG, WebP, PDF), 5 MB limit, random keys, stored outside the web root, served through an authorization check with `nosniff`. | `server/storage.ts`, `api/v1/files` |
| Payout accounts | Bank account numbers are AES-256-GCM encrypted. Users only ever see the last 4 digits. Staff reveal the full number one request at a time, and every reveal is audit-logged. | `server/payouts.ts` |
| Seller ID documents | Private `verification/` storage. Only the uploading seller and marketplace moderators can open them (support agents can't), and every moderator view is audit-logged. | `api/v1/files` |
| Data exposure | API responses use explicit selects or strip internal fields (moderation evidence, provider keys, checkout URLs). Tests assert that no password hash or 2FA secret is returned. | |
| Audit | Logins, failed logins, 2FA changes, role and status changes, payments, refunds, moderation, settings and exports. | `audit_logs` |
| Privacy | Data minimisation, account deletion with anonymisation (financial records kept in pseudonymised form), cookies limited to the session cookie. | `account.ts` |
| CSV exports | Formula-injection neutralised. | `api/v1/admin/export` |
| Open redirect | Post-login `next` only accepts same-site relative paths. | `auth-forms.tsx` |

## Pre-launch checklist

- [ ] `NODE_ENV=production`, and `sandbox` isn't in `PAYMENT_PROVIDERS`
- [ ] `APP_ENCRYPTION_KEY` and `CRON_SECRET` are random and stored in the secret manager
- [ ] HTTPS is enforced and `APP_URL` uses `https://`
- [ ] The database requires SSL, and the app user isn't a superuser
- [ ] Live provider keys are set, webhooks are registered, and a ₦100 live payment and refund has been run end to end
- [ ] The demo seed was **not** run, and the `*@boostsphere.test` accounts don't exist
- [ ] The super admin has 2FA enabled, and every admin or support account has 2FA (enforce by policy)
- [ ] Private object storage is configured and the bucket isn't public
- [ ] Backups and PITR are enabled, and a restore has been tested
- [ ] Legal pages have been reviewed by counsel, and the marketplace settlement model has been confirmed with counsel and your payment provider
- [ ] Error monitoring and uptime alerts are configured
- [ ] Run `npm audit` and update dependencies
- [ ] `STORAGE_DRIVER=s3` points at a **private** bucket, and an upload and download have been tested

## Reporting

Security reports go to the support email configured in Admin → Settings.
