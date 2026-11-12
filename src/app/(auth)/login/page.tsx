import type { Metadata } from "next";
import Link from "next/link";
import { signInAction } from "@/app/actions";
import { AuthForm } from "@/components/layout/auth-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { isLiveMode } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in"
      subtitle="From invoices to insights. Automatically."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {!isLiveMode() && (
        <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          Demo Mode: authentication isn&apos;t configured.{" "}
          <Link href="/dashboard" className="font-medium underline">
            Explore the fictional demo
          </Link>
          .
        </p>
      )}
      <AuthForm action={signInAction} submit="Sign in" mode="signin" />
    </AuthShell>
  );
}
