import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Help Center & FAQ", description: "Answers about services, payments, refunds and marketplace transfers." };
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const faqs = await db.faqItem.findMany({ where: { published: true }, orderBy: [{ platformId: "asc" }, { sortOrder: "asc" }], include: { platform: true } });
  const general = faqs.filter((f) => !f.platformId);
  const byPlatform = new Map<string, typeof faqs>();
  for (const f of faqs.filter((f) => f.platform)) byPlatform.set(f.platform!.name, [...(byPlatform.get(f.platform!.name) ?? []), f]);
  const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: general.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) };

  const List = ({ items }: { items: typeof faqs }) => (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {items.map((f) => (
        <details key={f.id} className="p-5">
          <summary className="cursor-pointer font-medium">{f.question}</summary>
          <p className="mt-2 text-sm text-slate-600">{f.answer}</p>
        </details>
      ))}
    </div>
  );

  return (
    <div className="container-page max-w-4xl py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHeader
        title="Help Center"
        description={
          <>
            Can&apos;t find an answer?{" "}
            <Link href="/dashboard/support/new" className="link">
              Open a support ticket
            </Link>{" "}
            or{" "}
            <Link href="/contact" className="link">
              contact us
            </Link>
            .
          </>
        }
      />
      <h2 className="mb-3 text-lg font-semibold">General</h2>
      <List items={general} />
      {[...byPlatform.entries()].map(([name, items]) => (
        <section key={name} className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">{name}</h2>
          <List items={items} />
        </section>
      ))}
    </div>
  );
}
