"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/lib/auth/actions";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );

  // Clear the fields once the change succeeds.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <Field label="Current password" htmlFor="cp-current">
        <PasswordInput
          id="cp-current"
          name="current"
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </Field>
      <Field label="New password" htmlFor="cp-new" hint="At least 8 characters">
        <PasswordInput
          id="cp-new"
          name="password"
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </Field>
      <Field label="Confirm new password" htmlFor="cp-confirm">
        <PasswordInput
          id="cp-confirm"
          name="confirm"
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
        {state.ok && (
          <span className="text-sm text-green-600 dark:text-green-400">Password updated.</span>
        )}
        {state.error && (
          <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>
        )}
      </div>
    </form>
  );
}
