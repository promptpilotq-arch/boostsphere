import Link from "next/link";
import { PlatformIcon } from "./platform-icon";
import { Badge, Money } from "./ui";

type ServiceCardData = {
  slug: string;
  name: string;
  summary: string;
  estimatedDuration: string;
  featured: boolean;
  currency: string;
  fromPriceMinor: number | null;
  pricingModel: string;
  platform: { name: string; iconKey: string; brandColor: string };
  category: { name: string };
};

export function ServiceCard({ s }: { s: ServiceCardData }) {
  return (
    <Link href={`/services/${s.slug}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <PlatformIcon iconKey={s.platform.iconKey} name={s.platform.name} color={s.platform.brandColor} />
        {s.featured && <Badge tone="purple">Featured</Badge>}
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
        {s.platform.name} · {s.category.name}
      </p>
      <h3 className="mt-1 font-semibold text-slate-900 group-hover:text-brand">{s.name}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{s.summary}</p>
      <div className="mt-auto flex items-end justify-between pt-5">
        <div>
          <p className="text-xs text-slate-500">{s.pricingModel === "PER_UNIT" ? "From" : "Packages from"}</p>
          <p className="font-semibold">{s.fromPriceMinor != null ? <Money minor={s.fromPriceMinor} currency={s.currency} /> : "—"}</p>
        </div>
        <p className="text-xs text-slate-500">{s.estimatedDuration}</p>
      </div>
    </Link>
  );
}

type ListingCardData = {
  slug: string;
  title: string;
  niche: string;
  accountType: string;
  askingPriceMinor: number;
  currency: string;
  audienceSize: number | null;
  audienceSizeVerified: boolean;
  status: string;
  platform: { name: string; iconKey: string; brandColor: string };
  seller: { displayName: string; verificationStatus: string; completedSales: number };
};

export function ListingCard({ l }: { l: ListingCardData }) {
  return (
    <Link href={`/marketplace/${l.slug}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-3">
        <PlatformIcon iconKey={l.platform.iconKey} name={l.platform.name} color={l.platform.brandColor} size="sm" />
        <span className="text-sm font-medium text-slate-600">{l.platform.name}</span>
        <Badge className="ml-auto">{l.accountType.toLowerCase()}</Badge>
      </div>
      <h3 className="mt-3 font-semibold text-slate-900 group-hover:text-brand">{l.title}</h3>
      <p className="mt-1 text-sm text-slate-600">{l.niche}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Audience</dt>
          <dd className="font-medium">
            {l.audienceSize != null ? l.audienceSize.toLocaleString() : "Not stated"}
            <span className="ml-1 text-xs font-normal text-slate-500">{l.audienceSize != null ? (l.audienceSizeVerified ? "(verified)" : "(seller-reported)") : ""}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Seller</dt>
          <dd className="truncate font-medium">
            {l.seller.displayName}
            {l.seller.verificationStatus === "VERIFIED" && <span className="ml-1 text-xs text-emerald-700">✓ ID checked</span>}
          </dd>
        </div>
      </dl>
      <div className="mt-auto flex items-end justify-between pt-5">
        <Money minor={l.askingPriceMinor} currency={l.currency} className="text-lg font-bold" />
        {l.status !== "APPROVED" && <Badge tone="amber">{l.status === "SOLD" ? "Sold" : "Reserved"}</Badge>}
      </div>
    </Link>
  );
}
