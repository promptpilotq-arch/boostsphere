import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/server/settings";
import { PlatformIcon } from "@/components/platform-icon";
import { Money, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Pricing", description: "Transparent pricing for promotion, creator marketing, optimization and consulting services." };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [s, platforms] = await Promise.all([
    getSettings(),
    db.socialPlatform.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { sortOrder: "asc" },
      include: { services: { where: { status: "PUBLISHED" }, orderBy: { sortOrder: "asc" }, include: { packages: { where: { active: true }, orderBy: { priceMinor: "asc" } } } } },
    }),
  ]);
  return (
    <div className="container-page py-12">
      <PageHeader
        title="Pricing"
        description={
          <>
            Prices are in {s.commerce.baseCurrency}. {s.commerce.taxEnabled ? `${s.commerce.taxLabel} at ${s.commerce.taxRateBps / 100}% is added at checkout. ` : ""}
            {s.commerce.processingFeeBps || s.commerce.processingFeeFixedMinor ? "A processing fee applies and is shown before you pay. " : "No hidden processing fees. "}
            Marketplace purchases carry a {s.commerce.marketplaceBuyerFeeBps / 100}% buyer service fee.
          </>
        }
      />
      <div className="space-y-8">
        {platforms
          .filter((p) => p.services.length)
          .map((p) => (
            <section key={p.id} className="card overflow-hidden" aria-labelledby={`p-${p.slug}`}>
              <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
                <PlatformIcon iconKey={p.iconKey} name={p.name} color={p.brandColor} size="sm" />
                <h2 id={`p-${p.slug}`} className="font-semibold">
                  {p.name}
                </h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {p.services.map((svc) => (
                  <li key={svc.id} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={`/services/${svc.slug}`} className="font-medium hover:text-brand">
                      {svc.name}
                    </Link>
                    <span className="text-sm text-slate-600">
                      {svc.pricingModel === "PER_UNIT" && svc.unitPriceMinor != null ? (
                        <>
                          <Money minor={svc.unitPriceMinor} currency={svc.currency} /> per {svc.unitSize > 1 ? `${svc.unitSize} ` : ""}
                          {svc.unitLabel.replace(/s$/, "")}
                        </>
                      ) : (
                        svc.packages.map((pk) => (
                          <span key={pk.id} className="ml-3 inline-block">
                            {pk.name}: <Money minor={pk.priceMinor} currency={pk.currency} className="font-medium text-slate-900" />
                          </span>
                        ))
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
