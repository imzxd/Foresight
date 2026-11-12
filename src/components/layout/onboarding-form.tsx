"use client";

import { useActionState } from "react";
import { createWorkspaceAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { TimezoneSelect } from "./timezone-select";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Business name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="organization"
        />
      </Field>
      <Field
        label="Reporting timezone"
        htmlFor="timezone"
        hint="Used to decide which months are complete. Reporting currency is CAD."
      >
        <TimezoneSelect id="timezone" />
      </Field>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
