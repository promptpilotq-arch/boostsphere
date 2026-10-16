import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "About us" };
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const s = await getSettings();
  return (
    <div className="container-page max-w-3xl py-12">
      <PageHeader title={`About ${s.brand.name}`} />
      <div className="prose-body">
        <p>
          {s.brand.name} helps creators and businesses grow their social presence using methods the platforms themselves allow: official advertising tools, disclosed creator partnerships, expert optimization and honest consulting.
        </p>
        <h2>What we stand for</h2>
        <ul>
          <li>No bots, fake accounts or artificial engagement — ever.</li>
          <li>No credential sharing. We never ask for passwords or login codes.</li>
          <li>Honest expectations. Promotion increases visibility; it cannot guarantee followers, views or sales.</li>
          <li>A marketplace only for assets whose transfer the platform permits, from verified sellers, with moderation and dispute review.</li>
        </ul>
        <h2>Where we operate</h2>
        <p>We are launching in Nigeria with prices in Naira, and serve international customers. {s.brand.companyLegalName}, {s.brand.companyAddress}.</p>
        <p className="text-sm text-slate-500">Operators: edit this page&apos;s company details from Admin → Settings → Brand.</p>
      </div>
    </div>
  );
}
