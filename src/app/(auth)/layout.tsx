import Link from "next/link";
import type { ReactNode } from "react";
import { getSettings } from "@/server/settings";
import { Logo } from "@/components/site-header";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const s = await getSettings();
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-slate-100 px-4 py-12">
      <Link href="/" className="mb-8" aria-label={`${s.brand.name} home`}>
        <Logo name={s.brand.name} mark={s.brand.logoText} />
      </Link>
      <div className="card w-full max-w-md p-6 sm:p-8">{children}</div>
      <p className="mt-6 text-center text-xs text-slate-500">We never ask for your social media passwords.</p>
    </main>
  );
}
