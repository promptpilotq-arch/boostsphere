import Link from "next/link";
import type { ReactNode } from "react";
import { getSettings } from "@/server/settings";
import { ActionButton } from "./client/action-button";
import { NavLinks } from "./client/nav-links";
import { Logo } from "./site-header";

export type NavItem = { href: string; label: string; badge?: number };

/** Shared dashboard chrome: sidebar on desktop, scrollable tab bar on mobile. */
export async function AppShell({ nav, title, user, children, adminLink }: { nav: NavItem[]; title: string; user: { displayName: string; email: string }; children: ReactNode; adminLink?: { href: string; label: string } }) {
  const s = await getSettings();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Home">
              <Logo name={s.brand.name} mark={s.brand.logoText} />
            </Link>
            <span className="hidden rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 sm:inline">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {adminLink && (
              <Link href={adminLink.href} className="btn-ghost hidden sm:inline-flex">
                {adminLink.label}
              </Link>
            )}
            <span className="hidden text-right text-sm leading-tight md:block">
              <span className="block font-medium text-slate-900">{user.displayName}</span>
              <span className="block text-xs text-slate-500">{user.email}</span>
            </span>
            <ActionButton endpoint="/api/v1/auth/logout" className="btn-secondary" redirect="/" hardRedirect>
              Sign out
            </ActionButton>
          </div>
        </div>
        <nav className="overflow-x-auto border-t border-slate-100 px-2 lg:hidden" aria-label={`${title} navigation`}>
          <NavLinks items={nav} variant="tabs" />
        </nav>
      </header>
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 lg:block">
          <nav aria-label={`${title} navigation`}>
            <NavLinks items={nav} variant="sidebar" />
          </nav>
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
