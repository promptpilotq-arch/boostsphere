import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings, type SiteSettings } from "@/server/settings";
import { Notice, PageHeader } from "@/components/ui";

type Doc = { title: string; sections: [string, string[]][] };

const docs = (s: SiteSettings): Record<string, Doc> => ({
  terms: {
    title: "Terms of Service",
    sections: [
      ["1. Who we are", [`These terms govern your use of ${s.brand.name}, operated by ${s.brand.companyLegalName} (“we”, “us”).`]],
      ["2. Your account", ["You must provide accurate information and keep your login secure. You are responsible for activity on your account. You must be at least 18, or the age of majority where you live."]],
      [
        "3. Promotion services",
        [
          "Services are delivered using authorized methods such as the platform's official advertising tools, disclosed creator partnerships, optimization and consulting.",
          "We do not provide bots, fake accounts, purchased engagement or any activity that violates a platform's rules. Promotion increases visibility to real audiences; specific outcomes (followers, views, sales) are not guaranteed.",
          "You confirm you own or are authorized to promote any content you submit and that it complies with the platform's policies and applicable law.",
        ],
      ],
      [
        "4. Payments",
        [
          "Prices are shown in the listed currency and include an itemised breakdown before payment. Orders are confirmed only once the payment provider confirms successful payment to us server-to-server.",
          "Card and bank details are handled by licensed payment providers; we do not store them.",
        ],
      ],
      [
        "5. Marketplace",
        [
          "The marketplace lists only digital assets whose transfer is permitted by the relevant platform and authorized by the owner. Sellers must pass verification; listings are moderated.",
          "Transfers take place only through the platform's official procedures. Neither party may request or share passwords, recovery codes, 2FA codes or session data.",
          `${s.brand.name} collects the buyer's payment and holds the seller's proceeds until transfer steps are verified. This settlement hold is an operational practice of ${s.brand.name}; it is not a licensed escrow service and does not create a trust or escrow arrangement unless explicitly stated otherwise in a separate written agreement.`,
          "Disputes are reviewed by our team, whose decision on release or refund of funds held by us is final as between the parties, without prejudice to your statutory rights.",
        ],
      ],
      ["6. Wallet", ["Wallet balances are records of funds or promotional credit held by us for use on the platform. Promotional credit has no cash value and cannot be withdrawn."]],
      ["7. Prohibited use", ["See the Acceptable Use Policy. We may suspend accounts that breach it."]],
      ["8. Liability", ["To the extent permitted by law, our liability is limited to the amount you paid for the relevant service. Nothing limits liability that cannot be limited by law."]],
      ["9. Changes", ["We may update these terms and will notify you of material changes."]],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["What we collect", ["Account details (email, name, optional phone), order details you provide (public links, campaign goals), payment references from providers (never full card numbers), support messages, and technical logs (IP address, device) for security."]],
      ["What we never collect", ["Passwords or login codes for your social media accounts, session cookies, or private messages."]],
      ["How we use it", ["To provide services, process payments, prevent fraud, provide support, meet legal obligations and — only with your consent — send marketing."]],
      ["Sharing", ["With payment providers to process payments, email providers to send transactional messages, and hosting providers. We do not sell personal data."]],
      ["Retention", ["Account data is kept while your account is active. Financial records are retained for the period required by tax and accounting law, in pseudonymised form after account deletion."]],
      ["Your rights", ["You can access and update your data in your dashboard and request account deletion from Security settings. Under the Nigeria Data Protection Act 2023 and other applicable laws you may also object to processing or lodge a complaint with the regulator."]],
      ["Contact", [`Email ${s.brand.supportEmail}.`]],
    ],
  },
  refunds: {
    title: "Refund Policy",
    sections: [
      ["Service orders", ["Each service lists its own refund terms. In general: full refund if work has not started; a pro-rated refund for undelivered work may be issued once work has begun; advertising spend already paid to a platform is non-refundable."]],
      ["How to request", ["Open the order in your dashboard and choose “Request refund”. Our team reviews every request and records the decision on your order."]],
      ["Where refunds go", ["Refunds go to your original payment method, or to your wallet if you paid from your wallet or choose to. Provider processing times vary (typically 5–10 business days)."]],
      ["Marketplace purchases", ["If the seller does not complete the authorized transfer steps, or the asset is materially not as described, open a dispute. If it is resolved in your favour you receive a full refund and the seller's held proceeds are reversed."]],
      ["Unpaid orders", ["Orders not paid within the payment window are cancelled automatically. No charge is made."]],
    ],
  },
  "acceptable-use": {
    title: "Acceptable Use Policy",
    sections: [
      ["You must not", ["Request or sell bots, fake followers, fake reviews or artificial engagement.", "List or buy stolen, hacked or compromised accounts, or accounts whose transfer the platform prohibits.", "Share, request or upload passwords, recovery codes, 2FA codes or session cookies.", "Promote illegal content, hate speech, scams, or content in categories the platform restricts without authorization.", "Use the service to harass others, evade platform bans or manipulate elections."]],
      ["Enforcement", ["We may refuse orders, remove listings, suspend accounts and report illegal activity to authorities. Report concerns using the report button on any listing or by contacting support."]],
    ],
  },
});

export const dynamic = "force-dynamic";
type Params = Promise<{ doc: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const d = docs(await getSettings())[(await params).doc];
  return d ? { title: d.title } : {};
}

export default async function LegalPage({ params }: { params: Params }) {
  const doc = docs(await getSettings())[(await params).doc];
  if (!doc) notFound();
  return (
    <div className="container-page max-w-3xl py-12">
      <PageHeader title={doc.title} description="Last updated: see repository history" />
      <div className="mb-8">
        <Notice tone="amber" title="Template">
          This is a starting template. Have it reviewed by a qualified lawyer for your jurisdiction and business model before launch.
        </Notice>
      </div>
      <div className="prose-body">
        {doc.sections.map(([h, ps]) => (
          <section key={h}>
            <h2>{h}</h2>
            {ps.length > 1 && h === "You must not" ? (
              <ul>
                {ps.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              ps.map((p) => <p key={p}>{p}</p>)
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
