import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/client/auth-forms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Forgot your password?</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Enter your email and we&apos;ll send a reset link if an account exists.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="link">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
