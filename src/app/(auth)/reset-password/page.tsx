import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/client/auth-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token)
    return (
      <p className="text-slate-700">
        This reset link is incomplete.{" "}
        <Link href="/forgot-password" className="link">
          Request a new one
        </Link>
        .
      </p>
    );
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Choose a new password</h1>
      <ResetPasswordForm token={token} />
    </>
  );
}
