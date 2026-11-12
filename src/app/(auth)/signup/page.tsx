import type { Metadata } from "next";
import Link from "next/link";
import { signUpAction } from "@/app/actions";
import { AuthForm } from "@/components/layout/auth-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { isLiveMode } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Next you'll set up your business workspace and invoice inbox."
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {!isLiveMode() && (
        <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          Demo Mode: sign-up is disabled until Supabase is configured.{" "}
          <Link href="/dashboard" className="font-medium underline">
            View the demo
          </Link>
          .
        </p>
      )}
      <AuthForm action={signUpAction} submit="Create account" mode="signup" />
    </AuthShell>
  );
}
