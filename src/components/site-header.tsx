import Link from "next/link";
import { getAuth } from "@/server/auth/current";
import { isStaff } from "@/server/auth/rbac";
import { listPublishedPlatforms } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { PlatformIcon } from "./platform-icon";

export async function Logo({ name, mark }: { name: string; mark: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-sm font-bold text-white shadow-sm" aria-hidden>
        {mark}
      </span>
      <span className="text-lg font-bold tracking-tight text-slate-900">{name}</span>
    </span>
  );
}

export async function SiteHeader() {
  const [settings, auth, platforms] = await Promise.all([getSettings(), getAuth(), listPublishedPlatforms()]);
  const nav = [
    { href: "/marketplace", label: "Marketplace", show: settings.features.marketplaceEnabled },
    { href: "/how-it-works", label: "How It Works", show: true },
    { href: "/pricing", label: "Pricing", show: true },
    { href: "/faq", label: "Help Center", show: true },
  ].filter((n) => n.show);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label={`${settings.brand.name} home`}>
          <Logo name={settings.brand.name} mark={settings.brand.logoText} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          <details className="group relative">
            <summary className="btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              Services
              <svg className="h-4 w-4 transition group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
              </svg>
            </summary>
            <div className="absolute left-0 mt-2 w-[520px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="grid grid-cols-2 gap-1">
                {platforms.map((p) => (
                  <Link key={p.id} href={`/platforms/${p.slug}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">
                    <PlatformIcon iconKey={p.iconKey} name={p.name} color={p.brandColor} size="sm" />
                    <span className="text-sm font-medium text-slate-800">{p.name}</span>
                  </Link>
                ))}
              </div>
              <Link href="/services" className="mt-2 block rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-brand hover:bg-slate-100">
                Browse all services →
              </Link>
            </div>
          </details>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="btn-ghost">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {auth ? (
            <>
              {isStaff(auth.user.roles) && (
                <Link href="/admin" className="btn-ghost">
                  Admin
                </Link>
              )}
              <Link href="/dashboard" className="btn-primary">
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Log in
              </Link>
              <Link href="/register" className="btn-gradient">
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile navigation: native <details> works without JavaScript and is keyboard accessible. */}
        <details className="group lg:hidden">
          <summary className="btn-ghost cursor-pointer list-none px-2 [&::-webkit-details-marker]:hidden" aria-label="Open menu">
            <svg className="h-6 w-6 group-open:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg className="hidden h-6 w-6 group-open:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </summary>
          <div className="absolute inset-x-0 top-16 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-slate-200 bg-white px-4 pb-6 pt-2 shadow-lg">
            <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Services</p>
            <div className="grid grid-cols-2 gap-1">
              {platforms.map((p) => (
                <Link key={p.id} href={`/platforms/${p.slug}`} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-50">
                  <PlatformIcon iconKey={p.iconKey} name={p.name} color={p.brandColor} size="sm" />
                  {p.name}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-col border-t border-slate-100 pt-3">
              <Link href="/services" className="rounded-lg px-2 py-2.5 font-medium hover:bg-slate-50">
                All services
              </Link>
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-lg px-2 py-2.5 font-medium hover:bg-slate-50">
                  {n.label}
                </Link>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {auth ? (
                <Link href="/dashboard" className="btn-primary col-span-2">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="btn-secondary">
                    Log in
                  </Link>
                  <Link href="/register" className="btn-gradient">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
