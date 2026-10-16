import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { listPublishedPlatforms, searchServices } from "@/server/catalog";
import { searchListings } from "@/server/listings-query";
import { PlatformIcon } from "@/components/platform-icon";
import { ListingCard, ServiceCard } from "@/components/cards";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";

const BENEFITS = [
  { title: "Authorized methods only", body: "Campaigns run through each platform's official advertising and partnership tools. No bots, no fake engagement." },
  { title: "We never ask for passwords", body: "Orders need only public links. Marketplace transfers use the platform's own ownership tools." },
  { title: "Transparent pricing", body: "Every total is calculated on our servers, with taxes and fees itemised before you pay." },
  { title: "Track every step", body: "A live status timeline for each order, with notifications as work progresses." },
  { title: "Verified sellers & moderation", body: "Marketplace sellers are identity-checked and every listing is reviewed before it goes live." },
  { title: "Real support", body: "Ticket-based support, refund requests and dispute review by our team." },
];

export default async function HomePage() {
  const [s, platforms, featured, listings, faqs, reviews] = await Promise.all([
    getSettings(),
    listPublishedPlatforms(),
    searchServices({ pageSize: 6 }),
    searchListings({ pageSize: 3 }),
    db.faqItem.findMany({ where: { platformId: null, published: true }, orderBy: { sortOrder: "asc" }, take: 5 }),
    db.review.findMany({ where: { status: "APPROVED", featured: true }, orderBy: { createdAt: "desc" }, take: 3, include: { user: { select: { profile: { select: { displayName: true } } } } } }),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(60%_50%_at_70%_0%,rgb(var(--brand)/0.12),transparent),radial-gradient(40%_40%_at_10%_20%,rgb(var(--brand-accent)/0.10),transparent)]" aria-hidden />
        <div className="container-page relative grid gap-12 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div className="animate-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> Authorized promotion · Verified marketplace
            </p>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">{s.home.heroHeadline}</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">{s.home.heroSubtext}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/services" className="btn-gradient px-6 py-3 text-base">
                {s.home.primaryCta}
              </Link>
              {s.features.marketplaceEnabled && (
                <Link href="/marketplace" className="btn-secondary px-6 py-3 text-base">
                  {s.home.secondaryCta}
                </Link>
              )}
            </div>
          </div>
          {/* Platform selector */}
          <div className="card p-6 shadow-lg shadow-slate-200/60">
            <p className="text-sm font-semibold text-slate-900">Choose a platform</p>
            <p className="text-sm text-slate-500">See the services available for each network.</p>
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {platforms.map((p) => (
                <li key={p.id}>
                  <Link href={`/platforms/${p.slug}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-brand/40 hover:bg-slate-50">
                    <PlatformIcon iconKey={p.iconKey} name={p.name} color={p.brandColor} size="sm" />
                    <span className="text-sm font-medium">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {s.home.showSampleContentNotice && (
        <div className="container-page mt-8">
          <Notice tone="amber" title="Development preview">
            Catalog items and marketplace listings marked “[Sample]” are demonstration content, not real offers. No customer reviews or performance statistics are shown until genuine data exists.
          </Notice>
        </div>
      )}

      {/* Popular services */}
      <section className="container-page mt-20" aria-labelledby="popular">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="popular" className="text-2xl font-bold sm:text-3xl">
              Popular services
            </h2>
            <p className="mt-2 text-slate-600">Promotion, creator marketing, optimization and consulting.</p>
          </div>
          <Link href="/services" className="link hidden sm:inline">
            View all →
          </Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.items.map((svc) => (
            <ServiceCard key={svc.id} s={svc} />
          ))}
        </div>
      </section>

      {/* Marketplace */}
      {s.features.marketplaceEnabled && (
        <section className="container-page mt-20" aria-labelledby="market">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="market" className="text-2xl font-bold sm:text-3xl">
                Marketplace
              </h2>
              <p className="mt-2 max-w-2xl text-slate-600">Moderated listings from verified sellers, transferred only through each platform&apos;s official ownership tools.</p>
            </div>
            <Link href="/marketplace" className="link hidden sm:inline">
              Browse marketplace →
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.items.length ? listings.items.map((l) => <ListingCard key={l.id} l={l} />) : <p className="text-slate-600">No listings are available right now.</p>}
          </div>
        </section>
      )}

      {/* Benefits */}
      <section className="container-page mt-20" aria-labelledby="why">
        <h2 id="why" className="text-2xl font-bold sm:text-3xl">
          Why {s.brand.name}
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="card p-6">
              <div className="mb-3 h-1 w-10 rounded-full bg-gradient-to-r from-brand to-brand-accent" aria-hidden />
              <h3 className="font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials — genuine, moderated reviews from completed orders only */}
      <section className="container-page mt-20" aria-labelledby="reviews">
        <h2 id="reviews" className="text-2xl font-bold sm:text-3xl">
          What customers say
        </h2>
        {reviews.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {reviews.map((r) => (
              <figure key={r.id} className="card p-6">
                <p className="text-amber-500" aria-label={`${r.rating} out of 5 stars`}>
                  {"★".repeat(r.rating)}
                  <span className="text-slate-200">{"★".repeat(5 - r.rating)}</span>
                </p>
                <blockquote className="mt-3 text-slate-700">
                  <p className="font-semibold">{r.title}</p>
                  <p className="mt-1 text-sm">{r.body}</p>
                </blockquote>
                <figcaption className="mt-4 text-sm text-slate-500">— {r.user.profile?.displayName?.split(" ")[0] ?? "Verified customer"}, verified order</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Reviews appear here once customers with completed orders share their experience. We only publish genuine, moderated reviews.
          </p>
        )}
      </section>

      {/* FAQ */}
      <section className="container-page mt-20" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-bold sm:text-3xl">
          Frequently asked questions
        </h2>
        <div className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {faqs.map((f) => (
            <details key={f.id} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
                {f.question}
                <span className="ml-4 text-slate-400 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-slate-600">{f.answer}</p>
            </details>
          ))}
        </div>
        <Link href="/faq" className="link mt-4 inline-block">
          Visit the help center →
        </Link>
      </section>

      {/* CTA */}
      <section className="container-page mt-20">
        <div className="rounded-3xl bg-gradient-to-r from-brand to-brand-accent px-6 py-12 text-center text-white sm:px-12">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to grow with confidence?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Create a free account to order services, track progress and manage purchases in one place.</p>
          <Link href="/register" className="btn mt-6 bg-white px-6 py-3 text-base text-slate-900 hover:bg-slate-100">
            Get Started
          </Link>
        </div>
      </section>
    </>
  );
}
