import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RegisterForm } from "@/components/client/auth-forms";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage() {
  const s = await getSettings();
  if (!s.features.registrationsOpen) return <p className="text-slate-700">Registrations are currently closed. Please check back later.</p>;
  return (
    <>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Free to join. Verify your email to start ordering.</p>
      <Suspense>
        <RegisterForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </>
  );
}
