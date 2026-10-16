# Known limitations and open decisions

## Needs credentials or accounts (not verified live in this build)

- **Paystack, Flutterwave and Stripe** adapters follow the providers' published APIs, and their signature checks are unit-tested. They haven't been run against live or test provider accounts, because no credentials were available. Run a test-mode payment and refund for each provider before launch.
- **Transactional email** is delivered only when `RESEND_API_KEY` is set. Until then, emails are logged to the console and `email_outbox`.

## Business and legal decisions

- **Marketplace settlement model.** The platform collects buyer payments and holds seller proceeds until transfer verification. This isn't escrow and isn't labelled as escrow. Confirm the legal basis with counsel and your payment provider, or move to provider split payments or a licensed escrow partner.
- **Which assets are transferable.** Marketplace categories are enabled per platform, and the seed enables YouTube (Brand Accounts), Facebook Pages, Telegram channels, LinkedIn Pages and Instagram (business portfolio assets). Review each platform's current terms before enabling any of them. Instagram, TikTok, X and Snapchat restrict the sale of personal accounts.
- **Legal pages** are templates and need lawyer review.
- **Advertising spend.** Packages describe an included ad budget. Decide how you buy ad inventory (your own ad accounts versus the client's), and confirm VAT treatment of pass-through ad spend.

## Functional gaps

- **Withdrawals are paid manually.** Users request a withdrawal (funds are held), and an admin sends the bank transfer and marks it paid with the reference. Paystack Transfers could automate the sending later.
- **No third-party fulfillment adapters** ship. `PROVIDER_API` services fall back to the manual queue.
- **Exchange rates.** Prices are set per currency on each package or service. There's no automatic FX conversion.
- **S3 storage** is implemented (`STORAGE_DRIVER=s3`) but hasn't been run against a real bucket. Test an upload and download on your provider before launch.
- **Seller identity documents** are uploaded to private storage and reviewed by hand. There's no automated KYC or ID-verification provider.
- **Rate limiting** is database-backed. It's fine for moderate traffic, so consider Redis at scale.
- **Admin service editor** takes customer input fields as JSON (validated, with errors shown). A drag-and-drop field builder would be friendlier.
- **Notifications** are in-app plus email. There's no SMS or WhatsApp channel.
- **Analytics** cover a single currency per view, defaulting to NGN.
