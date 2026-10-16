import Link from "next/link";
import { getSettings } from "@/server/settings";
import { listPublishedPlatforms } from "@/server/catalog";
import { Logo } from "./site-header";

export async function SiteFooter() {
  const [s, platforms] = await Promise.all([getSettings(), listPublishedPlatforms()]);
  const cols = [
    { title: "Services", links: platforms.slice(0, 6).map((p) => ({ href: `/platforms/${p.slug}`, label: p.name })).concat([{ href: "/services", label: "All services" }]) },
    { title: "Company", links: [ { href: "/about", label: "About us" }, { href: "/how-it-works", label: "How it works" }, { href: "/pricing", label: "Pricing" }, { href: "/contact", label: "Contact" } ] },
    { title: "Support", links: [ { href: "/faq", label: "Help center" }, { href: "/marketplace", label: "Marketplace" }, { href: "/dashboard/support", label: "Support tickets" } ] },
    { title: "Legal", links: [ { href: "/legal/terms", label: "Terms of Service" }, { href: "/legal/privacy", label: "Privacy Policy" }, { href: "/legal/refunds", label: "Refund Policy" }, { href: "/legal/acceptable-use", label: "Acceptable Use" } ] },
  ];
  return (
    <footer className="mt-24 border-t border-slate-200 bg-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-6">
        <div className="md:col-span-2">
          <Logo name={s.brand.name} mark={s.brand.logoText} />
          <p className="mt-4 max-w-xs text-sm text-slate-600">{s.brand.tagline}. Authorized promotion only — no bots, no fake engagement, no credential sharing.</p>
          <p className="mt-4 text-sm text-slate-600">
            <a className="link" href={`mailto:${s.brand.supportEmail}`}>
              {s.brand.supportEmail}
            </a>
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-semibold text-slate-900">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-slate-600 hover:text-slate-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-slate-500 md:flex-row md:justify-between">
          <p>
            © {new Date().getFullYear()} {s.brand.companyLegalName}. All rights reserved.
          </p>
          <p>Platform names and logos are trademarks of their respective owners. {s.brand.name} is not affiliated with or endorsed by them.</p>
        </div>
      </div>
    </footer>
  );
}
