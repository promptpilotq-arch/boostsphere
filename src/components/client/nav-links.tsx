"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

export function NavLinks({ items, variant }: { items: Item[]; variant: "sidebar" | "tabs" }) {
  const path = usePathname();
  const active = (href: string) => path === href || (href.split("/").length > 2 && path.startsWith(`${href}/`));
  if (variant === "tabs") {
    return (
      <ul className="flex gap-1 py-2">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={active(i.href) ? "page" : undefined} className={`block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${active(i.href) ? "bg-brand/10 font-semibold text-brand" : "text-slate-600 hover:bg-slate-100"}`}>
              {i.label}
              {i.badge ? <span className="ml-1.5 rounded-full bg-brand px-1.5 text-xs text-white">{i.badge}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="space-y-0.5">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} aria-current={active(i.href) ? "page" : undefined} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${active(i.href) ? "bg-brand/10 font-semibold text-brand" : "text-slate-700 hover:bg-slate-100"}`}>
            {i.label}
            {i.badge ? <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{i.badge}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
