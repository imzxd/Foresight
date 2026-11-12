import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/layout/onboarding-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getUser } from "@/lib/auth/session";
import { isLiveMode } from "@/lib/env";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage() {
  if (!isLiveMode()) redirect("/dashboard");
  const session = await getUser();
  if (!session) redirect("/login");
  const { data } = await session.db
    .from("organization_members")
    .select("organization_id")
    .limit(1)
    .maybeSingle();
  if (data) redirect("/dashboard");
  return (
    <AuthShell
      title="Set up your business"
      subtitle="We'll create your workspace and a private invoice-receiving address."
    >
      <OnboardingForm />
    </AuthShell>
  );
}
