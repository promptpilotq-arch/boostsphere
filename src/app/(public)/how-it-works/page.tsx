import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "How It Works", description: "How ordering promotion services and buying marketplace assets works, step by step." };

const SERVICE_STEPS = [
  ["Choose a service", "Pick a platform, a service and a package. Every service lists its duration, eligibility and refund policy."],
  ["Share public details", "Give us the public link to the content or profile. We never ask for passwords, login codes or cookies."],
  ["Review the price", "Your total — including any coupon, VAT and fees — is calculated on our servers and shown line by line."],
  ["Pay securely", "Pay through a licensed provider such as Paystack, or your wallet balance. Your order is confirmed only after we verify payment with the provider."],
  ["We deliver", "Our team runs the campaign through official tools or prepares your deliverable, updating the order timeline as work progresses."],
  ["Review results", "You receive evidence of completion (e.g. the platform's campaign report). Request a refund if something went wrong."],
];

const MARKET_STEPS = [
  ["Verified sellers list assets", "Sellers pass identity verification and confirm the platform permits transfer. Every listing is moderated."],
  ["You buy", "Accept the terms and pay. The listing is reserved for you, and the seller's proceeds are held on the platform."],
  ["Official transfer", "The seller transfers ownership using the platform's own tools (e.g. Meta Business Settings, Brand Account ownership). Each step is evidenced and confirmed."],
  ["Verification & completion", "An administrator verifies the final step. Only then are proceeds released to the seller."],
  ["Disputes", "If something goes wrong, open a dispute. Completion is blocked until an administrator resolves it."],
];

function Steps({ steps }: { steps: string[][] }) {
  return (
    <ol className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {steps.map(([t, b], i) => (
        <li key={t} className="card p-6">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">{i + 1}</span>
          <h3 className="mt-3 font-semibold">{t}</h3>
          <p className="mt-1 text-sm text-slate-600">{b}</p>
        </li>
      ))}
    </ol>
  );
}

export default function HowItWorks() {
  return (
    <div className="container-page py-12">
      <PageHeader title="How it works" description="Clear steps, verified payments, and authorized methods only." />
      <section aria-labelledby="svc">
        <h2 id="svc" className="text-xl font-bold">
          Ordering a promotion service
        </h2>
        <Steps steps={SERVICE_STEPS} />
      </section>
      <section className="mt-14" aria-labelledby="mk">
        <h2 id="mk" className="text-xl font-bold">
          Buying on the marketplace
        </h2>
        <Steps steps={MARKET_STEPS} />
        <p className="mt-6 max-w-3xl text-sm text-slate-600">
          Note: holding seller proceeds until verification is a platform settlement practice, not a regulated escrow service. See our{" "}
          <Link href="/legal/terms" className="link">
            Terms
          </Link>{" "}
          for details.
        </p>
      </section>
      <div className="mt-12 flex gap-3">
        <Link href="/services" className="btn-gradient">
          Explore services
        </Link>
        <Link href="/marketplace" className="btn-secondary">
          Browse marketplace
        </Link>
      </div>
    </div>
  );
}
