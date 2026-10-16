import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/client/action-button";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

/** The token is submitted by an explicit click (POST), so link scanners that prefetch URLs can't consume it. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold">Verify your email</h1>
      {token ? (
        <>
          <p className="mb-6 mt-2 text-sm text-slate-600">Confirm this is your email address to activate ordering.</p>
          <ActionButton endpoint="/api/v1/auth/email" body={{ token }} className="btn-primary w-full py-3" successMessage="Email verified — thank you!" redirect="/dashboard">
            Confirm my email
          </ActionButton>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          Open the link from your verification email. Need a new one?{" "}
          <Link className="link" href="/dashboard">
            Resend from your dashboard
          </Link>
          .
        </p>
      )}
    </>
  );
}
