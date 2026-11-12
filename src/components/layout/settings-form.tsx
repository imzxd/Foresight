"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { updateSettingsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { TimezoneSelect } from "./timezone-select";

export function SettingsForm({
  name,
  timezone,
  disabled,
}: {
  name: string;
  timezone: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(updateSettingsAction, {});
  useEffect(() => {
    if (state.message) toast.success(state.message);
  }, [state]);
  return (
    <form action={action} className="space-y-4">
      <Field label="Business name" htmlFor="name">
        <Input
          id="name"
          name="name"
          defaultValue={name}
          required
          minLength={2}
          maxLength={120}
          disabled={disabled}
        />
      </Field>
      <Field
        label="Reporting timezone"
        htmlFor="timezone"
        hint="Decides which months are considered complete."
      >
        <TimezoneSelect id="timezone" defaultValue={timezone} />
      </Field>
      <Field
        label="Reporting currency"
        htmlFor="cur"
        hint="CAD is the only reporting currency in this version."
      >
        <Input id="cur" value="CAD" disabled readOnly />
      </Field>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending || disabled}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
