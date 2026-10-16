import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getPublishedService } from "@/server/catalog";
import { getAuth } from "@/server/auth/current";
import { getSettings } from "@/server/settings";
import { parseInputFields } from "@/lib/service-inputs";
import { PlatformIcon } from "@/components/platform-icon";
import { OrderForm } from "@/components/client/order-form";
import { Badge, Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const s = await getPublishedService((await params).slug);
  if (!s) return {};
  return { title: s.name, description: s.summary, alternates: { canonical: `/services/${s.slug}` }, openGraph: { title: s.name, description: s.summary } };
}

export default async function ServicePage({ params }: { params: Params }) {
  const { slug } = await params;
  const [s, auth, settings] = await Promise.all([getPublishedService(slug), getAuth(), getSettings()]);
  if (!s) notFound();
  const reviews = await db.review.findMany({ where: { serviceId: s.id, status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { profile: { select: { displayName: true } } } } } });
  const fields = parseInputFields(s.inputFields);
  const lowest = s.packages.length ? Math.min(...s.packages.map((p) => p.priceMinor)) : (s.unitPriceMinor ?? 0);

  // Structured data. No ratings are included unless genuine approved reviews exist.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    description: s.summary,
    serviceType: s.category.name,
    provider: { "@type": "Organization", name: settings.brand.name },
    offers: { "@type": "Offer", priceCurrency: s.currency, price: (lowest / 100).toFixed(2), availability: "https://schema.org/InStock" },
  };

  return (
    <div className="container-page py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/services" className="hover:text-slate-800">
          Services
        </Link>{" "}
        /{" "}
        <Link href={`/platforms/${s.platform.slug}`} className="hover:text-slate-800">
          {s.platform.name}
        </Link>{" "}
        / <span className="text-slate-800">{s.name}</span>
      </nav>
      <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="flex items-center gap-3">
            <PlatformIcon iconKey={s.platform.iconKey} name={s.platform.name} color={s.platform.brandColor} />
            <Badge>{s.category.name}</Badge>
            <Badge tone="blue">{s.estimatedDuration}</Badge>
          </div>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{s.name}</h1>
          <p className="mt-3 text-lg text-slate-600">{s.summary}</p>
          <a href="#order" className="btn-gradient mt-5 w-full py-3 lg:hidden">
            Choose a package &amp; order
          </a>

          <div className="mt-6">
            <Notice tone="blue" title="What to expect">
              {s.outcomeDisclaimer}
            </Notice>
          </div>

          <section className="prose-body mt-8">
            <h2>About this service</h2>
            {s.description.split("\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {s.deliveryNotes && (
              <>
                <h2>Delivery</h2>
                <p>{s.deliveryNotes}</p>
              </>
            )}
            <h2>Eligibility</h2>
            <p>{s.eligibility}</p>
            <h2>Refund &amp; cancellation policy</h2>
            <p>{s.refundable ? s.refundPolicy : `This service is non-refundable once ordered. ${s.refundPolicy}`}</p>
            <h2>Terms</h2>
            <p>{s.terms}</p>
            <h2>Information we&apos;ll need</h2>
            <ul>
              {fields.map((f) => (
                <li key={f.key}>
                  {f.label}
                  {f.required ? "" : " (optional)"}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10" aria-labelledby="rev">
            <h2 id="rev" className="text-xl font-semibold">
              Reviews
            </h2>
            {reviews.length ? (
              <ul className="mt-4 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="card p-5">
                    <p className="text-amber-500" aria-label={`${r.rating} out of 5`}>
                      {"★".repeat(r.rating)}
                    </p>
                    <p className="mt-1 font-semibold">{r.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{r.body}</p>
                    <p className="mt-2 text-xs text-slate-500">{r.user.profile?.displayName?.split(" ")[0]} · verified order</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No reviews yet. Reviews can only be written by customers whose order for this service was completed.</p>
            )}
          </section>
        </div>
        <aside id="order" className="scroll-mt-20 lg:sticky lg:top-24 lg:self-start">
          <OrderForm
            service={{ id: s.id, slug: s.slug, pricingModel: s.pricingModel, minQuantity: s.minQuantity, maxQuantity: s.maxQuantity, unitSize: s.unitSize, unitLabel: s.unitLabel }}
            packages={s.packages.map((p) => ({ id: p.id, name: p.name, description: p.description, priceMinor: p.priceMinor, currency: p.currency, features: p.features, duration: p.duration }))}
            fields={fields}
            signedIn={Boolean(auth)}
            verified={Boolean(auth?.user.emailVerifiedAt)}
          />
        </aside>
      </div>
    </div>
  );
}
