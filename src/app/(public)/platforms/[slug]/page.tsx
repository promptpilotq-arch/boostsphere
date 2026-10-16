import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { searchServices } from "@/server/catalog";
import { ServiceCard } from "@/components/cards";
import { PlatformIcon } from "@/components/platform-icon";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  const p = await db.socialPlatform.findUnique({ where: { slug }, include: { categories: { orderBy: { sortOrder: "asc" } }, faqs: { where: { published: true }, orderBy: { sortOrder: "asc" } } } });
  return p && p.status === "PUBLISHED" ? p : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: `${p.name} services`, description: p.tagline, alternates: { canonical: `/platforms/${p.slug}` } } : {};
}

export default async function PlatformPage({ params, searchParams }: { params: Params; searchParams: Promise<{ category?: string }> }) {
  const { slug } = await params;
  const { category } = await searchParams;
  const p = await load(slug);
  if (!p) notFound();
  const services = await searchServices({ platform: slug, category, pageSize: 48 });

  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="container-page py-12">
          <nav className="mb-6 text-sm text-slate-500" aria-label="Breadcrumb">
            <Link href="/services" className="hover:text-slate-800">
              Services
            </Link>{" "}
            / <span className="text-slate-800">{p.name}</span>
          </nav>
          <div className="flex items-center gap-4">
            <PlatformIcon iconKey={p.iconKey} name={p.name} color={p.brandColor} size="lg" />
            <div>
              <h1 className="text-3xl font-bold">{p.name} services</h1>
              <p className="mt-1 text-slate-600">{p.tagline}</p>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-slate-600">{p.description}</p>
          <div className="mt-6 flex flex-wrap gap-2" role="list" aria-label="Categories">
            <Link role="listitem" href={`/platforms/${p.slug}`} className={`rounded-full border px-3 py-1.5 text-sm ${!category ? "border-brand bg-brand/5 text-brand" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              All
            </Link>
            {p.categories.map((c) => (
              <Link role="listitem" key={c.id} href={`/platforms/${p.slug}?category=${c.slug}`} className={`rounded-full border px-3 py-1.5 text-sm ${category === c.slug ? "border-brand bg-brand/5 text-brand" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <div className="container-page py-10">
        {services.items.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.items.map((s) => (
              <ServiceCard key={s.id} s={s} />
            ))}
          </div>
        ) : (
          <EmptyState title={`No ${p.name} services are published yet`} description="Check back soon, or contact us about a custom campaign." />
        )}

        {p.faqs.length > 0 && (
          <section className="mt-16" aria-labelledby="pfaq">
            <h2 id="pfaq" className="text-xl font-bold">
              {p.name} FAQs
            </h2>
            <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {p.faqs.map((f) => (
                <details key={f.id} className="p-5">
                  <summary className="cursor-pointer font-medium">{f.question}</summary>
                  <p className="mt-2 text-sm text-slate-600">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
