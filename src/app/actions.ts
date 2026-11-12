"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLiveContext } from "@/lib/auth/session";
import { createAdminClient, createUserClient } from "@/lib/db/clients";
import { isLiveMode } from "@/lib/env";
import { markDuplicate, reviewInvoice, type CorrectionInput } from "@/lib/invoices/review";
import { createLivePipelineDeps } from "@/lib/jobs/deps";
import { dispatchProcessing } from "@/lib/jobs/inngest";

export type ActionState = { error?: string; message?: string };

const clean = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function signInAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isLiveMode()) return { error: "Demo Mode is active: authentication is not configured." };
  const db = await createUserClient();
  const { error } = await db.auth.signInWithPassword({
    email: clean(form.get("email")),
    password: clean(form.get("password")),
  });
  if (error) return { error: "Incorrect email or password." };
  redirect("/dashboard");
}

export async function signUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isLiveMode()) return { error: "Demo Mode is active: authentication is not configured." };
  const password = clean(form.get("password"));
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  const db = await createUserClient();
  const { data, error } = await db.auth.signUp({ email: clean(form.get("email")), password });
  if (error) return { error: error.message };
  if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  redirect("/onboarding");
}

export async function signOutAction() {
  if (isLiveMode()) await (await createUserClient()).auth.signOut();
  redirect("/login");
}

export async function createWorkspaceAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isLiveMode()) return { error: "Demo Mode is active." };
  const name = clean(form.get("name"));
  if (name.length < 2 || name.length > 120)
    return { error: "Enter a business name (2–120 characters)." };
  const timezone = clean(form.get("timezone")) || "America/Toronto";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return { error: "Choose a valid timezone." };
  }
  const db = await createUserClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { error } = await db.rpc("create_organization", { org_name: name, org_timezone: timezone });
  if (error)
    return {
      error: error.message.includes("already exists")
        ? "A workspace already exists for this account."
        : "Could not create the workspace.",
    };
  redirect("/dashboard");
}

export async function updateSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireLiveContext();
  const name = clean(form.get("name"));
  const timezone = clean(form.get("timezone"));
  if (name.length < 2 || name.length > 120)
    return { error: "Enter a business name (2–120 characters)." };
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return { error: "Choose a valid timezone." };
  }
  const { error } = await ctx.db
    .from("organizations")
    .update({ name, timezone })
    .eq("id", ctx.org.id);
  if (error) return { error: "Could not save settings." };
  revalidatePath("/", "layout");
  return { message: "Settings saved." };
}

export type ReviewActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  issues?: { code: string; message: string; severity: string }[];
};

export async function reviewInvoiceAction(
  invoiceId: string,
  input: CorrectionInput,
  decision: "save" | "approve",
): Promise<ReviewActionResult> {
  const ctx = await requireLiveContext();
  const result = await reviewInvoice(
    {
      deps: createLivePipelineDeps(),
      orgId: ctx.org.id,
      invoiceId,
      actor: ctx.email || ctx.userId,
    },
    input,
    decision,
  );
  revalidatePath("/", "layout");
  if (!result.ok) return { ok: false, error: result.error, issues: result.issues };
  return {
    ok: true,
    message:
      decision === "approve" ? "Invoice approved and included in totals." : "Corrections saved.",
  };
}

export async function markDuplicateAction(invoiceId: string): Promise<ReviewActionResult> {
  const ctx = await requireLiveContext();
  const result = await markDuplicate({
    deps: createLivePipelineDeps(),
    orgId: ctx.org.id,
    invoiceId,
    actor: ctx.email || ctx.userId,
  });
  revalidatePath("/", "layout");
  return result.ok
    ? { ok: true, message: "Marked as duplicate and excluded from totals." }
    : { ok: false, error: result.error };
}

export async function retryProcessingAction(invoiceId: string): Promise<ReviewActionResult> {
  const ctx = await requireLiveContext();
  // Ownership check through RLS-scoped client before using the service role.
  const { data } = await ctx.db
    .from("invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!data || data.status !== "failed")
    return { ok: false, error: "Only failed invoices can be retried." };
  await createAdminClient().from("invoices").update({ status: "received" }).eq("id", invoiceId);
  await dispatchProcessing(ctx.org.id, invoiceId);
  revalidatePath("/", "layout");
  return { ok: true, message: "Processing restarted." };
}
