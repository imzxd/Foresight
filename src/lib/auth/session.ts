import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/db/clients";
import { DEMO_ORG } from "@/lib/demo/data";
import { isLiveMode } from "@/lib/env";

export type OrgInfo = { id: string; name: string; timezone: string };

export type AppContext =
  | { mode: "demo"; org: OrgInfo }
  | { mode: "live"; db: SupabaseClient; userId: string; email: string; org: OrgInfo };

/** The signed-in user (verified with the auth server, not just the cookie) or null. */
export async function getUser() {
  if (!isLiveMode()) return null;
  const db = await createUserClient();
  const { data } = await db.auth.getUser();
  return data.user ? { db, user: data.user } : null;
}

/**
 * Resolves who is acting and for which organization. The organization always comes from the user's
 * RLS-protected membership row, never from a browser-supplied id.
 */
export async function requireContext(): Promise<AppContext> {
  if (!isLiveMode())
    return {
      mode: "demo",
      org: { id: DEMO_ORG.id, name: DEMO_ORG.name, timezone: DEMO_ORG.timezone },
    };
  const session = await getUser();
  if (!session) redirect("/login");
  const { db, user } = session;
  const { data } = await db
    .from("organization_members")
    .select("organizations ( id, name, timezone )")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const org = (data?.organizations as unknown as OrgInfo | null) ?? null;
  if (!org) redirect("/onboarding");
  return { mode: "live", db, userId: user.id, email: user.email ?? "", org };
}

export async function requireLiveContext(): Promise<Extract<AppContext, { mode: "live" }>> {
  const ctx = await requireContext();
  if (ctx.mode !== "live") throw new Error("This action is unavailable in Demo Mode.");
  return ctx;
}

/** Like requireContext but returns null instead of redirecting (for API routes). */
export async function getLiveContextOrNull(): Promise<Extract<
  AppContext,
  { mode: "live" }
> | null> {
  const session = await getUser();
  if (!session) return null;
  const { db, user } = session;
  const { data } = await db
    .from("organization_members")
    .select("organizations ( id, name, timezone )")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const org = (data?.organizations as unknown as OrgInfo | null) ?? null;
  return org ? { mode: "live", db, userId: user.id, email: user.email ?? "", org } : null;
}
